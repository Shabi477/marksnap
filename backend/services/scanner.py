import cv2
import numpy as np
from PIL import Image
from services.qr_handler import read_qr_code
import os

# Try to import pdf2image — requires poppler installed
try:
    from pdf2image import convert_from_path
    PDF_SUPPORT = True
except ImportError:
    PDF_SUPPORT = False


def process_scan_batch(file_paths: list[str], test, answer_key_map: dict, db) -> list[dict]:
    """
    Process a batch of scanned answer sheet images/PDFs.
    Returns a list of result dicts for each question detected.
    """
    all_results = []
    images = []

    # Convert all files to PIL images
    for path in file_paths:
        ext = os.path.splitext(path)[1].lower()
        if ext == ".pdf":
            if PDF_SUPPORT:
                pages = convert_from_path(path, dpi=200)
                images.extend(pages)
            else:
                raise RuntimeError("PDF support requires poppler. Install poppler-utils.")
        else:
            img = Image.open(path)
            images.append(img)

    # Process each image (each should be one answer sheet page)
    for page_idx, pil_image in enumerate(images):
        page_results = _process_single_page(pil_image, test, answer_key_map, page_idx + 1, db)
        all_results.extend(page_results)

    return all_results


def _process_single_page(pil_image: Image.Image, test, answer_key_map: dict, page_idx: int, db) -> list[dict]:
    """Process a single answer sheet page."""
    results = []

    # Read QR code for student identification
    qr_data = read_qr_code(pil_image)
    student_code = qr_data.get("sid") if qr_data else None
    page_number = qr_data.get("pg", 1) if qr_data else 1

    # Look up student if we got a code
    student_id = None
    if student_code:
        from models import Student
        student = db.query(Student).filter(Student.student_code == student_code).first()
        if student:
            student_id = student.id

    # Convert to OpenCV format
    cv_image = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)

    # Detect alignment markers and correct perspective
    cv_image = _correct_perspective(cv_image)

    # Convert to grayscale and threshold
    gray = cv2.cvtColor(cv_image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    thresh = cv2.adaptiveThreshold(
        blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 2
    )

    # Find all contours (potential bubbles)
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    # Filter contours to find bubbles based on size and circularity
    bubble_contours = _filter_bubble_contours(contours, cv_image.shape)

    if not bubble_contours:
        return results

    # Group bubbles into rows (questions) and columns (options)
    bubble_groups = _group_bubbles(bubble_contours)

    # Determine which sections are on this page
    page_sections = [s for s in test.sections if s.page_number == page_number]
    if not page_sections:
        page_sections = test.sections  # Fallback: try all sections

    # Analyze each question row
    for q_idx, (question_num, bubbles) in enumerate(sorted(bubble_groups.items())):
        # Determine section from question number
        section_name = _find_section_for_question(question_num, page_sections)

        # Analyze which bubble is filled
        selected, confidence = _analyze_bubbles(bubbles, thresh)

        # Check if correct
        key = (question_num, section_name)
        correct_answer = answer_key_map.get(key)
        is_correct = (selected == correct_answer) if selected and correct_answer else None

        results.append({
            "student_id": student_id,
            "student_code": student_code,
            "page_number": page_number,
            "section_name": section_name,
            "question_number": question_num,
            "selected_answer": selected,
            "is_correct": is_correct,
            "confidence": confidence,
        })

    return results


def _correct_perspective(image):
    """Detect alignment markers and correct perspective distortion."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, 50, 255, cv2.THRESH_BINARY_INV)

    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    # Find square-ish contours in the corners (alignment markers)
    h, w = image.shape[:2]
    markers = []

    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < 100 or area > 5000:
            continue

        peri = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.04 * peri, True)

        if len(approx) == 4:
            x, y, bw, bh = cv2.boundingRect(cnt)
            aspect_ratio = bw / float(bh) if bh > 0 else 0
            if 0.7 < aspect_ratio < 1.3:  # Square-ish
                cx = x + bw // 2
                cy = y + bh // 2
                markers.append((cx, cy))

    if len(markers) >= 4:
        # Sort markers into corners
        markers = sorted(markers, key=lambda p: p[0] + p[1])
        top_left = markers[0]
        bottom_right = markers[-1]
        remaining = markers[1:-1]
        top_right = max(remaining, key=lambda p: p[0] - p[1])
        bottom_left = min(remaining, key=lambda p: p[0] - p[1])

        src_pts = np.float32([top_left, top_right, bottom_right, bottom_left])
        dst_pts = np.float32([
            [0, 0], [w, 0], [w, h], [0, h]
        ])

        matrix = cv2.getPerspectiveTransform(src_pts, dst_pts)
        image = cv2.warpPerspective(image, matrix, (w, h))

    return image


def _filter_bubble_contours(contours, image_shape):
    """Filter contours to find likely bubbles based on size and shape."""
    h, w = image_shape[:2]
    min_area = (w * h) * 0.0001  # Minimum bubble area relative to image
    max_area = (w * h) * 0.005

    bubbles = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_area or area > max_area:
            continue

        peri = cv2.arcLength(cnt, True)
        if peri == 0:
            continue
        circularity = 4 * np.pi * area / (peri * peri)

        if circularity > 0.5:  # Reasonably circular
            x, y, bw, bh = cv2.boundingRect(cnt)
            aspect_ratio = bw / float(bh) if bh > 0 else 0
            if 0.6 < aspect_ratio < 1.6:
                bubbles.append({
                    "contour": cnt,
                    "x": x + bw // 2,
                    "y": y + bh // 2,
                    "w": bw,
                    "h": bh,
                    "area": area,
                })

    return bubbles


def _group_bubbles(bubbles):
    """Group bubbles into question rows based on Y position."""
    if not bubbles:
        return {}

    # Sort by Y then X
    bubbles_sorted = sorted(bubbles, key=lambda b: (b["y"], b["x"]))

    # Group by Y position (tolerance based on average bubble height)
    avg_h = np.mean([b["h"] for b in bubbles_sorted])
    y_tolerance = avg_h * 0.6

    rows = []
    current_row = [bubbles_sorted[0]]

    for b in bubbles_sorted[1:]:
        if abs(b["y"] - current_row[-1]["y"]) < y_tolerance:
            current_row.append(b)
        else:
            rows.append(sorted(current_row, key=lambda b: b["x"]))
            current_row = [b]
    rows.append(sorted(current_row, key=lambda b: b["x"]))

    # Convert rows to question_number -> bubbles mapping
    groups = {}
    for i, row in enumerate(rows):
        groups[i + 1] = row

    return groups


def _find_section_for_question(question_num, sections):
    """Find which section a question belongs to."""
    for section in sections:
        start = section.start_question
        end = start + section.num_questions - 1
        if start <= question_num <= end:
            return section.section_name
    return sections[0].section_name if sections else "A"


def _analyze_bubbles(bubbles, thresh_image):
    """Analyze which bubble in a row is filled."""
    if not bubbles:
        return None, 0.0

    fill_ratios = []
    options = ["A", "B", "C", "D", "E"]

    for b in bubbles:
        # Create a mask for this bubble
        mask = np.zeros(thresh_image.shape, dtype=np.uint8)
        cv2.circle(mask, (b["x"], b["y"]), b["w"] // 2, 255, -1)

        # Count filled pixels within the bubble
        filled = cv2.bitwise_and(thresh_image, mask)
        total_pixels = cv2.countNonZero(mask)
        filled_pixels = cv2.countNonZero(filled)

        ratio = filled_pixels / total_pixels if total_pixels > 0 else 0
        fill_ratios.append(ratio)

    if not fill_ratios:
        return None, 0.0

    max_ratio = max(fill_ratios)
    max_idx = fill_ratios.index(max_ratio)

    # Threshold: bubble must be significantly filled
    if max_ratio < 0.3:
        return None, max_ratio  # No bubble filled enough

    # Confidence: how much more filled is the max vs second highest
    sorted_ratios = sorted(fill_ratios, reverse=True)
    if len(sorted_ratios) > 1 and sorted_ratios[1] > 0:
        confidence = 1.0 - (sorted_ratios[1] / sorted_ratios[0])
    else:
        confidence = 1.0

    if max_idx < len(options):
        return options[max_idx], confidence

    return None, 0.0

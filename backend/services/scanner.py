import cv2
import numpy as np
from PIL import Image
from services.qr_handler import read_qr_code
import os
import logging

logger = logging.getLogger(__name__)

# Try to import pdf2image — requires poppler installed
try:
    from pdf2image import convert_from_path
    PDF_SUPPORT = True
except ImportError:
    PDF_SUPPORT = False


def process_scan_batch(file_paths: list[str], test, answer_key_map: dict, db, frontend_qr: dict = None) -> list[dict]:
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
        page_results = _process_single_page(pil_image, test, answer_key_map, page_idx + 1, db, frontend_qr=frontend_qr)
        all_results.extend(page_results)

    return all_results


def _process_single_page(pil_image: Image.Image, test, answer_key_map: dict, page_idx: int, db, frontend_qr: dict = None) -> list[dict]:
    """Process a single answer sheet page."""
    results = []

    # Try backend QR reading first, fall back to frontend-provided QR data
    qr_data = read_qr_code(pil_image)
    if qr_data:
        logger.info(f"Backend QR decoded: {qr_data}")
    elif frontend_qr:
        qr_data = frontend_qr
        logger.info(f"Using frontend QR data: {qr_data}")
    else:
        logger.warning("No QR data from backend or frontend")

    # QR contains tid, sid (school_id), optionally cid, pg, tp
    school_id = qr_data.get("sid") if qr_data else None
    class_id = qr_data.get("cid") if qr_data else None
    page_number = qr_data.get("pg", 1) if qr_data else 1

    # Convert to OpenCV format
    cv_image = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)
    h, w = cv_image.shape[:2]
    logger.info(f"Image dimensions: {w}x{h}")

    # Detect alignment markers and correct perspective
    cv_image = _correct_perspective(cv_image)

    # Convert to grayscale and threshold
    gray = cv2.cvtColor(cv_image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    thresh = cv2.adaptiveThreshold(
        blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 2
    )

    h, w = cv_image.shape[:2]

    # Read student number from bubble grid in the header area (top ~30% of page)
    student_number = _read_student_number(thresh, h, w)
    logger.info(f"Student number read from bubbles: {student_number}")

    # Look up student by student_number, isolated to the school from QR
    student_id = None
    student_code = None
    if student_number:
        from models import Student, ClassGroup, Test as TestModel
        student = None

        if school_id:
            # Direct school-wide lookup using school_id from QR (safest, no cross-school risk)
            student = db.query(Student).filter(
                Student.school_id == school_id,
                Student.student_number == student_number,
            ).first()
            if not student:
                # Fallback: check via class_groups for students without school_id backfilled yet
                school_class_ids = [c.id for c in db.query(ClassGroup.id).filter(
                    ClassGroup.school_id == school_id
                ).all()]
                if school_class_ids:
                    student = db.query(Student).filter(
                        Student.student_number == student_number,
                        Student.class_id.in_(school_class_ids),
                    ).first()
        elif class_id:
            # No school_id in QR but have class_id — derive school from class
            class_group = db.query(ClassGroup).filter(ClassGroup.id == class_id).first()
            if class_group and class_group.school_id:
                student = db.query(Student).filter(
                    Student.school_id == class_group.school_id,
                    Student.student_number == student_number,
                ).first()
            elif class_group:
                student = db.query(Student).filter(
                    Student.class_id == class_id,
                    Student.student_number == student_number,
                ).first()
        else:
            # No school or class in QR — try to derive school from test owner
            test_teacher = test.teacher if hasattr(test, 'teacher') and test.teacher else None
            if test_teacher and test_teacher.school_id:
                student = db.query(Student).filter(
                    Student.school_id == test_teacher.school_id,
                    Student.student_number == student_number,
                ).first()

        if student:
            student_id = student.id
            student_code = student.student_code
            logger.info(f"Student matched: {student.name} (id={student.id}, student_number={student_number}, school_id={school_id})")
        else:
            logger.warning(f"No student with student_number={student_number} in school {school_id or 'unknown'}")

    # Find all contours (potential bubbles) — only in the answer area (below top 30%)
    answer_region_top = int(h * 0.30)
    answer_thresh = thresh[answer_region_top:, :]
    contours, _ = cv2.findContours(answer_thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    logger.info(f"Total contours found in answer region: {len(contours)}")

    # Offset contour Y coordinates back to full-image coordinates
    for cnt in contours:
        cnt[:, :, 1] += answer_region_top

    # Filter contours to find bubbles based on size and circularity
    bubble_contours = _filter_bubble_contours(contours, cv_image.shape)
    logger.info(f"Bubble contours after filtering: {len(bubble_contours)}")

    if not bubble_contours:
        logger.warning("No bubbles detected — returning empty results")
        return results

    # Determine which sections are on this page
    page_sections = [s for s in test.sections if s.page_number == page_number]
    if not page_sections:
        logger.warning(f"No sections found for page {page_number}, using all sections as fallback")
        page_sections = test.sections

    # Use the first section's start_question for correct numbering
    page_start_q = page_sections[0].start_question if page_sections else 1

    # Group bubbles into rows (questions) and columns (options)
    bubble_groups = _group_bubbles(bubble_contours, start_question=page_start_q)
    logger.info(f"Question rows detected: {len(bubble_groups)}, starting at Q{page_start_q}")

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

    logger.info(f"Processed {len(results)} question results for page {page_number}")
    return results


def _read_student_number(thresh_image, img_h, img_w):
    """
    Read the 4-digit student number from the bubble grid in the header area.
    The grid has four rows (Thousands, Hundreds, Tens, Units), each with 10 bubbles (digits 0-9).
    Located in the top ~15%-32% of the page vertically, ~15%-65% horizontally.
    Returns the student number as an integer, or None if unreadable.
    """
    # Crop the student number region from the thresholded image
    y_top = int(img_h * 0.14)
    y_bottom = int(img_h * 0.34)
    x_left = int(img_w * 0.12)
    x_right = int(img_w * 0.70)

    region = thresh_image[y_top:y_bottom, x_left:x_right]
    if region.size == 0:
        logger.warning("Student number region is empty")
        return None

    # Find bubbles in this region
    contours, _ = cv2.findContours(region, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    rh, rw = region.shape[:2]
    min_area = (rh * rw) * 0.002
    max_area = (rh * rw) * 0.06

    bubbles = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_area or area > max_area:
            continue
        peri = cv2.arcLength(cnt, True)
        if peri == 0:
            continue
        circularity = 4 * np.pi * area / (peri * peri)
        if circularity > 0.4:
            x, y, bw, bh = cv2.boundingRect(cnt)
            aspect_ratio = bw / float(bh) if bh > 0 else 0
            if 0.5 < aspect_ratio < 2.0:
                bubbles.append({
                    "contour": cnt,
                    "x": x + bw // 2,
                    "y": y + bh // 2,
                    "w": bw,
                    "h": bh,
                    "area": area,
                })

    logger.info(f"Student number region: found {len(bubbles)} bubble candidates")

    if len(bubbles) < 30:
        logger.warning(f"Not enough bubbles for student number grid (need >=30, found {len(bubbles)})")
        return None

    # Group into rows by Y position
    bubbles_sorted = sorted(bubbles, key=lambda b: (b["y"], b["x"]))
    avg_h = np.mean([b["h"] for b in bubbles_sorted])
    y_tolerance = avg_h * 0.8

    rows = []
    current_row = [bubbles_sorted[0]]
    for b in bubbles_sorted[1:]:
        if abs(b["y"] - current_row[-1]["y"]) < y_tolerance:
            current_row.append(b)
        else:
            rows.append(sorted(current_row, key=lambda b: b["x"]))
            current_row = [b]
    rows.append(sorted(current_row, key=lambda b: b["x"]))

    # Keep only rows with ~10 bubbles (the digit rows)
    digit_rows = [r for r in rows if 8 <= len(r) <= 12]
    logger.info(f"Student number digit rows found: {len(digit_rows)} (sizes: {[len(r) for r in rows]})")

    if len(digit_rows) < 4:
        logger.warning(f"Could not find 4 digit rows for student number (found {len(digit_rows)})")
        return None

    # Take the first 4 qualifying rows (thousands, hundreds, tens, units)
    digit_rows = digit_rows[:4]

    # Read each row — find which bubble has the highest fill ratio
    digits = []
    for row in digit_rows:
        fill_ratios = []
        for b in row:
            mask = np.zeros(region.shape, dtype=np.uint8)
            cv2.circle(mask, (b["x"], b["y"]), b["w"] // 2, 255, -1)
            filled = cv2.bitwise_and(region, mask)
            total_pixels = cv2.countNonZero(mask)
            filled_pixels = cv2.countNonZero(filled)
            ratio = filled_pixels / total_pixels if total_pixels > 0 else 0
            fill_ratios.append(ratio)

        max_ratio = max(fill_ratios)
        if max_ratio < 0.30:
            logger.warning(f"No bubble filled enough in student number row (max fill: {max_ratio:.2f})")
            digits.append(0)
            continue

        max_idx = fill_ratios.index(max_ratio)
        # Map index to digit (0-9)
        digit = min(max_idx, 9)
        digits.append(digit)
        logger.info(f"Student number digit: {digit} (fill ratio: {max_ratio:.2f})")

    student_number = digits[0] * 1000 + digits[1] * 100 + digits[2] * 10 + digits[3]
    if student_number == 0:
        logger.warning("Student number is 0 — likely nothing was shaded")
        return None

    return student_number


def _correct_perspective(image):
    """Detect alignment markers and correct perspective distortion."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, 50, 255, cv2.THRESH_BINARY_INV)

    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    # Find square-ish contours in the corners (alignment markers)
    h, w = image.shape[:2]
    # Scale area thresholds relative to image size
    # A 5mm marker on A4 (210mm wide) takes ~2.4% of width → (0.024*w)^2 ≈ area
    image_area = h * w
    min_marker_area = image_area * 0.00002   # min ~0.002% of image
    max_marker_area = image_area * 0.002     # max ~0.2% of image
    markers = []

    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_marker_area or area > max_marker_area:
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

    logger.info(f"Alignment markers found: {len(markers)} (need 4, area range: {min_marker_area:.0f}-{max_marker_area:.0f})")

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
        logger.info("Perspective correction applied")
    else:
        logger.warning("Not enough alignment markers for perspective correction")

    return image


def _filter_bubble_contours(contours, image_shape):
    """Filter contours to find likely bubbles based on size and shape."""
    h, w = image_shape[:2]
    min_area = (w * h) * 0.00008  # Slightly more lenient minimum
    max_area = (w * h) * 0.008    # Slightly more lenient maximum

    bubbles = []
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_area or area > max_area:
            continue

        peri = cv2.arcLength(cnt, True)
        if peri == 0:
            continue
        circularity = 4 * np.pi * area / (peri * peri)

        if circularity > 0.4:  # More lenient circularity (was 0.5)
            x, y, bw, bh = cv2.boundingRect(cnt)
            aspect_ratio = bw / float(bh) if bh > 0 else 0
            if 0.5 < aspect_ratio < 2.0:  # More lenient aspect ratio
                bubbles.append({
                    "contour": cnt,
                    "x": x + bw // 2,
                    "y": y + bh // 2,
                    "w": bw,
                    "h": bh,
                    "area": area,
                })

    logger.debug(f"Bubble filter: {len(bubbles)} passed (area range: {min_area:.0f}-{max_area:.0f})")
    return bubbles


def _group_bubbles(bubbles, start_question=1):
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
    # start_question allows correct numbering for multi-section/multi-page tests
    groups = {}
    for i, row in enumerate(rows):
        groups[start_question + i] = row

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
    """
    Analyze which bubble in a row is filled.
    Supports answer changes: if a student crosses out a bubble (fills it very
    heavily, >85%), that bubble is treated as cancelled. The intended answer
    is the remaining filled bubble (30-85% fill).
    """
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

    # --- Answer-change detection ---
    # A bubble filled >85% is considered "crossed out" / cancelled by the student.
    # The intended answer is the one filled between 30-85%.
    CANCEL_THRESHOLD = 0.85
    FILL_THRESHOLD = 0.30

    cancelled = [i for i, r in enumerate(fill_ratios) if r >= CANCEL_THRESHOLD]
    filled = [i for i, r in enumerate(fill_ratios) if FILL_THRESHOLD <= r < CANCEL_THRESHOLD]

    if cancelled and filled:
        # Student changed their answer: pick the non-cancelled filled bubble
        if len(filled) == 1:
            idx = filled[0]
            # High confidence — clear correction detected
            confidence = 0.85
            if idx < len(options):
                return options[idx], confidence
        else:
            # Multiple bubbles filled (not cancelled) — ambiguous, pick highest
            best = max(filled, key=lambda i: fill_ratios[i])
            confidence = 0.4  # Low confidence — flag for review
            if best < len(options):
                return options[best], confidence

    # --- Normal detection (no answer change) ---
    max_ratio = max(fill_ratios)
    max_idx = fill_ratios.index(max_ratio)

    # Threshold: bubble must be significantly filled
    if max_ratio < FILL_THRESHOLD:
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

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.lib.colors import black, white, HexColor
from services.qr_handler import generate_qr_code
from PIL import Image
import io
import tempfile
import os

# Layout constants
PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN_LEFT = 15 * mm
MARGIN_TOP = 18 * mm
MARGIN_RIGHT = 15 * mm
MARGIN_BOTTOM = 14 * mm

BUBBLE_RADIUS = 4 * mm
BUBBLE_WIDTH = 4 * mm      # oval width (horizontal)
BUBBLE_HEIGHT = 5.5 * mm   # oval height (vertical) — taller than wide like QuickKey
BUBBLE_SPACING_X = 7.5 * mm
BUBBLE_SPACING_Y = 7.5 * mm
QUESTION_NUM_WIDTH = 14 * mm

BRAND_COLOR = HexColor("#0e7490")  # Dark blue-teal
BRAND_COLOR_LIGHT = HexColor("#cffafe")
BRAND_COLOR_DARK = HexColor("#164e63")

ALIGNMENT_MARKER_SIZE = 5 * mm

# Student number bubble grid constants
STUDENT_NUM_BUBBLE_W = 3.5 * mm
STUDENT_NUM_BUBBLE_H = 5 * mm
STUDENT_NUM_SPACING_X = 7 * mm     # horizontal spacing between digit bubbles
STUDENT_NUM_ROW_SPACING = 7 * mm   # vertical spacing between digit rows

OPTIONS = ["A", "B", "C", "D", "E"]


def _draw_logo_icon(c, x, y, size):
    """Draw the MarkSnap logo icon matching the app SVG."""
    # Rounded teal square background
    c.setFillColor(BRAND_COLOR)
    c.roundRect(x, y, size, size, size * 0.25, fill=1, stroke=0)

    # Scale factor (SVG is 32x32)
    s = size / 32.0

    # Chevron pointing right (SVG: M8 12l4 4-4 4)
    c.setStrokeColor(white)
    c.setLineWidth(2.5 * s)
    c.setLineCap(1)
    c.setLineJoin(1)
    c.line(x + 8 * s, y + size - 12 * s, x + 12 * s, y + size - 16 * s)
    c.line(x + 12 * s, y + size - 16 * s, x + 8 * s, y + size - 20 * s)

    # Vertical scan line (SVG: M16 8v16)
    c.line(x + 16 * s, y + size - 8 * s, x + 16 * s, y + size - 24 * s)

    # Dots (SVG: cx=22, cy=12/20, r=2)
    dot_r = 2 * s
    c.setFillColor(HexColor("#67e8f9"))
    c.circle(x + 22 * s, y + size - 12 * s, dot_r, fill=1, stroke=0)
    c.circle(x + 22 * s, y + size - 20 * s, dot_r, fill=1, stroke=0)

    # Horizontal dash between dots (SVG: M20 16h4)
    c.setStrokeColor(HexColor("#67e8f9"))
    c.setLineWidth(2 * s)
    c.line(x + 20 * s, y + size - 16 * s, x + 24 * s, y + size - 16 * s)


def generate_answer_sheets(test, class_group=None) -> bytes:
    """Generate a single-copy answer sheet template. Teacher prints as many copies as needed.
    class_group is optional — if None, generates a generic sheet without class info."""
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)

    _draw_sheet(c, test, class_group)

    c.save()
    return buffer.getvalue()


def _draw_sheet(c, test, class_group):
    """Draw answer sheet pages for the test (one set of pages)."""
    pages = {}
    for section in test.sections:
        pg = section.page_number
        if pg not in pages:
            pages[pg] = []
        pages[pg].append(section)

    total_pages = len(pages)

    for page_num in sorted(pages.keys()):
        sections = pages[page_num]
        _draw_page(c, test, class_group, sections, page_num, total_pages)
        c.showPage()


def _draw_page(c, test, class_group, sections, page_num, total_pages):
    """Draw a single page of the answer sheet."""
    y = PAGE_HEIGHT - MARGIN_TOP

    _draw_alignment_markers(c)

    # Compact header with QR code inline
    y = _draw_header(c, test, class_group, page_num, total_pages, y)

    # Sections with bubbles
    for section in sections:
        y = _draw_section(c, section, y)

    # Footer
    c.setFont("Helvetica", 7)
    c.setFillColor(HexColor("#6b7280"))
    c.drawCentredString(PAGE_WIDTH / 2, 8 * mm,
                        "MarkSnap  \u2022  Fill bubbles completely with dark pen or pencil  \u2022  Do not fold or crease")


def _draw_alignment_markers(c):
    """Draw filled squares in the four corners for scan alignment."""
    positions = [
        (8 * mm, PAGE_HEIGHT - 8 * mm),
        (PAGE_WIDTH - 8 * mm - ALIGNMENT_MARKER_SIZE, PAGE_HEIGHT - 8 * mm),
        (8 * mm, 8 * mm + ALIGNMENT_MARKER_SIZE),
        (PAGE_WIDTH - 8 * mm - ALIGNMENT_MARKER_SIZE, 8 * mm + ALIGNMENT_MARKER_SIZE),
    ]
    c.setFillColor(black)
    for x, y in positions:
        c.rect(x, y - ALIGNMENT_MARKER_SIZE, ALIGNMENT_MARKER_SIZE, ALIGNMENT_MARKER_SIZE, fill=1, stroke=0)


def _draw_header(c, test, class_group, page_num, total_pages, y):
    """Draw header with QR code, student number bubble grid, and info."""
    content_width = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT
    qr_size = 30 * mm

    # Generate QR code image — encodes test, school, and optionally class info (no student)
    qr_data = {
        "tid": test.id,
        "pg": page_num,
        "tp": total_pages,
    }
    # Always include school_id for safe student lookup isolation
    if class_group and class_group.school_id:
        qr_data["sid"] = class_group.school_id
        qr_data["cid"] = class_group.id
    elif hasattr(test, 'teacher') and test.teacher and test.teacher.school_id:
        qr_data["sid"] = test.teacher.school_id
    qr_img = generate_qr_code(qr_data, box_size=5, border=2)

    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        qr_img.save(tmp, format="PNG")
        tmp_path = tmp.name

    # QR code sits to the right of the brand bar
    qr_x = PAGE_WIDTH - MARGIN_RIGHT - qr_size
    qr_total = qr_size + 3 * mm
    bar_width = qr_x - MARGIN_LEFT - 4 * mm

    # Brand bar (rounded, stops before QR)
    bar_height = 17 * mm
    bar_top = y + 5 * mm
    c.setFillColor(BRAND_COLOR)
    c.roundRect(MARGIN_LEFT, bar_top - bar_height, bar_width, bar_height, 3 * mm, fill=1, stroke=0)

    # Logo icon in the brand bar
    logo_size = 14 * mm
    logo_x = MARGIN_LEFT + 3 * mm
    logo_y = bar_top - bar_height + 1.5 * mm
    _draw_logo_icon(c, logo_x, logo_y, logo_size)

    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(MARGIN_LEFT + 19 * mm, bar_top - bar_height + 6 * mm, "MarkSnap")
    c.setFont("Helvetica", 10)
    c.drawRightString(MARGIN_LEFT + bar_width - 4 * mm, bar_top - bar_height + 6.5 * mm,
                      f"Page {page_num} of {total_pages}")

    # QR code (aligned with brand bar top)
    qr_y = bar_top - qr_size
    c.setStrokeColor(BRAND_COLOR)
    c.setLineWidth(1)
    c.roundRect(qr_x - 1.5 * mm, qr_y - 1.5 * mm, qr_size + 3 * mm, qr_size + 3 * mm, 2 * mm, fill=0, stroke=1)
    c.drawImage(tmp_path, qr_x, qr_y, qr_size, qr_size)
    os.unlink(tmp_path)

    # Move y past whichever is taller (QR or brand bar)
    y = min(bar_top - bar_height, qr_y - 1.5 * mm) - 4 * mm

    # Info + student number box (full width, rounded)
    info_box_height = 52 * mm
    c.setFillColor(BRAND_COLOR_LIGHT)
    c.setStrokeColor(HexColor("#a5f3fc"))
    c.setLineWidth(0.8)
    c.roundRect(MARGIN_LEFT, y - info_box_height, content_width, info_box_height, 3 * mm, fill=1, stroke=1)

    # Row 1: Test name + Class name (if provided)
    c.setFillColor(HexColor("#0c4a6e"))
    c.setFont("Helvetica-Bold", 11)
    row1_y = y - 7 * mm
    c.drawString(MARGIN_LEFT + 5 * mm, row1_y, f"Test: {test.name}")
    if class_group:
        c.drawString(MARGIN_LEFT + content_width / 2, row1_y, f"Class: {class_group.name}")
    else:
        c.setFont("Helvetica", 10)
        c.setFillColor(HexColor("#64748b"))
        c.drawString(MARGIN_LEFT + content_width / 2, row1_y, "Class: ________________")

    # Row 2-3-4-5: Student number bubble grid (4 digits)
    grid_label_y = row1_y - 10 * mm
    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(HexColor("#0c4a6e"))
    c.drawString(MARGIN_LEFT + 5 * mm, grid_label_y - 4 * mm, "Student")
    c.drawString(MARGIN_LEFT + 5 * mm, grid_label_y - 11 * mm, "No.")

    _draw_student_number_grid(c, MARGIN_LEFT + 28 * mm, grid_label_y + 5.5 * mm)

    # Row 6: Name write-in line
    name_y = grid_label_y - 30 * mm
    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(HexColor("#0c4a6e"))
    c.drawString(MARGIN_LEFT + 5 * mm, name_y, "Name:")
    c.setStrokeColor(HexColor("#94a3b8"))
    c.setLineWidth(0.5)
    c.line(MARGIN_LEFT + 22 * mm, name_y - 1 * mm,
           MARGIN_LEFT + content_width - 5 * mm, name_y - 1 * mm)

    y -= info_box_height + 4 * mm

    # Instructions bar (full width, rounded, light background)
    instr_height = 12 * mm
    c.setFillColor(HexColor("#f0f9ff"))
    c.setStrokeColor(HexColor("#bae6fd"))
    c.setLineWidth(0.5)
    c.roundRect(MARGIN_LEFT, y - instr_height + 4 * mm, content_width, instr_height, 2 * mm, fill=1, stroke=1)
    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(HexColor("#374151"))
    c.drawString(MARGIN_LEFT + 4 * mm, y + 0.5 * mm, "\u25cf  Fill bubble completely")
    c.drawString(MARGIN_LEFT + 48 * mm, y + 0.5 * mm, "\u25cf  Use dark pen or pencil")
    c.setFont("Helvetica", 7)
    c.setFillColor(HexColor("#6b7280"))
    c.drawString(MARGIN_LEFT + 4 * mm, y - 4.5 * mm, "\u25cf  To change answer: completely fill/scribble the wrong bubble, then neatly fill the correct one")
    y -= instr_height + 2 * mm

    return y


def _draw_student_number_grid(c, x_start, y_start):
    """Draw the 4-row student number bubble grid (Thousands, Hundreds, Tens, Units, each 0-9)."""
    digits = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]

    for row_idx, label in enumerate(["1000s", "100s", "10s", "1s"]):
        row_y = y_start - row_idx * STUDENT_NUM_ROW_SPACING

        # Row label
        c.setFont("Helvetica", 8)
        c.setFillColor(HexColor("#64748b"))
        c.drawRightString(x_start - 3 * mm, row_y - 1.5 * mm, label)

        # Digit bubbles (oval)
        for i, digit in enumerate(digits):
            bx = x_start + i * STUDENT_NUM_SPACING_X
            by = row_y

            _draw_oval_bubble(c, bx, by, STUDENT_NUM_BUBBLE_W, STUDENT_NUM_BUBBLE_H)

            # Digit label inside bubble
            c.setFont("Helvetica-Bold", 7)
            c.setFillColor(HexColor("#9ca3af"))
            c.drawCentredString(bx, by - 2 * mm, digit)


def _draw_oval_bubble(c, cx, cy, w, h):
    """Draw a single oval bubble centered at (cx, cy) with width w and height h."""
    c.setStrokeColor(HexColor("#4b5563"))
    c.setFillColor(white)
    c.setLineWidth(0.8)
    # ellipse takes bounding rect: (x1, y1, x2, y2)
    c.ellipse(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2, fill=1, stroke=1)


def _draw_section(c, section, y):
    """Draw a section with its questions and bubbles."""
    content_width = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT

    # Section header bar (full width, rounded)
    c.setFillColor(BRAND_COLOR)
    header_height = 8 * mm
    c.roundRect(MARGIN_LEFT, y - 0.5 * mm, content_width, header_height, 3 * mm, fill=1, stroke=0)
    c.setFont("Helvetica-Bold", 12)
    c.setFillColor(white)
    c.drawString(MARGIN_LEFT + 5 * mm, y + 1 * mm, f"Section {section.section_name}")

    # Show option letters in header bar (right side)
    c.setFont("Helvetica-Bold", 9)
    c.setFillColor(HexColor("#cffafe"))
    preview_x = MARGIN_LEFT + content_width - 5 * mm
    opts_text = "  ".join(OPTIONS[:section.num_options])
    c.drawRightString(preview_x, y + 1 * mm, opts_text)

    y -= header_height + 4 * mm

    # Questions with bubbles - multi-column layout filling page width first
    num_questions = section.num_questions
    start_q = section.start_question

    # First determine how many columns fit across the page
    bubble_block_width = QUESTION_NUM_WIDTH + section.num_options * BUBBLE_SPACING_X + 3 * mm
    max_cols = max(1, int(content_width / bubble_block_width))

    # Use as many columns as possible to spread questions across the page
    num_columns = min(max_cols, num_questions)
    questions_per_column = (num_questions + num_columns - 1) // num_columns

    col_width = content_width / num_columns

    # Column option headers
    c.setFont("Helvetica-Bold", 9)
    c.setFillColor(HexColor("#374151"))
    for col in range(num_columns):
        x_base = MARGIN_LEFT + col * col_width
        for i in range(section.num_options):
            opt_x = x_base + QUESTION_NUM_WIDTH + i * BUBBLE_SPACING_X
            c.drawCentredString(opt_x, y + 1 * mm, OPTIONS[i])
    y -= 4 * mm

    start_y = y
    for q_idx in range(num_questions):
        col = q_idx // questions_per_column
        row = q_idx % questions_per_column

        if col >= num_columns:
            col = num_columns - 1
            row = questions_per_column + (q_idx - num_columns * questions_per_column)

        q_num = start_q + q_idx
        x_base = MARGIN_LEFT + col * col_width
        q_y = start_y - row * BUBBLE_SPACING_Y

        # Alternating row shading
        if row % 2 == 0:
            c.setFillColor(HexColor("#ecfeff"))
            row_width = QUESTION_NUM_WIDTH + section.num_options * BUBBLE_SPACING_X + 2 * mm
            c.rect(x_base, q_y - BUBBLE_HEIGHT / 2 - 0.5 * mm, row_width,
                   BUBBLE_HEIGHT + 1 * mm, fill=1, stroke=0)

        # Question number
        c.setFont("Helvetica-Bold", 10)
        c.setFillColor(HexColor("#1f2937"))
        c.drawRightString(x_base + QUESTION_NUM_WIDTH - 2 * mm, q_y - 2 * mm, f"{q_num}.")

        # Bubbles (oval)
        for i in range(section.num_options):
            bx = x_base + QUESTION_NUM_WIDTH + i * BUBBLE_SPACING_X
            by = q_y

            _draw_oval_bubble(c, bx, by, BUBBLE_WIDTH, BUBBLE_HEIGHT)

            # Letter inside bubble
            c.setFont("Helvetica-Bold", 7)
            c.setFillColor(HexColor("#9ca3af"))
            c.drawCentredString(bx, by - 2 * mm, OPTIONS[i])

    # Calculate height used
    rows_used = min(questions_per_column, num_questions)
    y = start_y - rows_used * BUBBLE_SPACING_Y - 3 * mm

    return y

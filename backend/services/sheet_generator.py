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

BUBBLE_RADIUS = 3.8 * mm
BUBBLE_SPACING_X = 11.5 * mm
BUBBLE_SPACING_Y = 8.2 * mm
QUESTION_NUM_WIDTH = 12 * mm

BRAND_COLOR = HexColor("#0e7490")  # Dark blue-teal
BRAND_COLOR_LIGHT = HexColor("#cffafe")
BRAND_COLOR_DARK = HexColor("#164e63")

ALIGNMENT_MARKER_SIZE = 5 * mm

OPTIONS = ["A", "B", "C", "D", "E"]


def _draw_logo_icon(c, x, y, size):
    """Draw the MarkSnap logo icon (small teal square with scan lines)."""
    # Rounded teal square background
    c.setFillColor(BRAND_COLOR)
    c.roundRect(x, y, size, size, size * 0.2, fill=1, stroke=0)

    # Scan chevron (white)
    c.setStrokeColor(white)
    c.setLineWidth(0.8)
    c.setLineCap(1)
    inset = size * 0.25
    mid = size * 0.5
    c.line(x + inset, y + mid + size * 0.15, x + mid, y + mid)
    c.line(x + mid, y + mid, x + inset, y + mid - size * 0.15)

    # Vertical scan line (white)
    c.line(x + mid + size * 0.05, y + inset * 0.8, x + mid + size * 0.05, y + size - inset * 0.8)

    # Dots (lighter teal)
    dot_r = size * 0.08
    dot_x = x + size * 0.72
    c.setFillColor(HexColor("#67e8f9"))
    c.circle(dot_x, y + size * 0.65, dot_r, fill=1, stroke=0)
    c.circle(dot_x, y + size * 0.35, dot_r, fill=1, stroke=0)


def generate_answer_sheets(test, students, class_group) -> bytes:
    """Generate a PDF with answer sheets for all students."""
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)

    for student in students:
        _draw_student_sheet(c, test, student, class_group)

    c.save()
    return buffer.getvalue()


def _draw_student_sheet(c, test, student, class_group):
    """Draw answer sheet pages for a single student."""
    pages = {}
    for section in test.sections:
        pg = section.page_number
        if pg not in pages:
            pages[pg] = []
        pages[pg].append(section)

    total_pages = len(pages)

    for page_num in sorted(pages.keys()):
        sections = pages[page_num]
        _draw_page(c, test, student, class_group, sections, page_num, total_pages)
        c.showPage()


def _draw_page(c, test, student, class_group, sections, page_num, total_pages):
    """Draw a single page of the answer sheet."""
    y = PAGE_HEIGHT - MARGIN_TOP

    _draw_alignment_markers(c)

    # Compact header with QR code inline
    y = _draw_header(c, test, student, class_group, page_num, total_pages, y)

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


def _draw_header(c, test, student, class_group, page_num, total_pages, y):
    """Draw compact header with QR code positioned inline to save vertical space."""
    content_width = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT
    qr_size = 22 * mm
    info_width = content_width - qr_size - 5 * mm

    # Generate and draw QR code (top-right, inline with header)
    qr_data = {
        "sid": student.student_code,
        "tid": test.id,
        "pg": page_num,
        "tp": total_pages,
    }
    qr_img = generate_qr_code(qr_data, box_size=3, border=2)

    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        qr_img.save(tmp, format="PNG")
        tmp_path = tmp.name

    qr_x = PAGE_WIDTH - MARGIN_RIGHT - qr_size
    qr_y = y - qr_size

    # QR border
    c.setStrokeColor(BRAND_COLOR)
    c.setLineWidth(1)
    c.rect(qr_x - 1.5 * mm, qr_y - 1.5 * mm, qr_size + 3 * mm, qr_size + 3 * mm, fill=0, stroke=1)
    c.drawImage(tmp_path, qr_x, qr_y, qr_size, qr_size)
    os.unlink(tmp_path)

    # Brand bar (left of QR)
    bar_height = 7 * mm
    c.setFillColor(BRAND_COLOR)
    c.rect(MARGIN_LEFT, y - bar_height + 5 * mm, info_width, bar_height, fill=1, stroke=0)

    # Logo icon in the brand bar
    logo_size = 5 * mm
    logo_x = MARGIN_LEFT + 2.5 * mm
    logo_y = y - bar_height + 6 * mm
    _draw_logo_icon(c, logo_x, logo_y, logo_size)

    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 13)
    c.drawString(MARGIN_LEFT + 9 * mm, y - bar_height + 7 * mm, "MarkSnap")
    c.setFont("Helvetica", 8)
    c.drawRightString(MARGIN_LEFT + info_width - 3 * mm, y - bar_height + 7.5 * mm,
                      f"Page {page_num} of {total_pages}")
    y -= bar_height + 2 * mm

    # Student info row (compact, beside QR)
    info_box_height = 16 * mm
    c.setFillColor(BRAND_COLOR_LIGHT)
    c.setStrokeColor(HexColor("#a5f3fc"))
    c.roundRect(MARGIN_LEFT, y - info_box_height, info_width, info_box_height, 2, fill=1, stroke=1)

    c.setFillColor(HexColor("#0c4a6e"))
    c.setFont("Helvetica-Bold", 9)
    row1_y = y - 5.5 * mm
    c.drawString(MARGIN_LEFT + 3 * mm, row1_y, f"Name: {student.name}")
    c.drawString(MARGIN_LEFT + info_width / 2, row1_y, f"ID: {student.student_code}")
    row2_y = row1_y - 5.5 * mm
    c.drawString(MARGIN_LEFT + 3 * mm, row2_y, f"Class: {class_group.name}")
    c.setFont("Helvetica", 8)
    c.drawString(MARGIN_LEFT + info_width / 2, row2_y, f"Test: {test.name}")

    y -= info_box_height + 3 * mm

    # Instructions (single compact line with bullet points)
    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(HexColor("#374151"))
    c.drawString(MARGIN_LEFT, y, "\u25cf  Fill bubble completely")
    c.drawString(MARGIN_LEFT + 42 * mm, y, "\u25cf  Use dark pen or pencil")
    c.drawString(MARGIN_LEFT + 88 * mm, y, "\u25cf  Erase fully to change answer")
    y -= 6 * mm

    return y


def _draw_section(c, section, y):
    """Draw a section with its questions and bubbles."""
    content_width = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT

    # Section header bar
    c.setFillColor(BRAND_COLOR)
    header_height = 6 * mm
    c.roundRect(MARGIN_LEFT, y - 0.5 * mm, content_width, header_height, 2, fill=1, stroke=0)
    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(white)
    c.drawString(MARGIN_LEFT + 3 * mm, y + 0.5 * mm, f"Section {section.section_name}")

    # Show option letters in header bar (right side)
    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(HexColor("#cffafe"))
    preview_x = MARGIN_LEFT + content_width - 3 * mm
    opts_text = "  ".join(OPTIONS[:section.num_options])
    c.drawRightString(preview_x, y + 0.5 * mm, opts_text)

    y -= header_height + 3 * mm

    # Questions with bubbles - multi-column layout for space efficiency
    num_questions = section.num_questions
    start_q = section.start_question

    # Calculate available height
    available_height = y - MARGIN_BOTTOM - 10 * mm
    questions_per_column = int(available_height / BUBBLE_SPACING_Y)
    if questions_per_column < 1:
        questions_per_column = 1

    num_columns = max(1, (num_questions + questions_per_column - 1) // questions_per_column)

    # Auto-fit columns based on bubble width
    bubble_block_width = QUESTION_NUM_WIDTH + section.num_options * BUBBLE_SPACING_X + 3 * mm
    max_cols = max(1, int(content_width / bubble_block_width))
    if num_columns > max_cols:
        num_columns = max_cols
        questions_per_column = (num_questions + num_columns - 1) // num_columns

    col_width = content_width / num_columns

    # Column option headers
    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(HexColor("#374151"))
    for col in range(num_columns):
        x_base = MARGIN_LEFT + col * col_width
        for i in range(section.num_options):
            opt_x = x_base + QUESTION_NUM_WIDTH + i * BUBBLE_SPACING_X + BUBBLE_RADIUS
            c.drawCentredString(opt_x, y + 1 * mm, OPTIONS[i])
    y -= 3 * mm

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
            c.rect(x_base, q_y - BUBBLE_RADIUS - 1 * mm, row_width,
                   BUBBLE_RADIUS * 2 + 2 * mm, fill=1, stroke=0)

        # Question number
        c.setFont("Helvetica-Bold", 9)
        c.setFillColor(HexColor("#1f2937"))
        c.drawRightString(x_base + QUESTION_NUM_WIDTH - 2 * mm, q_y - BUBBLE_RADIUS / 2, f"{q_num}.")

        # Bubbles
        for i in range(section.num_options):
            bx = x_base + QUESTION_NUM_WIDTH + i * BUBBLE_SPACING_X + BUBBLE_RADIUS
            by = q_y

            c.setStrokeColor(HexColor("#4b5563"))
            c.setFillColor(white)
            c.setLineWidth(1.1)
            c.circle(bx, by, BUBBLE_RADIUS, fill=1, stroke=1)

            # Letter inside bubble
            c.setFont("Helvetica-Bold", 7)
            c.setFillColor(HexColor("#9ca3af"))
            c.drawCentredString(bx, by - 1.8 * mm, OPTIONS[i])

    # Calculate height used
    rows_used = min(questions_per_column, num_questions)
    y = start_y - rows_used * BUBBLE_SPACING_Y - 3 * mm

    return y

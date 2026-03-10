from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, cm
from reportlab.pdfgen import canvas
from reportlab.lib.colors import black, white, HexColor
from services.qr_handler import generate_qr_code
from PIL import Image
import io
import tempfile
import os

# Layout constants
PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN_LEFT = 20 * mm
MARGIN_TOP = 25 * mm
MARGIN_RIGHT = 20 * mm
MARGIN_BOTTOM = 20 * mm

BUBBLE_RADIUS = 4 * mm
BUBBLE_SPACING_X = 13 * mm
BUBBLE_SPACING_Y = 9 * mm
QUESTION_NUM_WIDTH = 14 * mm

BRAND_COLOR = HexColor("#2563eb")  # Blue
BRAND_COLOR_LIGHT = HexColor("#dbeafe")

ALIGNMENT_MARKER_SIZE = 5 * mm

OPTIONS = ["A", "B", "C", "D", "E"]


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
    # Group sections by page number
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

    # --- Alignment markers (corners) ---
    _draw_alignment_markers(c)

    # --- Header ---
    y = _draw_header(c, test, student, class_group, page_num, total_pages, y)

    # --- QR Code ---
    qr_data = {
        "sid": student.student_code,
        "tid": test.id,
        "pg": page_num,
        "tp": total_pages,
    }
    qr_img = generate_qr_code(qr_data, box_size=3, border=2)

    # Save QR to temp file for reportlab
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        qr_img.save(tmp, format="PNG")
        tmp_path = tmp.name

    qr_size = 25 * mm
    c.drawImage(tmp_path, PAGE_WIDTH - MARGIN_RIGHT - qr_size, y - qr_size, qr_size, qr_size)
    os.unlink(tmp_path)

    # --- Sections with bubbles ---
    y -= (qr_size + 5 * mm)

    for section in sections:
        y = _draw_section(c, section, y)

    # --- Footer ---
    c.setFont("Helvetica", 8)
    c.setFillColor(HexColor("#6b7280"))
    c.drawCentredString(PAGE_WIDTH / 2, 10 * mm, "MarkSnap Answer Sheet  •  Do not fold or crease the bubble area  •  Use dark pen or pencil only")


def _draw_alignment_markers(c):
    """Draw filled squares in the four corners for scan alignment."""
    positions = [
        (10 * mm, PAGE_HEIGHT - 10 * mm),  # Top-left
        (PAGE_WIDTH - 10 * mm - ALIGNMENT_MARKER_SIZE, PAGE_HEIGHT - 10 * mm),  # Top-right
        (10 * mm, 10 * mm + ALIGNMENT_MARKER_SIZE),  # Bottom-left
        (PAGE_WIDTH - 10 * mm - ALIGNMENT_MARKER_SIZE, 10 * mm + ALIGNMENT_MARKER_SIZE),  # Bottom-right
    ]
    c.setFillColor(black)
    for x, y in positions:
        c.rect(x, y - ALIGNMENT_MARKER_SIZE, ALIGNMENT_MARKER_SIZE, ALIGNMENT_MARKER_SIZE, fill=1, stroke=0)


def _draw_header(c, test, student, class_group, page_num, total_pages, y):
    """Draw the header section with student info and branding."""
    # Brand bar
    c.setFillColor(BRAND_COLOR)
    c.rect(MARGIN_LEFT, y - 2 * mm, PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT, 8 * mm, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(MARGIN_LEFT + 4 * mm, y, "MarkSnap")
    c.setFont("Helvetica", 9)
    c.drawRightString(PAGE_WIDTH - MARGIN_RIGHT - 4 * mm, y, f"Answer Sheet")
    y -= 15 * mm

    # Student info box
    c.setStrokeColor(HexColor("#d1d5db"))
    c.setFillColor(BRAND_COLOR_LIGHT)
    info_box_height = 22 * mm
    c.roundRect(MARGIN_LEFT, y - info_box_height, PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT - 30 * mm,
                info_box_height, 3, fill=1, stroke=1)

    c.setFillColor(black)
    c.setFont("Helvetica-Bold", 10)
    info_y = y - 6 * mm
    c.drawString(MARGIN_LEFT + 4 * mm, info_y, f"Name: {student.name}")
    info_y -= 6 * mm
    c.drawString(MARGIN_LEFT + 4 * mm, info_y, f"Class: {class_group.name}")
    c.drawString(MARGIN_LEFT + 60 * mm, info_y, f"ID: {student.student_code}")
    info_y -= 6 * mm
    c.setFont("Helvetica", 9)
    c.drawString(MARGIN_LEFT + 4 * mm, info_y, f"Test: {test.name}")
    c.drawString(MARGIN_LEFT + 90 * mm, info_y, f"Page {page_num} of {total_pages}")

    y -= (info_box_height + 5 * mm)

    # Instructions — clearer and larger for students
    c.setFont("Helvetica-Bold", 9)
    c.setFillColor(HexColor("#374151"))
    c.drawString(MARGIN_LEFT, y, "Instructions:")
    c.setFont("Helvetica", 9)
    c.setFillColor(HexColor("#4b5563"))
    c.drawString(MARGIN_LEFT + 22 * mm, y, "Fill in the bubble completely using a dark pen or pencil.")
    y -= 5 * mm
    c.drawString(MARGIN_LEFT + 22 * mm, y, "To change an answer, erase your mark fully and fill the new bubble.")
    y -= 8 * mm

    return y


def _draw_section(c, section, y):
    """Draw a section with its questions and bubbles."""
    # Section header with blue background bar
    c.setFillColor(BRAND_COLOR)
    header_height = 7 * mm
    c.roundRect(MARGIN_LEFT, y - 1 * mm, PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT, header_height, 2, fill=1, stroke=0)
    c.setFont("Helvetica-Bold", 11)
    c.setFillColor(white)
    c.drawString(MARGIN_LEFT + 4 * mm, y + 1 * mm, f"Section {section.section_name}")
    y -= 10 * mm

    # Option headers — bold and dark for clarity
    c.setFont("Helvetica-Bold", 9)
    c.setFillColor(HexColor("#374151"))
    for i in range(section.num_options):
        opt_x = MARGIN_LEFT + QUESTION_NUM_WIDTH + i * BUBBLE_SPACING_X + BUBBLE_RADIUS
        c.drawCentredString(opt_x, y + 2 * mm, OPTIONS[i])
    y -= 3 * mm

    # Questions with bubbles — arrange in columns if many questions
    num_questions = section.num_questions
    start_q = section.start_question

    # Calculate available height
    available_height = y - MARGIN_BOTTOM - 15 * mm
    questions_per_column = int(available_height / BUBBLE_SPACING_Y)
    num_columns = max(1, (num_questions + questions_per_column - 1) // questions_per_column)

    if num_columns > 3:
        num_columns = 3
        questions_per_column = (num_questions + num_columns - 1) // num_columns

    col_width = (PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT) / num_columns

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

        # Alternating row background for readability
        if row % 2 == 0:
            c.setFillColor(HexColor("#f0f7ff"))
            row_width = QUESTION_NUM_WIDTH + section.num_options * BUBBLE_SPACING_X + 4 * mm
            c.rect(x_base, q_y - BUBBLE_RADIUS - 1.5 * mm, row_width, BUBBLE_RADIUS * 2 + 3 * mm, fill=1, stroke=0)

        # Question number — large, bold, dark
        c.setFont("Helvetica-Bold", 10)
        c.setFillColor(HexColor("#1f2937"))
        c.drawRightString(x_base + QUESTION_NUM_WIDTH - 3 * mm, q_y - BUBBLE_RADIUS / 2, f"{q_num}.")

        # Bubbles — thicker border, darker letter inside
        for i in range(section.num_options):
            bx = x_base + QUESTION_NUM_WIDTH + i * BUBBLE_SPACING_X + BUBBLE_RADIUS
            by = q_y

            c.setStrokeColor(HexColor("#4b5563"))
            c.setFillColor(white)
            c.setLineWidth(1.2)
            c.circle(bx, by, BUBBLE_RADIUS, fill=1, stroke=1)

            # Clear letter inside bubble — darker for visibility
            c.setFont("Helvetica-Bold", 7)
            c.setFillColor(HexColor("#9ca3af"))
            c.drawCentredString(bx, by - 2 * mm, OPTIONS[i])

    # Calculate actual height used
    rows_used = min(questions_per_column, num_questions)
    y = start_y - rows_used * BUBBLE_SPACING_Y - 5 * mm

    return y

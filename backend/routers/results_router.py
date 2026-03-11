from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from database import get_db
from models import Teacher, Test, ScanBatch, ScanResult, AnswerKey, Student, ClassGroup, Subject
from schemas import StudentResult, StudentProgressReport, StudentProgressEntry
from auth import get_current_teacher
from routers.tests_router import _can_access_test
from services.excel_export import generate_results_excel
import io

router = APIRouter(prefix="/api/results", tags=["results"])


@router.get("/{test_id}", response_model=list[StudentResult])
def get_results(
    test_id: int,
    class_id: int = None,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    test = db.query(Test).filter(Test.id == test_id).first()
    if not test or not _can_access_test(teacher, test, db):
        raise HTTPException(status_code=404, detail="Test not found")

    return _build_student_results(test_id, class_id, db)


@router.get("/{test_id}/export")
def export_results(
    test_id: int,
    class_id: int = None,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    test = db.query(Test).filter(Test.id == test_id).first()
    if not test or not _can_access_test(teacher, test, db):
        raise HTTPException(status_code=404, detail="Test not found")

    student_results = _build_student_results(test_id, class_id, db)
    if not student_results:
        raise HTTPException(status_code=400, detail="No results to export")

    answer_keys = db.query(AnswerKey).filter(AnswerKey.test_id == test_id).order_by(AnswerKey.question_number).all()
    answer_key_list = [(k.question_number, k.section_name, k.correct_answer) for k in answer_keys]

    excel_buffer = generate_results_excel(test.name, student_results, answer_key_list)

    return StreamingResponse(
        io.BytesIO(excel_buffer),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="marksnap_{test.name}_results.xlsx"'
        },
    )


def _build_student_results(test_id: int, class_id: int, db: Session) -> list[StudentResult]:
    query = db.query(ScanResult).join(ScanBatch).filter(
        ScanBatch.test_id == test_id,
        ScanBatch.status == "completed",
    )

    results = query.all()
    if not results:
        return []

    # Pre-fetch all relevant students and classes in bulk
    student_ids = {r.student_id for r in results if r.student_id}
    students = {s.id: s for s in db.query(Student).filter(Student.id.in_(student_ids)).all()} if student_ids else {}
    class_ids_needed = {s.class_id for s in students.values()}
    class_map = {c.id: c for c in db.query(ClassGroup).filter(ClassGroup.id.in_(class_ids_needed)).all()} if class_ids_needed else {}

    # Group results by student
    student_map: dict[int, dict] = {}
    for r in results:
        if not r.student_id:
            continue
        if r.student_id not in student_map:
            student = students.get(r.student_id)
            if not student:
                continue

            if class_id and student.class_id != class_id:
                continue

            cg = class_map.get(student.class_id)
            student_map[r.student_id] = {
                "student_id": student.id,
                "student_name": student.name,
                "student_code": student.student_code,
                "class_name": cg.name if cg else "",
                "answers": {},
                "correct": {},
                "score": 0,
                "total": 0,
            }

        key = f"Q{r.question_number}"
        student_map[r.student_id]["answers"][key] = r.selected_answer
        student_map[r.student_id]["correct"][key] = r.is_correct or False
        student_map[r.student_id]["total"] += 1
        if r.is_correct:
            student_map[r.student_id]["score"] += 1

    result = []
    for data in student_map.values():
        total = data["total"] or 1
        result.append(StudentResult(
            student_id=data["student_id"],
            student_name=data["student_name"],
            student_code=data["student_code"],
            class_name=data["class_name"],
            answers=data["answers"],
            correct=data["correct"],
            score=data["score"],
            total=data["total"],
            percentage=round(data["score"] / total * 100, 1),
        ))

    return sorted(result, key=lambda x: x.student_name)


@router.get("/progress/class/{class_id}", response_model=list[StudentProgressReport])
def get_class_progress(
    class_id: int,
    subject_id: int = Query(None),
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    """Get progress reports for all students in a class across multiple tests."""
    from routers.classes_router import _can_access_class

    class_group = db.query(ClassGroup).filter(ClassGroup.id == class_id).first()
    if not class_group or not _can_access_class(teacher, class_group):
        raise HTTPException(status_code=404, detail="Class not found")

    students = db.query(Student).filter(Student.class_id == class_id).order_by(Student.name).all()
    if not students:
        return []

    student_ids = [s.id for s in students]

    # Get all completed scan results for these students
    query = (
        db.query(ScanResult, ScanBatch, Test)
        .join(ScanBatch, ScanResult.scan_batch_id == ScanBatch.id)
        .join(Test, ScanBatch.test_id == Test.id)
        .filter(
            ScanResult.student_id.in_(student_ids),
            ScanBatch.status == "completed",
        )
    )
    if subject_id:
        query = query.filter(Test.subject_id == subject_id)

    rows = query.all()

    # Group: student_id -> test_id -> {score, total}
    progress_map: dict[int, dict[int, dict]] = {}
    test_cache: dict[int, Test] = {}
    batch_cache: dict[int, ScanBatch] = {}

    for scan_result, scan_batch, test in rows:
        if not scan_result.student_id:
            continue
        sid = scan_result.student_id
        tid = test.id
        test_cache[tid] = test
        batch_cache[scan_batch.id] = scan_batch

        if sid not in progress_map:
            progress_map[sid] = {}
        if tid not in progress_map[sid]:
            progress_map[sid][tid] = {"score": 0, "total": 0, "batch_uploaded": scan_batch.uploaded_at}

        progress_map[sid][tid]["total"] += 1
        if scan_result.is_correct:
            progress_map[sid][tid]["score"] += 1

    # Build response
    reports = []
    for student in students:
        tests_data = []
        test_entries = progress_map.get(student.id, {})
        for tid, data in test_entries.items():
            test = test_cache[tid]
            total = data["total"] or 1
            tests_data.append(StudentProgressEntry(
                test_id=tid,
                test_name=test.name,
                subject_name=test.subject.name if test.subject else None,
                test_date=test.test_date,
                score=data["score"],
                total=data["total"],
                percentage=round(data["score"] / total * 100, 1),
                scanned_at=data["batch_uploaded"],
            ))

        # Sort by test_date or scanned_at
        tests_data.sort(key=lambda t: t.test_date or t.scanned_at or test.created_at)

        avg = 0.0
        if tests_data:
            avg = round(sum(t.percentage for t in tests_data) / len(tests_data), 1)

        reports.append(StudentProgressReport(
            student_id=student.id,
            student_name=student.name,
            student_code=student.student_code,
            class_name=class_group.name,
            tests=tests_data,
            average_percentage=avg,
        ))

    return reports


@router.get("/progress/class/{class_id}/export")
def export_class_progress(
    class_id: int,
    subject_id: int = Query(None),
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    """Export class progress to Excel spreadsheet."""
    reports = get_class_progress(class_id, subject_id, db, teacher)
    if not reports:
        raise HTTPException(status_code=400, detail="No results to export")

    from openpyxl import Workbook
    wb = Workbook()
    ws = wb.active
    ws.title = "Progress Report"

    # Gather all unique test names across all students
    all_tests = []
    test_set = set()
    for report in reports:
        for t in report.tests:
            if t.test_id not in test_set:
                test_set.add(t.test_id)
                all_tests.append(t)
    all_tests.sort(key=lambda t: t.test_date or t.scanned_at or t.test_date)

    # Header row
    headers = ["Student Name", "Student Code", "Class"]
    for t in all_tests:
        date_str = t.test_date.strftime("%d/%m/%Y") if t.test_date else ""
        headers.append(f"{t.test_name}\n{date_str}".strip())
    headers.append("Average %")
    ws.append(headers)

    # Bold header
    from openpyxl.styles import Font, Alignment
    for cell in ws[1]:
        cell.font = Font(bold=True)
        cell.alignment = Alignment(wrap_text=True, horizontal="center")

    # Data rows
    for report in reports:
        row = [report.student_name, report.student_code, report.class_name]
        test_results = {t.test_id: t for t in report.tests}
        for t in all_tests:
            entry = test_results.get(t.test_id)
            row.append(f"{entry.percentage}%" if entry else "")
        row.append(f"{report.average_percentage}%")
        ws.append(row)

    # Auto-width columns
    for col in ws.columns:
        max_len = max((len(str(cell.value or "")) for cell in col), default=10)
        ws.column_dimensions[col[0].column_letter].width = min(max_len + 3, 25)

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="marksnap_progress_report.xlsx"'},
    )

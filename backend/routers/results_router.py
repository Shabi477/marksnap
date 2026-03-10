from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from database import get_db
from models import Teacher, Test, ScanBatch, ScanResult, AnswerKey, Student, ClassGroup
from schemas import StudentResult
from auth import get_current_teacher
from services.excel_export import generate_results_excel
import io


def _can_access_test(teacher: Teacher, test: Test) -> bool:
    if test.teacher_id == teacher.id:
        return True
    if teacher.role == "hod" and teacher.school_id:
        test_owner = test.teacher
        return test_owner and test_owner.school_id == teacher.school_id
    return False

router = APIRouter(prefix="/api/results", tags=["results"])


@router.get("/{test_id}", response_model=list[StudentResult])
def get_results(
    test_id: int,
    class_id: int = None,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    test = db.query(Test).filter(Test.id == test_id).first()
    if not test or not _can_access_test(teacher, test):
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
    if not test or not _can_access_test(teacher, test):
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

    # Group results by student
    student_map: dict[int, dict] = {}
    for r in results:
        if not r.student_id:
            continue
        if r.student_id not in student_map:
            student = db.query(Student).filter(Student.id == r.student_id).first()
            if not student:
                continue
            class_group = db.query(ClassGroup).filter(ClassGroup.id == student.class_id).first()

            if class_id and student.class_id != class_id:
                continue

            student_map[r.student_id] = {
                "student_id": student.id,
                "student_name": student.name,
                "student_code": student.student_code,
                "class_name": class_group.name if class_group else "",
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

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from database import get_db
from models import Teacher, Test, TestSection, AnswerKey, Student, ClassGroup, TestAssignment
from schemas import TestCreate, TestResponse, SectionConfig, AnswerKeyCreate, AnswerKeyEntry
from auth import get_current_teacher
from routers.classes_router import _can_access_class
from services.sheet_generator import generate_answer_sheets
import io

router = APIRouter(prefix="/api/tests", tags=["tests"])


def _can_access_test(teacher: Teacher, test: Test, db: Session = None) -> bool:
    if test.teacher_id == teacher.id:
        return True
    if teacher.role == "hod" and teacher.school_id:
        test_owner = test.teacher
        return test_owner and test_owner.school_id == teacher.school_id
    # Check if test is assigned to this teacher
    if db and teacher.school_id:
        assigned = db.query(TestAssignment).filter(
            TestAssignment.test_id == test.id,
            TestAssignment.school_id == teacher.school_id,
        ).all()
        for a in assigned:
            if a.teacher_id == teacher.id:
                return True
            if a.class_id:
                from models import teacher_classes
                link = db.execute(
                    teacher_classes.select().where(
                        teacher_classes.c.teacher_id == teacher.id,
                        teacher_classes.c.class_id == a.class_id,
                    )
                ).first()
                if link:
                    return True
            if a.year_group:
                teacher_class_years = [
                    c.academic_year for c in teacher.assigned_classes
                ]
                if a.year_group in teacher_class_years:
                    return True
    return False


@router.get("/", response_model=list[TestResponse])
def list_tests(
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    if teacher.role == "hod" and teacher.school_id:
        school_teacher_ids = [t.id for t in db.query(Teacher).filter(Teacher.school_id == teacher.school_id).all()]
        tests = db.query(Test).filter(Test.teacher_id.in_(school_teacher_ids)).all()
    else:
        # Own tests
        own_tests = db.query(Test).filter(Test.teacher_id == teacher.id).all()
        test_ids = {t.id for t in own_tests}

        # Tests assigned to this teacher
        if teacher.school_id:
            assigned_test_ids = set()
            # Directly assigned
            direct = db.query(TestAssignment.test_id).filter(
                TestAssignment.school_id == teacher.school_id,
                TestAssignment.teacher_id == teacher.id,
            ).all()
            assigned_test_ids.update(a[0] for a in direct)

            # Assigned to teacher's classes
            teacher_class_ids = [c.id for c in teacher.assigned_classes]
            if teacher_class_ids:
                class_assigned = db.query(TestAssignment.test_id).filter(
                    TestAssignment.school_id == teacher.school_id,
                    TestAssignment.class_id.in_(teacher_class_ids),
                ).all()
                assigned_test_ids.update(a[0] for a in class_assigned)

            # Assigned to year groups that match teacher's classes
            teacher_years = {c.academic_year for c in teacher.assigned_classes}
            if teacher_years:
                year_assigned = db.query(TestAssignment.test_id).filter(
                    TestAssignment.school_id == teacher.school_id,
                    TestAssignment.year_group.in_(teacher_years),
                ).all()
                assigned_test_ids.update(a[0] for a in year_assigned)

            # Fetch any assigned tests not already in own
            extra_ids = assigned_test_ids - test_ids
            if extra_ids:
                extra = db.query(Test).filter(Test.id.in_(extra_ids)).all()
                own_tests.extend(extra)

        tests = own_tests
    result = []
    for t in tests:
        sections = [
            SectionConfig(
                section_name=s.section_name,
                num_questions=s.num_questions,
                num_options=s.num_options,
                page_number=s.page_number,
            )
            for s in t.sections
        ]
        result.append(TestResponse(
            id=t.id, name=t.name, teacher_id=t.teacher_id,
            sections=sections, created_at=t.created_at,
        ))
    return result


@router.post("/", response_model=TestResponse)
def create_test(
    data: TestCreate,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    test = Test(name=data.name, teacher_id=teacher.id)
    db.add(test)
    db.flush()

    start_q = 1
    for i, sec in enumerate(data.sections):
        section = TestSection(
            test_id=test.id,
            section_name=sec.section_name,
            num_questions=sec.num_questions,
            num_options=sec.num_options,
            start_question=start_q,
            order_index=i,
            page_number=sec.page_number,
        )
        db.add(section)
        start_q += sec.num_questions

    db.commit()
    db.refresh(test)

    sections = [
        SectionConfig(
            section_name=s.section_name,
            num_questions=s.num_questions,
            num_options=s.num_options,
            page_number=s.page_number,
        )
        for s in test.sections
    ]
    return TestResponse(
        id=test.id, name=test.name, teacher_id=test.teacher_id,
        sections=sections, created_at=test.created_at,
    )


@router.get("/{test_id}", response_model=TestResponse)
def get_test(
    test_id: int,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    test = db.query(Test).filter(Test.id == test_id).first()
    if not test or not _can_access_test(teacher, test, db):
        raise HTTPException(status_code=404, detail="Test not found")
    sections = [
        SectionConfig(
            section_name=s.section_name,
            num_questions=s.num_questions,
            num_options=s.num_options,
            page_number=s.page_number,
        )
        for s in test.sections
    ]
    return TestResponse(
        id=test.id, name=test.name, teacher_id=test.teacher_id,
        sections=sections, created_at=test.created_at,
    )


@router.post("/{test_id}/answer-key")
def set_answer_key(
    test_id: int,
    data: AnswerKeyCreate,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    test = db.query(Test).filter(Test.id == test_id).first()
    if not test or not _can_access_test(teacher, test, db):
        raise HTTPException(status_code=404, detail="Test not found")

    # Clear existing answer keys for this test
    db.query(AnswerKey).filter(AnswerKey.test_id == test_id).delete()

    for entry in data.answers:
        key = AnswerKey(
            test_id=test_id,
            question_number=entry.question_number,
            section_name=entry.section_name,
            correct_answer=entry.correct_answer.upper(),
        )
        db.add(key)

    db.commit()
    return {"message": f"Answer key saved with {len(data.answers)} answers"}


@router.get("/{test_id}/answer-key", response_model=list[AnswerKeyEntry])
def get_answer_key(
    test_id: int,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    test = db.query(Test).filter(Test.id == test_id).first()
    if not test or not _can_access_test(teacher, test, db):
        raise HTTPException(status_code=404, detail="Test not found")

    keys = db.query(AnswerKey).filter(AnswerKey.test_id == test_id).order_by(AnswerKey.question_number).all()
    return [
        AnswerKeyEntry(
            question_number=k.question_number,
            section_name=k.section_name,
            correct_answer=k.correct_answer,
        )
        for k in keys
    ]


@router.get("/{test_id}/sheets/{class_id}")
def download_answer_sheets(
    test_id: int,
    class_id: int,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    test = db.query(Test).filter(Test.id == test_id).first()
    if not test or not _can_access_test(teacher, test, db):
        raise HTTPException(status_code=404, detail="Test not found")

    class_group = db.query(ClassGroup).filter(ClassGroup.id == class_id).first()
    if not class_group or not _can_access_class(teacher, class_group):
        raise HTTPException(status_code=404, detail="Class not found")

    students = db.query(Student).filter(Student.class_id == class_id).all()
    if not students:
        raise HTTPException(status_code=400, detail="No students in this class")

    pdf_buffer = generate_answer_sheets(test, students, class_group)

    return StreamingResponse(
        io.BytesIO(pdf_buffer),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="marksnap_{test.name}_{class_group.name}_sheets.pdf"'
        },
    )


@router.delete("/{test_id}")
def delete_test(
    test_id: int,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    test = db.query(Test).filter(Test.id == test_id).first()
    if not test or not _can_access_test(teacher, test, db):
        raise HTTPException(status_code=404, detail="Test not found")
    db.query(AnswerKey).filter(AnswerKey.test_id == test_id).delete()
    db.query(TestSection).filter(TestSection.test_id == test_id).delete()
    db.delete(test)
    db.commit()
    return {"message": "Test deleted"}

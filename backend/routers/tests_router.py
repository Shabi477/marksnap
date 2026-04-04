from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse, FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from database import get_db
from models import Teacher, Test, TestSection, AnswerKey, ClassGroup, TestAssignment, Subject, Question, TestQuestion, teacher_classes, QuestionFlag
from schemas import TestCreate, TestResponse, SectionConfig, AnswerKeyCreate, AnswerKeyEntry, TestGenerate, TestAutoGenerate
from auth import get_current_teacher
from routers.classes_router import _can_access_class
from services.sheet_generator import generate_answer_sheets
import io

router = APIRouter(prefix="/api/tests", tags=["tests"])


def _build_test_response(test: Test) -> TestResponse:
    """Convert a Test model to TestResponse with sections."""
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
        subject_id=test.subject_id,
        subject_name=test.subject.name if test.subject else None,
        test_date=test.test_date,
        has_answer_key=len(test.answer_keys) > 0,
        has_test_file=bool(test.test_file_path),
        sections=sections, created_at=test.created_at,
    )


def _can_access_test(teacher: Teacher, test: Test, db: Session = None) -> bool:
    if test.teacher_id == teacher.id:
        return True
    if teacher.role in ("hod", "school_admin") and teacher.school_id:
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
    if teacher.role in ("hod", "school_admin") and teacher.school_id:
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
    return [_build_test_response(t) for t in tests]


@router.post("/", response_model=TestResponse)
def create_test(
    data: TestCreate,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    test = Test(name=data.name, teacher_id=teacher.id)

    # Set optional subject
    if data.subject_id:
        subject = db.query(Subject).filter(Subject.id == data.subject_id).first()
        if subject:
            test.subject_id = data.subject_id

    # Set optional test date
    if data.test_date:
        from datetime import datetime
        try:
            test.test_date = datetime.fromisoformat(data.test_date)
        except ValueError:
            pass

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
    return _build_test_response(test)


@router.get("/{test_id}", response_model=TestResponse)
def get_test(
    test_id: int,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    test = db.query(Test).filter(Test.id == test_id).first()
    if not test or not _can_access_test(teacher, test, db):
        raise HTTPException(status_code=404, detail="Test not found")
    return _build_test_response(test)


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

    pdf_buffer = generate_answer_sheets(test, class_group)

    return StreamingResponse(
        io.BytesIO(pdf_buffer),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="marksnap_{test.name}_{class_group.name}_sheets.pdf"'
        },
    )


@router.get("/{test_id}/sheets")
def download_generic_sheets(
    test_id: int,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    """Download answer sheets without a class — generic template for any student."""
    test = db.query(Test).filter(Test.id == test_id).first()
    if not test or not _can_access_test(teacher, test, db):
        raise HTTPException(status_code=404, detail="Test not found")

    pdf_buffer = generate_answer_sheets(test)

    return StreamingResponse(
        io.BytesIO(pdf_buffer),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="marksnap_{test.name}_sheets.pdf"'
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


@router.post("/{test_id}/upload-paper")
def upload_test_paper(
    test_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    """Upload a reference test paper (PDF or image)."""
    test = db.query(Test).filter(Test.id == test_id).first()
    if not test or not _can_access_test(teacher, test, db):
        raise HTTPException(status_code=404, detail="Test not found")

    allowed = {".pdf", ".png", ".jpg", ".jpeg"}
    import os
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in allowed:
        raise HTTPException(status_code=400, detail="Only PDF, PNG, JPG files allowed")

    upload_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads", "test_papers")
    os.makedirs(upload_dir, exist_ok=True)

    safe_name = f"test_{test_id}{ext}"
    file_path = os.path.join(upload_dir, safe_name)

    with open(file_path, "wb") as f:
        content = file.file.read()
        if len(content) > 10 * 1024 * 1024:  # 10MB limit
            raise HTTPException(status_code=400, detail="File too large (max 10MB)")
        f.write(content)

    test.test_file_path = f"uploads/test_papers/{safe_name}"
    db.commit()
    return {"message": "Test paper uploaded", "file_path": test.test_file_path}


@router.get("/{test_id}/paper")
def download_test_paper(
    test_id: int,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    """Download the uploaded test paper."""
    test = db.query(Test).filter(Test.id == test_id).first()
    if not test or not _can_access_test(teacher, test, db):
        raise HTTPException(status_code=404, detail="Test not found")
    if not test.test_file_path:
        raise HTTPException(status_code=404, detail="No test paper uploaded")

    import os
    file_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), test.test_file_path)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on server")

    return FileResponse(file_path, filename=os.path.basename(file_path))


@router.get("/{test_id}/questions")
def get_test_questions(
    test_id: int,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    """Return the full questions for a bank-generated test."""
    test = db.query(Test).filter(Test.id == test_id).first()
    if not test or not _can_access_test(teacher, test, db):
        raise HTTPException(status_code=404, detail="Test not found")

    tqs = (
        db.query(TestQuestion)
        .filter(TestQuestion.test_id == test_id)
        .order_by(TestQuestion.question_number)
        .all()
    )

    # Check if current user has flagged any of these questions
    from sqlalchemy import and_
    flagged_ids = set()
    if tqs:
        q_ids = [tq.question_id for tq in tqs]
        user_flags = db.query(QuestionFlag.question_id).filter(
            QuestionFlag.question_id.in_(q_ids),
            QuestionFlag.teacher_id == teacher.id,
        ).all()
        flagged_ids = {f.question_id for f in user_flags}

        # Also get total flag counts
        flag_counts_q = (
            db.query(QuestionFlag.question_id, func.count(QuestionFlag.id).label("cnt"))
            .filter(QuestionFlag.question_id.in_(q_ids))
            .group_by(QuestionFlag.question_id)
            .all()
        )
        flag_counts = {r.question_id: r.cnt for r in flag_counts_q}
    else:
        flag_counts = {}

    result = []
    for tq in tqs:
        q = tq.question
        if not q:
            continue
        result.append({
            "question_number": tq.question_number,
            "section_name": tq.section_name,
            "question_id": q.id,
            "question_text": q.question_text,
            "option_a": q.option_a,
            "option_b": q.option_b,
            "option_c": q.option_c,
            "option_d": q.option_d,
            "option_e": q.option_e,
            "num_options": q.num_options,
            "correct_answer": q.correct_answer,
            "difficulty": q.difficulty,
            "skill_type": q.skill_type,
            "topic_name": q.topic.name if q.topic else None,
            "strand": q.topic.strand if q.topic else None,
            "key_stage": q.key_stage,
            "year_group": q.year_group,
            "explanation": q.explanation,
            "distractor_rationale": q.distractor_rationale,
            "image_url": q.image_url,
            "source": q.source,
            "flagged_by_me": q.id in flagged_ids,
            "flag_count": flag_counts.get(q.id, 0),
        })
    return result


@router.post("/generate", response_model=TestResponse)
def generate_test_from_bank(
    data: TestGenerate,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    """Generate a test by picking specific questions from the bank."""
    subject = db.query(Subject).filter(Subject.id == data.subject_id).first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    # Collect all question IDs from all sections
    all_q_ids = []
    for sec in data.sections:
        all_q_ids.extend(sec.question_ids)

    # Validate all questions exist, are active, and approved
    questions = db.query(Question).filter(
        Question.id.in_(all_q_ids), Question.is_active == True, Question.status == "approved"
    ).all()
    q_map = {q.id: q for q in questions}

    missing = set(all_q_ids) - set(q_map.keys())
    if missing:
        raise HTTPException(status_code=400, detail=f"Questions not found: {missing}")

    # Create test
    test = Test(name=data.name, teacher_id=teacher.id, subject_id=data.subject_id, is_bank_test=True)
    if data.test_date:
        from datetime import datetime as dt
        try:
            test.test_date = dt.fromisoformat(data.test_date)
        except ValueError:
            pass

    db.add(test)
    db.flush()

    # Create sections, test_questions, and answer_keys
    q_number = 1
    for i, sec in enumerate(data.sections):
        # Determine num_options from questions (use max across section)
        sec_questions = [q_map[qid] for qid in sec.question_ids]
        max_options = max(q.num_options for q in sec_questions) if sec_questions else 4

        section = TestSection(
            test_id=test.id,
            section_name=sec.section_name,
            num_questions=len(sec.question_ids),
            num_options=max_options,
            start_question=q_number,
            order_index=i,
            page_number=i + 1,
        )
        db.add(section)

        for qid in sec.question_ids:
            q = q_map[qid]
            # TestQuestion link
            tq = TestQuestion(
                test_id=test.id,
                question_id=qid,
                section_name=sec.section_name,
                question_number=q_number,
            )
            db.add(tq)

            # Auto-populate answer key
            ak = AnswerKey(
                test_id=test.id,
                question_number=q_number,
                section_name=sec.section_name,
                correct_answer=q.correct_answer,
            )
            db.add(ak)
            q_number += 1

    db.commit()
    db.refresh(test)
    return _build_test_response(test)


@router.post("/auto-generate", response_model=TestResponse)
def auto_generate_test(
    data: TestAutoGenerate,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    """Auto-generate a test by randomly selecting questions by criteria."""
    subject = db.query(Subject).filter(Subject.id == data.subject_id).first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    # Build sections with randomly selected question IDs
    generated_sections = []
    used_ids = set()

    for sec in data.sections:
        selected_ids = []

        # Base filter builder
        def _base_filter():
            filters = [
                Question.subject_id == data.subject_id,
                Question.topic_id.in_(sec.topic_ids),
                Question.is_active == True,
                Question.status == "approved",
            ]
            if used_ids:
                filters.append(~Question.id.in_(used_ids))
            if sec.skill_type:
                filters.append(Question.skill_type == sec.skill_type)
            if sec.difficulty and not sec.difficulty_mix:
                filters.append(Question.difficulty == sec.difficulty)
            return filters

        if sec.difficulty_mix:
            # Pick questions per difficulty level
            for difficulty, count in sec.difficulty_mix.items():
                base = _base_filter()
                base.append(Question.difficulty == difficulty)
                pool = (
                    db.query(Question)
                    .filter(*base)
                    .order_by(func.random())
                    .limit(count)
                    .all()
                )
                selected_ids.extend(q.id for q in pool)
                used_ids.update(q.id for q in pool)
        else:
            # Pick randomly from all matching questions
            pool = (
                db.query(Question)
                .filter(*_base_filter())
                .order_by(func.random())
                .limit(sec.count)
                .all()
            )
            selected_ids = [q.id for q in pool]
            used_ids.update(selected_ids)

        if len(selected_ids) < sec.count:
            raise HTTPException(
                status_code=400,
                detail=f"Not enough questions for section {sec.section_name}. "
                       f"Requested {sec.count}, found {len(selected_ids)}."
            )

        generated_sections.append({
            "section_name": sec.section_name,
            "question_ids": selected_ids,
        })

    # Now create the test using the same logic as generate
    gen_data = TestGenerate(
        name=data.name,
        subject_id=data.subject_id,
        test_date=data.test_date,
        sections=[
            {"section_name": s["section_name"], "question_ids": s["question_ids"]}
            for s in generated_sections
        ],
    )
    return generate_test_from_bank(gen_data, db, teacher)

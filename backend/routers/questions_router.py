from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from database import get_db
from models import Question, Topic, Subject, Teacher
from schemas import QuestionCreate, QuestionUpdate, QuestionResponse
from auth import get_current_teacher
from typing import Optional

router = APIRouter(prefix="/api/questions", tags=["questions"])


def _question_response(q: Question) -> dict:
    return {
        "id": q.id,
        "topic_id": q.topic_id,
        "subject_id": q.subject_id,
        "question_text": q.question_text,
        "option_a": q.option_a,
        "option_b": q.option_b,
        "option_c": q.option_c,
        "option_d": q.option_d,
        "option_e": q.option_e,
        "num_options": q.num_options,
        "correct_answer": q.correct_answer,
        "difficulty": q.difficulty,
        "source": q.source,
        "school_id": q.school_id,
        "created_by": q.created_by,
        "creator_name": q.creator.name if q.creator else None,
        "image_url": q.image_url,
        "explanation": q.explanation,
        "distractor_rationale": q.distractor_rationale,
        "year_group": q.year_group,
        "key_stage": q.key_stage,
        "topic_name": q.topic.name if q.topic else None,
        "strand": q.topic.strand if q.topic else None,
        "subject_name": q.subject.name if q.subject else None,
        "is_active": q.is_active,
        "status": q.status,
        "created_at": q.created_at,
        "updated_at": q.updated_at,
    }


@router.get("", response_model=list[QuestionResponse])
def list_questions(
    subject_id: Optional[int] = None,
    topic_id: Optional[int] = None,
    difficulty: Optional[str] = None,
    key_stage: Optional[str] = None,
    year_group: Optional[str] = None,
    strand: Optional[str] = None,
    search: Optional[str] = None,
    status: Optional[str] = None,
    source: Optional[str] = None,
    limit: int = Query(default=50, le=200),
    offset: int = 0,
    db: Session = Depends(get_db),
    teacher=Depends(get_current_teacher),
):
    """Browse/search question bank with visibility rules."""
    query = db.query(Question).filter(Question.is_active == True)

    # Visibility: system questions + school questions + own teacher questions
    if teacher.role == "super_admin":
        pass  # super admin sees everything
    else:
        visibility = [Question.source == "system"]
        if teacher.school_id:
            visibility.append(
                and_(Question.source == "school", Question.school_id == teacher.school_id)
            )
        visibility.append(
            and_(Question.source == "teacher", Question.created_by == teacher.id)
        )
        query = query.filter(or_(*visibility))

    # Filters
    if subject_id:
        query = query.filter(Question.subject_id == subject_id)
    if topic_id:
        query = query.filter(Question.topic_id == topic_id)
    if difficulty:
        query = query.filter(Question.difficulty == difficulty)
    if key_stage:
        query = query.filter(Question.key_stage == key_stage)
    if year_group:
        query = query.filter(Question.year_group == year_group)
    if status:
        query = query.filter(Question.status == status)
    if source:
        query = query.filter(Question.source == source)
    if strand:
        # Filter by topic's strand
        query = query.join(Topic).filter(Topic.strand == strand)
    if search:
        query = query.filter(Question.question_text.ilike(f"%{search}%"))

    questions = query.order_by(Question.created_at.desc()).offset(offset).limit(limit).all()
    return [_question_response(q) for q in questions]


@router.get("/{question_id}", response_model=QuestionResponse)
def get_question(
    question_id: int,
    db: Session = Depends(get_db),
    teacher=Depends(get_current_teacher),
):
    q = db.query(Question).filter(Question.id == question_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    return _question_response(q)


@router.post("", response_model=QuestionResponse, status_code=201)
def create_question(
    data: QuestionCreate,
    db: Session = Depends(get_db),
    teacher=Depends(get_current_teacher),
):
    # Validate topic exists
    topic = db.query(Topic).filter(Topic.id == data.topic_id).first()
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")

    # Validate subject exists
    subject = db.query(Subject).filter(Subject.id == data.subject_id).first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    # Determine source and permissions
    if data.source == "system" and teacher.role != "super_admin":
        raise HTTPException(status_code=403, detail="Only super admins can create system questions")

    if data.source == "school" and teacher.role not in ("super_admin", "school_admin", "hod"):
        raise HTTPException(status_code=403, detail="Only school managers can create school questions")

    q = Question(
        topic_id=data.topic_id,
        subject_id=data.subject_id,
        question_text=data.question_text,
        option_a=data.option_a,
        option_b=data.option_b,
        option_c=data.option_c,
        option_d=data.option_d,
        option_e=data.option_e,
        num_options=data.num_options,
        correct_answer=data.correct_answer.upper(),
        difficulty=data.difficulty,
        source=data.source,
        school_id=data.school_id if data.source == "school" else (teacher.school_id if data.source == "school" else None),
        created_by=teacher.id,
        image_url=data.image_url,
        explanation=data.explanation,
        year_group=data.year_group,
        key_stage=data.key_stage,
        status=data.status if teacher.role == "super_admin" else "approved",
    )
    db.add(q)
    db.commit()
    db.refresh(q)
    return _question_response(q)


@router.put("/{question_id}", response_model=QuestionResponse)
def update_question(
    question_id: int,
    data: QuestionUpdate,
    db: Session = Depends(get_db),
    teacher=Depends(get_current_teacher),
):
    q = db.query(Question).filter(Question.id == question_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")

    # Only creator, super_admin, or school managers (for school questions) can edit
    can_edit = (
        teacher.role == "super_admin"
        or q.created_by == teacher.id
        or (q.source == "school" and teacher.role in ("school_admin", "hod") and q.school_id == teacher.school_id)
    )
    if not can_edit:
        raise HTTPException(status_code=403, detail="Not authorised to edit this question")

    update_data = data.model_dump(exclude_unset=True)
    if "correct_answer" in update_data and update_data["correct_answer"]:
        update_data["correct_answer"] = update_data["correct_answer"].upper()

    for field, value in update_data.items():
        setattr(q, field, value)

    db.commit()
    db.refresh(q)
    return _question_response(q)


@router.delete("/{question_id}", status_code=204)
def delete_question(
    question_id: int,
    db: Session = Depends(get_db),
    teacher=Depends(get_current_teacher),
):
    q = db.query(Question).filter(Question.id == question_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")

    can_delete = (
        teacher.role == "super_admin"
        or q.created_by == teacher.id
        or (q.source == "school" and teacher.role in ("school_admin", "hod") and q.school_id == teacher.school_id)
    )
    if not can_delete:
        raise HTTPException(status_code=403, detail="Not authorised to delete this question")

    # Soft delete
    q.is_active = False
    db.commit()


@router.post("/bulk", response_model=list[QuestionResponse], status_code=201)
def bulk_create_questions(
    questions: list[QuestionCreate],
    db: Session = Depends(get_db),
    teacher=Depends(get_current_teacher),
):
    """Bulk import questions."""
    if teacher.role not in ("super_admin", "school_admin", "hod"):
        raise HTTPException(status_code=403, detail="Not authorised for bulk import")

    created = []
    for data in questions:
        q = Question(
            topic_id=data.topic_id,
            subject_id=data.subject_id,
            question_text=data.question_text,
            option_a=data.option_a,
            option_b=data.option_b,
            option_c=data.option_c,
            option_d=data.option_d,
            option_e=data.option_e,
            num_options=data.num_options,
            correct_answer=data.correct_answer.upper(),
            difficulty=data.difficulty,
            source=data.source if teacher.role == "super_admin" else "school",
            school_id=teacher.school_id,
            created_by=teacher.id,
            image_url=data.image_url,
            explanation=data.explanation,
            year_group=data.year_group,
            key_stage=data.key_stage,
            status="approved",
        )
        db.add(q)
        created.append(q)

    db.commit()
    for q in created:
        db.refresh(q)
    return [_question_response(q) for q in created]

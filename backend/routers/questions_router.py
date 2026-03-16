from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from database import get_db
from models import Question, Topic, Subject, Teacher, QuestionFlag
from schemas import QuestionCreate, QuestionUpdate, QuestionResponse, AIGenerateRequest, DiagramGenerateRequest
from auth import get_current_teacher, require_super_admin
from typing import Optional
from sqlalchemy import func
import os
import uuid
import json

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
        "skill_type": q.skill_type,
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
    skill_type: Optional[str] = None,
    search: Optional[str] = None,
    status: Optional[str] = None,
    source: Optional[str] = None,
    limit: int = Query(default=50, le=200),
    offset: int = 0,
    response: Response = None,
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
        # Filter by topic's strand — supports exact match and category prefix
        if ':' in strand:
            query = query.join(Topic).filter(Topic.strand == strand)
        else:
            query = query.join(Topic).filter(or_(Topic.strand == strand, Topic.strand.like(f"{strand}:%")))
    if skill_type:
        query = query.filter(Question.skill_type == skill_type)
    if search:
        query = query.filter(Question.question_text.ilike(f"%{search}%"))

    total = query.count()
    questions = query.order_by(Question.created_at.desc()).offset(offset).limit(limit).all()
    if response:
        response.headers["X-Total-Count"] = str(total)
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
        distractor_rationale=data.distractor_rationale,
        skill_type=data.skill_type,
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


ALLOWED_IMAGE_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"}
QUESTION_IMAGE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads", "question_images")
os.makedirs(QUESTION_IMAGE_DIR, exist_ok=True)


@router.post("/{question_id}/image")
def upload_question_image(
    question_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    teacher=Depends(get_current_teacher),
):
    """Upload an image for a question (geometry diagrams, charts, etc.)."""
    q = db.query(Question).filter(Question.id == question_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")

    can_edit = (
        teacher.role == "super_admin"
        or q.created_by == teacher.id
        or (q.source == "school" and teacher.role in ("school_admin", "hod") and q.school_id == teacher.school_id)
    )
    if not can_edit:
        raise HTTPException(status_code=403, detail="Not authorised to edit this question")

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_IMAGE_EXT:
        raise HTTPException(status_code=400, detail=f"Only image files allowed ({', '.join(ALLOWED_IMAGE_EXT)})")

    content = file.file.read()
    if len(content) > 5 * 1024 * 1024:  # 5MB limit
        raise HTTPException(status_code=400, detail="File too large (max 5MB)")

    # Delete old image if exists
    if q.image_url:
        base_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads", "question_images")
        old_path = os.path.normpath(os.path.join(base_dir, os.path.basename(q.image_url)))
        if old_path.startswith(os.path.normpath(base_dir)) and os.path.exists(old_path):
            os.remove(old_path)

    # Save with unique name
    safe_name = f"q_{question_id}_{uuid.uuid4().hex[:8]}{ext}"
    file_path = os.path.join(QUESTION_IMAGE_DIR, safe_name)
    with open(file_path, "wb") as f:
        f.write(content)

    q.image_url = f"uploads/question_images/{safe_name}"
    db.commit()
    db.refresh(q)
    return {"message": "Image uploaded", "image_url": q.image_url}


@router.delete("/{question_id}/image")
def delete_question_image(
    question_id: int,
    db: Session = Depends(get_db),
    teacher=Depends(get_current_teacher),
):
    """Remove the image from a question."""
    q = db.query(Question).filter(Question.id == question_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")

    can_edit = (
        teacher.role == "super_admin"
        or q.created_by == teacher.id
        or (q.source == "school" and teacher.role in ("school_admin", "hod") and q.school_id == teacher.school_id)
    )
    if not can_edit:
        raise HTTPException(status_code=403, detail="Not authorised to edit this question")

    if q.image_url:
        base_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads", "question_images")
        old_path = os.path.normpath(os.path.join(base_dir, os.path.basename(q.image_url)))
        if old_path.startswith(os.path.normpath(base_dir)) and os.path.exists(old_path):
            os.remove(old_path)
        q.image_url = None
        db.commit()

    return {"message": "Image removed"}


@router.post("/{question_id}/flag")
def flag_question(
    question_id: int,
    reason: str = "poor_quality",
    comment: Optional[str] = None,
    db: Session = Depends(get_db),
    teacher=Depends(get_current_teacher),
):
    """Flag a question as poor quality. Multiple flags = auto-deactivate."""
    q = db.query(Question).filter(Question.id == question_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")

    # Check if already flagged by this teacher
    existing = db.query(QuestionFlag).filter(
        QuestionFlag.question_id == question_id,
        QuestionFlag.teacher_id == teacher.id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="You have already flagged this question")

    allowed_reasons = ["poor_quality", "incorrect", "unclear", "duplicate"]
    if reason not in allowed_reasons:
        reason = "poor_quality"

    flag = QuestionFlag(
        question_id=question_id,
        teacher_id=teacher.id,
        reason=reason,
        comment=comment,
    )
    db.add(flag)

    # Auto-deactivate if 3+ flags from different teachers
    flag_count = db.query(func.count(QuestionFlag.id)).filter(
        QuestionFlag.question_id == question_id
    ).scalar() or 0
    if flag_count + 1 >= 3:
        q.is_active = False
        q.status = "rejected"

    db.commit()
    return {"message": "Question flagged", "flag_count": flag_count + 1}


@router.delete("/{question_id}/flag")
def unflag_question(
    question_id: int,
    db: Session = Depends(get_db),
    teacher=Depends(get_current_teacher),
):
    """Remove your flag from a question."""
    flag = db.query(QuestionFlag).filter(
        QuestionFlag.question_id == question_id,
        QuestionFlag.teacher_id == teacher.id,
    ).first()
    if not flag:
        raise HTTPException(status_code=404, detail="No flag found")
    db.delete(flag)
    db.commit()
    return {"message": "Flag removed"}


@router.get("/flagged/list")
def list_flagged_questions(
    limit: int = Query(default=50, le=200),
    db: Session = Depends(get_db),
    teacher=Depends(get_current_teacher),
):
    """Admin: list questions that have been flagged."""
    if teacher.role != "super_admin":
        raise HTTPException(status_code=403, detail="Admin only")

    flagged = (
        db.query(
            Question.id,
            Question.question_text,
            Question.subject_id,
            Question.is_active,
            func.count(QuestionFlag.id).label("flag_count"),
        )
        .join(QuestionFlag, QuestionFlag.question_id == Question.id)
        .group_by(Question.id)
        .order_by(func.count(QuestionFlag.id).desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "question_id": f.id,
            "question_text": f.question_text[:100],
            "subject_id": f.subject_id,
            "is_active": f.is_active,
            "flag_count": f.flag_count,
        }
        for f in flagged
    ]


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
            distractor_rationale=data.distractor_rationale,
            skill_type=data.skill_type,
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


@router.post("/ai-generate", response_model=list[QuestionResponse], status_code=201)
def ai_generate_questions(
    data: AIGenerateRequest,
    db: Session = Depends(get_db),
    teacher=Depends(get_current_teacher),
):
    """Use AI to batch-generate questions and save them to the database."""
    # Only super_admin can generate system questions; school managers can generate school questions
    if data.source == "system" and teacher.role != "super_admin":
        raise HTTPException(status_code=403, detail="Only super admins can create system questions")
    if data.source == "school" and teacher.role not in ("super_admin", "school_admin", "hod"):
        raise HTTPException(status_code=403, detail="Only school managers can create school questions")

    if data.count < 1 or data.count > 20:
        raise HTTPException(status_code=400, detail="Count must be between 1 and 20")

    # Validate topic and subject exist
    topic = db.query(Topic).filter(Topic.id == data.topic_id).first()
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    subject = db.query(Subject).filter(Subject.id == data.subject_id).first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    # Call AI service
    from services.ai_questions import generate_questions

    try:
        ai_questions = generate_questions(
            topic_name=topic.name,
            subject_name=subject.name,
            count=data.count,
            difficulty=data.difficulty,
            key_stage=data.key_stage,
            year_group=data.year_group,
            num_options=data.num_options,
            skill_type=data.skill_type,
            strand=topic.strand,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI generation failed: {str(e)}")

    # Save generated questions to database
    created = []
    for aq in ai_questions:
        q = Question(
            topic_id=data.topic_id,
            subject_id=data.subject_id,
            question_text=aq["question_text"],
            option_a=aq["option_a"],
            option_b=aq["option_b"],
            option_c=aq.get("option_c"),
            option_d=aq.get("option_d"),
            option_e=aq.get("option_e"),
            num_options=data.num_options,
            correct_answer=aq["correct_answer"],
            difficulty=data.difficulty,
            source=data.source,
            school_id=teacher.school_id if data.source == "school" else None,
            created_by=teacher.id,
            explanation=aq.get("explanation"),
            distractor_rationale=aq.get("distractor_rationale"),
            skill_type=aq.get("skill_type", data.skill_type),
            year_group=data.year_group,
            key_stage=topic.key_stage or data.key_stage,
            is_active=True,
            status="approved",
        )
        db.add(q)
        created.append(q)

    db.commit()
    for q in created:
        db.refresh(q)
    return [_question_response(q) for q in created]


@router.post("/{question_id}/generate-diagram")
def generate_diagram_for_question(
    question_id: int,
    data: DiagramGenerateRequest,
    db: Session = Depends(get_db),
    teacher=Depends(get_current_teacher),
):
    """Use AI to generate an SVG diagram and attach it to a question."""
    import sys
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))))

    q = db.query(Question).filter(Question.id == question_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")

    can_edit = (
        teacher.role == "super_admin"
        or q.created_by == teacher.id
        or (q.source == "school" and teacher.role in ("school_admin", "hod") and q.school_id == teacher.school_id)
    )
    if not can_edit:
        raise HTTPException(status_code=403, detail="Not authorised to edit this question")

    from diagram_generator import DiagramGenerator

    try:
        gen = DiagramGenerator()
        filename = f"q_{question_id}_{uuid.uuid4().hex[:8]}"
        result = gen.generate(
            description=data.description,
            diagram_type=data.diagram_type,
            output_dir=QUESTION_IMAGE_DIR,
            output_format="svg",
            filename=filename,
            extra_context=data.extra_context,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Diagram generation failed: {str(e)}")

    # Delete old image if exists
    if q.image_url:
        old_path = os.path.normpath(os.path.join(QUESTION_IMAGE_DIR, os.path.basename(q.image_url)))
        if old_path.startswith(os.path.normpath(QUESTION_IMAGE_DIR)) and os.path.exists(old_path):
            os.remove(old_path)

    q.image_url = f"uploads/question_images/{filename}.svg"
    db.commit()
    db.refresh(q)

    return {
        "message": "Diagram generated",
        "image_url": q.image_url,
        "svg_code": result["svg_code"],
    }

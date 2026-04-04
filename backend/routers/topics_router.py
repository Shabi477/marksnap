from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Optional
from database import get_db
from models import Topic, Subject, Question, Objective
from schemas import TopicCreate, TopicResponse, ObjectiveCreate, ObjectiveResponse
from auth import get_current_teacher, require_super_admin

router = APIRouter(prefix="/api/subjects/{subject_id}/topics", tags=["topics"])


def _topic_response(topic: Topic) -> dict:
    return {
        "id": topic.id,
        "name": topic.name,
        "subject_id": topic.subject_id,
        "key_stage": topic.key_stage,
        "strand": topic.strand,
        "order_index": topic.order_index,
        "question_count": len(topic.questions),
        "objective_count": len(topic.objectives),
        "created_at": topic.created_at,
    }


def _objective_response(obj: Objective) -> dict:
    return {
        "id": obj.id,
        "name": obj.name,
        "description": obj.description,
        "topic_id": obj.topic_id,
        "order_index": obj.order_index,
        "question_count": len(obj.questions),
        "created_at": obj.created_at,
    }


@router.get("", response_model=list[TopicResponse])
def list_topics(
    subject_id: int,
    key_stage: Optional[str] = None,
    strand: Optional[str] = None,
    db: Session = Depends(get_db),
    teacher=Depends(get_current_teacher),
):
    subject = db.query(Subject).filter(Subject.id == subject_id).first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    query = db.query(Topic).filter(Topic.subject_id == subject_id)
    if key_stage:
        query = query.filter(Topic.key_stage == key_stage)
    if strand:
        if ':' in strand:
            query = query.filter(Topic.strand == strand)
        else:
            # Match exact (e.g. "Number") or prefix (e.g. "Numeracy" matches "Numeracy: Foundations")
            query = query.filter(or_(Topic.strand == strand, Topic.strand.like(f"{strand}:%")))
    topics = query.order_by(Topic.order_index, Topic.name).all()
    return [_topic_response(t) for t in topics]


@router.post("", response_model=TopicResponse, status_code=201)
def create_topic(
    subject_id: int,
    data: TopicCreate,
    db: Session = Depends(get_db),
    teacher=Depends(get_current_teacher),
):
    # Only super_admin, school_admin, or hod can create topics
    if teacher.role not in ("super_admin", "school_admin", "hod"):
        raise HTTPException(status_code=403, detail="Not authorised to create topics")

    subject = db.query(Subject).filter(Subject.id == subject_id).first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    topic = Topic(name=data.name, subject_id=subject_id, key_stage=data.key_stage, strand=data.strand, order_index=data.order_index)
    db.add(topic)
    db.commit()
    db.refresh(topic)
    return _topic_response(topic)


@router.put("/{topic_id}", response_model=TopicResponse)
def update_topic(
    subject_id: int,
    topic_id: int,
    data: TopicCreate,
    db: Session = Depends(get_db),
    teacher=Depends(get_current_teacher),
):
    if teacher.role not in ("super_admin", "school_admin", "hod"):
        raise HTTPException(status_code=403, detail="Not authorised to edit topics")

    topic = db.query(Topic).filter(Topic.id == topic_id, Topic.subject_id == subject_id).first()
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")

    topic.name = data.name
    topic.key_stage = data.key_stage
    topic.strand = data.strand
    topic.order_index = data.order_index
    db.commit()
    db.refresh(topic)
    return _topic_response(topic)


@router.delete("/{topic_id}", status_code=204)
def delete_topic(
    subject_id: int,
    topic_id: int,
    db: Session = Depends(get_db),
    teacher=Depends(get_current_teacher),
):
    if teacher.role not in ("super_admin", "school_admin", "hod"):
        raise HTTPException(status_code=403, detail="Not authorised to delete topics")

    topic = db.query(Topic).filter(Topic.id == topic_id, Topic.subject_id == subject_id).first()
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")

    # Check if topic has active questions
    active_questions = db.query(Question).filter(
        Question.topic_id == topic_id, Question.is_active == True
    ).count()
    if active_questions > 0:
        raise HTTPException(status_code=400, detail=f"Topic has {active_questions} active questions. Move or delete them first.")

    db.delete(topic)
    db.commit()


# --- Objectives CRUD (nested under topic) ---

@router.get("/{topic_id}/objectives", response_model=list[ObjectiveResponse])
def list_objectives(
    subject_id: int,
    topic_id: int,
    db: Session = Depends(get_db),
    teacher=Depends(get_current_teacher),
):
    topic = db.query(Topic).filter(Topic.id == topic_id, Topic.subject_id == subject_id).first()
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    return [_objective_response(o) for o in topic.objectives]


@router.post("/{topic_id}/objectives", response_model=ObjectiveResponse, status_code=201)
def create_objective(
    subject_id: int,
    topic_id: int,
    data: ObjectiveCreate,
    db: Session = Depends(get_db),
    teacher=Depends(get_current_teacher),
):
    if teacher.role not in ("super_admin", "school_admin", "hod"):
        raise HTTPException(status_code=403, detail="Not authorised to create objectives")

    topic = db.query(Topic).filter(Topic.id == topic_id, Topic.subject_id == subject_id).first()
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")

    obj = Objective(name=data.name, description=data.description, topic_id=topic_id, order_index=data.order_index)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return _objective_response(obj)


@router.put("/{topic_id}/objectives/{objective_id}", response_model=ObjectiveResponse)
def update_objective(
    subject_id: int,
    topic_id: int,
    objective_id: int,
    data: ObjectiveCreate,
    db: Session = Depends(get_db),
    teacher=Depends(get_current_teacher),
):
    if teacher.role not in ("super_admin", "school_admin", "hod"):
        raise HTTPException(status_code=403, detail="Not authorised to edit objectives")

    obj = db.query(Objective).filter(Objective.id == objective_id, Objective.topic_id == topic_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Objective not found")

    obj.name = data.name
    obj.description = data.description
    obj.order_index = data.order_index
    db.commit()
    db.refresh(obj)
    return _objective_response(obj)


@router.delete("/{topic_id}/objectives/{objective_id}", status_code=204)
def delete_objective(
    subject_id: int,
    topic_id: int,
    objective_id: int,
    db: Session = Depends(get_db),
    teacher=Depends(get_current_teacher),
):
    if teacher.role not in ("super_admin", "school_admin", "hod"):
        raise HTTPException(status_code=403, detail="Not authorised to delete objectives")

    obj = db.query(Objective).filter(Objective.id == objective_id, Objective.topic_id == topic_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Objective not found")

    active_questions = db.query(Question).filter(
        Question.objective_id == objective_id, Question.is_active == True
    ).count()
    if active_questions > 0:
        raise HTTPException(status_code=400, detail=f"Objective has {active_questions} active questions. Move or delete them first.")

    db.delete(obj)
    db.commit()

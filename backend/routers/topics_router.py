from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Topic, Subject, Question
from schemas import TopicCreate, TopicResponse
from auth import get_current_teacher, require_super_admin

router = APIRouter(prefix="/api/subjects/{subject_id}/topics", tags=["topics"])


def _topic_response(topic: Topic) -> dict:
    return {
        "id": topic.id,
        "name": topic.name,
        "subject_id": topic.subject_id,
        "order_index": topic.order_index,
        "question_count": len(topic.questions),
        "created_at": topic.created_at,
    }


@router.get("", response_model=list[TopicResponse])
def list_topics(
    subject_id: int,
    db: Session = Depends(get_db),
    teacher=Depends(get_current_teacher),
):
    subject = db.query(Subject).filter(Subject.id == subject_id).first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    topics = (
        db.query(Topic)
        .filter(Topic.subject_id == subject_id)
        .order_by(Topic.order_index, Topic.name)
        .all()
    )
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

    topic = Topic(name=data.name, subject_id=subject_id, order_index=data.order_index)
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

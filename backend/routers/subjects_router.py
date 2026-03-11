from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select
from database import get_db
from models import Teacher, Subject, teacher_subjects
from schemas import SubjectCreate, SubjectResponse, SubjectTeacherAssign
from auth import get_current_teacher

router = APIRouter(prefix="/api/subjects", tags=["subjects"])


def _is_school_manager(teacher: Teacher) -> bool:
    """Check if teacher can manage subjects (school_admin or hod)."""
    return teacher.role in ("school_admin", "hod") and teacher.school_id is not None


def _build_subject_response(subject: Subject, db: Session) -> SubjectResponse:
    rows = db.execute(
        select(teacher_subjects).where(teacher_subjects.c.subject_id == subject.id)
    ).fetchall()
    teacher_count = len(rows)
    hod_ids = [r.teacher_id for r in rows if r.is_hod]
    hod_names = []
    if hod_ids:
        hods = db.query(Teacher).filter(Teacher.id.in_(hod_ids)).all()
        hod_names = [h.name for h in hods]
    return SubjectResponse(
        id=subject.id,
        name=subject.name,
        school_id=subject.school_id,
        teacher_count=teacher_count,
        hod_names=hod_names,
        created_at=subject.created_at,
    )


@router.get("/", response_model=list[SubjectResponse])
def list_subjects(
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    if not teacher.school_id:
        return []
    subjects = db.query(Subject).filter(Subject.school_id == teacher.school_id).order_by(Subject.name).all()
    return [_build_subject_response(s, db) for s in subjects]


@router.post("/", response_model=SubjectResponse)
def create_subject(
    data: SubjectCreate,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    if not _is_school_manager(teacher):
        raise HTTPException(status_code=403, detail="Only school admin or HOD can create subjects")
    subject = Subject(name=data.name, school_id=teacher.school_id)
    db.add(subject)
    db.commit()
    db.refresh(subject)
    return _build_subject_response(subject, db)


@router.delete("/{subject_id}")
def delete_subject(
    subject_id: int,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    if not _is_school_manager(teacher):
        raise HTTPException(status_code=403, detail="Only school admin or HOD can delete subjects")
    subject = db.query(Subject).filter(Subject.id == subject_id, Subject.school_id == teacher.school_id).first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
    # Remove teacher-subject links
    db.execute(teacher_subjects.delete().where(teacher_subjects.c.subject_id == subject_id))
    db.delete(subject)
    db.commit()
    return {"message": f"Subject '{subject.name}' deleted"}


@router.post("/{subject_id}/teachers")
def assign_teacher_to_subject(
    subject_id: int,
    data: SubjectTeacherAssign,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    if not _is_school_manager(teacher):
        raise HTTPException(status_code=403, detail="Only school admin or HOD can assign teachers")
    subject = db.query(Subject).filter(Subject.id == subject_id, Subject.school_id == teacher.school_id).first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
    target = db.query(Teacher).filter(Teacher.id == data.teacher_id, Teacher.school_id == teacher.school_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Teacher not found in school")

    # Check if already assigned
    existing = db.execute(
        select(teacher_subjects).where(
            teacher_subjects.c.teacher_id == data.teacher_id,
            teacher_subjects.c.subject_id == subject_id,
        )
    ).first()
    if existing:
        # Update is_hod flag
        db.execute(
            teacher_subjects.update().where(
                teacher_subjects.c.teacher_id == data.teacher_id,
                teacher_subjects.c.subject_id == subject_id,
            ).values(is_hod=1 if data.is_hod else 0)
        )
    else:
        db.execute(
            teacher_subjects.insert().values(
                teacher_id=data.teacher_id,
                subject_id=subject_id,
                is_hod=1 if data.is_hod else 0,
            )
        )
    db.commit()
    return {"message": f"Teacher assigned to {subject.name}" + (" as HOD" if data.is_hod else "")}


@router.delete("/{subject_id}/teachers/{teacher_id}")
def remove_teacher_from_subject(
    subject_id: int,
    teacher_id: int,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    if not _is_school_manager(teacher):
        raise HTTPException(status_code=403, detail="Only school admin or HOD can manage subjects")
    subject = db.query(Subject).filter(Subject.id == subject_id, Subject.school_id == teacher.school_id).first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
    db.execute(
        teacher_subjects.delete().where(
            teacher_subjects.c.teacher_id == teacher_id,
            teacher_subjects.c.subject_id == subject_id,
        )
    )
    db.commit()
    return {"message": "Teacher removed from subject"}


@router.get("/{subject_id}/teachers")
def get_subject_teachers(
    subject_id: int,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    if not teacher.school_id:
        raise HTTPException(status_code=403, detail="Not in a school")
    subject = db.query(Subject).filter(Subject.id == subject_id, Subject.school_id == teacher.school_id).first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
    rows = db.execute(
        select(teacher_subjects).where(teacher_subjects.c.subject_id == subject_id)
    ).fetchall()
    teacher_ids = [r.teacher_id for r in rows]
    is_hod_map = {r.teacher_id: bool(r.is_hod) for r in rows}
    teachers = db.query(Teacher).filter(Teacher.id.in_(teacher_ids)).all() if teacher_ids else []
    return [
        {"id": t.id, "name": t.name, "email": t.email, "role": t.role, "is_hod": is_hod_map.get(t.id, False)}
        for t in teachers
    ]

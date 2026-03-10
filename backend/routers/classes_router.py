from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from database import get_db
from models import Teacher, ClassGroup, Student
from schemas import ClassCreate, ClassResponse, StudentCreate, StudentResponse
from auth import get_current_teacher
import uuid
import csv
import io

router = APIRouter(prefix="/api/classes", tags=["classes"])


@router.get("/", response_model=list[ClassResponse])
def list_classes(
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    classes = db.query(ClassGroup).filter(ClassGroup.teacher_id == teacher.id).all()
    result = []
    for c in classes:
        student_count = db.query(Student).filter(Student.class_id == c.id).count()
        result.append(ClassResponse(
            id=c.id, name=c.name, academic_year=c.academic_year,
            teacher_id=c.teacher_id, student_count=student_count,
            created_at=c.created_at,
        ))
    return result


@router.post("/", response_model=ClassResponse)
def create_class(
    data: ClassCreate,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    class_group = ClassGroup(
        name=data.name, academic_year=data.academic_year,
        teacher_id=teacher.id,
    )
    db.add(class_group)
    db.commit()
    db.refresh(class_group)
    return ClassResponse(
        id=class_group.id, name=class_group.name,
        academic_year=class_group.academic_year,
        teacher_id=class_group.teacher_id, student_count=0,
        created_at=class_group.created_at,
    )


@router.get("/{class_id}/students", response_model=list[StudentResponse])
def list_students(
    class_id: int,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    class_group = db.query(ClassGroup).filter(
        ClassGroup.id == class_id, ClassGroup.teacher_id == teacher.id
    ).first()
    if not class_group:
        raise HTTPException(status_code=404, detail="Class not found")
    return db.query(Student).filter(Student.class_id == class_id).all()


@router.post("/{class_id}/students", response_model=StudentResponse)
def add_student(
    class_id: int,
    data: StudentCreate,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    class_group = db.query(ClassGroup).filter(
        ClassGroup.id == class_id, ClassGroup.teacher_id == teacher.id
    ).first()
    if not class_group:
        raise HTTPException(status_code=404, detail="Class not found")

    student_code = data.student_code or f"S{uuid.uuid4().hex[:8].upper()}"
    student = Student(
        name=data.name, student_code=student_code, class_id=class_id
    )
    db.add(student)
    db.commit()
    db.refresh(student)
    return student


@router.post("/{class_id}/students/upload")
def upload_students_csv(
    class_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    class_group = db.query(ClassGroup).filter(
        ClassGroup.id == class_id, ClassGroup.teacher_id == teacher.id
    ).first()
    if not class_group:
        raise HTTPException(status_code=404, detail="Class not found")

    content = file.file.read().decode("utf-8")
    reader = csv.DictReader(io.StringIO(content))
    added = 0
    for row in reader:
        name = row.get("name", "").strip()
        if not name:
            continue
        student_code = row.get("student_code", "").strip() or f"S{uuid.uuid4().hex[:8].upper()}"
        existing = db.query(Student).filter(Student.student_code == student_code).first()
        if existing:
            continue
        student = Student(name=name, student_code=student_code, class_id=class_id)
        db.add(student)
        added += 1

    db.commit()
    return {"message": f"Added {added} students", "count": added}


@router.delete("/{class_id}")
def delete_class(
    class_id: int,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    class_group = db.query(ClassGroup).filter(
        ClassGroup.id == class_id, ClassGroup.teacher_id == teacher.id
    ).first()
    if not class_group:
        raise HTTPException(status_code=404, detail="Class not found")
    db.query(Student).filter(Student.class_id == class_id).delete()
    db.delete(class_group)
    db.commit()
    return {"message": "Class deleted"}

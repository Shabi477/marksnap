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


def _get_visible_classes(teacher: Teacher, db: Session):
    """Return classes visible to this teacher based on role."""
    if teacher.role == "standalone":
        return db.query(ClassGroup).filter(ClassGroup.owner_id == teacher.id).all()
    elif teacher.role == "hod":
        return db.query(ClassGroup).filter(ClassGroup.school_id == teacher.school_id).all()
    else:  # school teacher
        return teacher.assigned_classes


def _can_access_class(teacher: Teacher, class_group: ClassGroup) -> bool:
    """Check if teacher can access this class."""
    if teacher.role == "standalone":
        return class_group.owner_id == teacher.id
    elif teacher.role == "hod":
        return class_group.school_id == teacher.school_id
    else:
        return class_group in teacher.assigned_classes


@router.get("/", response_model=list[ClassResponse])
def list_classes(
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    classes = _get_visible_classes(teacher, db)
    result = []
    for c in classes:
        teacher_names = [t.name for t in c.teachers] if c.teachers else []
        result.append(ClassResponse(
            id=c.id, name=c.name, academic_year=c.academic_year,
            school_id=c.school_id, owner_id=c.owner_id,
            student_count=len(c.students), teacher_names=teacher_names,
            created_at=c.created_at,
        ))
    return result


@router.post("/", response_model=ClassResponse)
def create_class(
    data: ClassCreate,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    if teacher.role == "teacher":
        raise HTTPException(status_code=403, detail="School teachers cannot create classes. Ask your HOD.")

    class_group = ClassGroup(
        name=data.name, academic_year=data.academic_year,
        owner_id=teacher.id,
        school_id=teacher.school_id,  # None for standalone
    )
    db.add(class_group)
    db.commit()
    db.refresh(class_group)
    return ClassResponse(
        id=class_group.id, name=class_group.name,
        academic_year=class_group.academic_year,
        school_id=class_group.school_id, owner_id=class_group.owner_id,
        student_count=0, teacher_names=[],
        created_at=class_group.created_at,
    )


@router.delete("/{class_id}")
def delete_class(
    class_id: int,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    class_group = db.query(ClassGroup).filter(ClassGroup.id == class_id).first()
    if not class_group or not _can_access_class(teacher, class_group):
        raise HTTPException(status_code=404, detail="Class not found")
    if teacher.role == "teacher":
        raise HTTPException(status_code=403, detail="Only HOD or class owner can delete classes")
    db.query(Student).filter(Student.class_id == class_id).delete()
    db.delete(class_group)
    db.commit()
    return {"message": "Class deleted"}


@router.get("/{class_id}/students", response_model=list[StudentResponse])
def list_students(
    class_id: int,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    class_group = db.query(ClassGroup).filter(ClassGroup.id == class_id).first()
    if not class_group or not _can_access_class(teacher, class_group):
        raise HTTPException(status_code=404, detail="Class not found")
    students = db.query(Student).filter(Student.class_id == class_id).all()
    return [
        StudentResponse(
            id=s.id, name=s.name, student_code=s.student_code,
            class_id=s.class_id, class_name=class_group.name,
        )
        for s in students
    ]


@router.post("/{class_id}/students", response_model=StudentResponse)
def add_student(
    class_id: int,
    data: StudentCreate,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    class_group = db.query(ClassGroup).filter(ClassGroup.id == class_id).first()
    if not class_group or not _can_access_class(teacher, class_group):
        raise HTTPException(status_code=404, detail="Class not found")

    student_code = data.student_code or f"S{uuid.uuid4().hex[:8].upper()}"
    student = Student(
        name=data.name, student_code=student_code, class_id=class_id
    )
    db.add(student)
    db.commit()
    db.refresh(student)
    return StudentResponse(
        id=student.id, name=student.name, student_code=student.student_code,
        class_id=student.class_id, class_name=class_group.name,
    )


@router.delete("/{class_id}/students/{student_id}")
def remove_student(
    class_id: int,
    student_id: int,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    class_group = db.query(ClassGroup).filter(ClassGroup.id == class_id).first()
    if not class_group or not _can_access_class(teacher, class_group):
        raise HTTPException(status_code=404, detail="Class not found")
    student = db.query(Student).filter(Student.id == student_id, Student.class_id == class_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    db.delete(student)
    db.commit()
    return {"message": "Student removed"}


@router.post("/{class_id}/students/upload")
def upload_students_csv(
    class_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    class_group = db.query(ClassGroup).filter(ClassGroup.id == class_id).first()
    if not class_group or not _can_access_class(teacher, class_group):
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


@router.get("/search-students", response_model=list[StudentResponse])
def search_students_in_my_classes(
    q: str = "",
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    """Search students across classes visible to this teacher."""
    visible_classes = _get_visible_classes(teacher, db)
    class_ids = [c.id for c in visible_classes]
    if not class_ids:
        return []

    query = db.query(Student).join(ClassGroup, Student.class_id == ClassGroup.id).filter(Student.class_id.in_(class_ids))
    if q:
        query = query.filter(
            (Student.name.ilike(f"%{q}%")) | (Student.student_code.ilike(f"%{q}%"))
        )
    students = query.limit(50).all()

    return [
        StudentResponse(
            id=s.id, name=s.name, student_code=s.student_code,
            class_id=s.class_id, class_name=s.class_group.name if s.class_group else "",
        )
        for s in students
    ]


@router.post("/{class_id}/add-existing-student")
def add_existing_student_to_class(
    class_id: int,
    student_id: int,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    """Move an existing student from another class to this class."""
    class_group = db.query(ClassGroup).filter(ClassGroup.id == class_id).first()
    if not class_group or not _can_access_class(teacher, class_group):
        raise HTTPException(status_code=404, detail="Class not found")

    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    student.class_id = class_id
    db.commit()
    return {"message": f"{student.name} moved to {class_group.name}"}

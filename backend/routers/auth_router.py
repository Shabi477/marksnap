from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
from models import Teacher, School
from schemas import TeacherCreate, TeacherLogin, TeacherResponse, Token, SchoolRegister, SchoolResponse
from auth import hash_password, verify_password, create_access_token, get_current_teacher

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _teacher_response(teacher: Teacher) -> dict:
    return {
        "id": teacher.id,
        "email": teacher.email,
        "name": teacher.name,
        "role": teacher.role,
        "tier": teacher.tier,
        "school_id": teacher.school_id,
        "school_name": teacher.school.name if teacher.school else None,
        "school_type": teacher.school.school_type if teacher.school else None,
        "region": teacher.school.region if teacher.school else None,
        "school_tier": teacher.school.tier if teacher.school else None,
        "created_at": teacher.created_at,
    }


@router.post("/register", response_model=TeacherResponse)
def register(data: TeacherCreate, db: Session = Depends(get_db)):
    """Register as standalone teacher or join a school with invite code."""
    existing = db.query(Teacher).filter(Teacher.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    school_id = None
    role = "standalone"

    if data.invite_code:
        school = db.query(School).filter(School.invite_code == data.invite_code.strip().upper()).first()
        if not school:
            raise HTTPException(status_code=400, detail="Invalid invite code")
        school_id = school.id
        role = "teacher"

    teacher = Teacher(
        email=data.email,
        name=data.name,
        password_hash=hash_password(data.password),
        role=role,
        school_id=school_id,
    )
    db.add(teacher)
    db.commit()
    db.refresh(teacher)
    return _teacher_response(teacher)


@router.post("/register-school", response_model=SchoolResponse)
def register_school(data: SchoolRegister, db: Session = Depends(get_db)):
    """Register a new school and create the HOD account."""
    existing = db.query(Teacher).filter(Teacher.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    school = School(
        name=data.school_name,
        school_type=data.school_type,
        region=data.region,
        tier=data.tier,
    )
    db.add(school)
    db.flush()

    teacher = Teacher(
        email=data.email,
        name=data.name,
        password_hash=hash_password(data.password),
        role="hod",
        school_id=school.id,
    )
    db.add(teacher)
    db.commit()
    db.refresh(school)
    return school


@router.post("/login", response_model=Token)
def login(data: TeacherLogin, db: Session = Depends(get_db)):
    teacher = db.query(Teacher).filter(Teacher.email == data.email).first()
    if not teacher or not verify_password(data.password, teacher.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    token = create_access_token(data={"sub": str(teacher.id)})
    return {"access_token": token, "token_type": "bearer"}


@router.get("/me", response_model=TeacherResponse)
def get_me(
    db: Session = Depends(get_db),
    current_teacher: Teacher = Depends(get_current_teacher),
):
    return _teacher_response(current_teacher)

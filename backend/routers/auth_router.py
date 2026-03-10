from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
from models import Teacher
from schemas import TeacherCreate, TeacherLogin, TeacherResponse, Token
from auth import hash_password, verify_password, create_access_token, get_current_teacher

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=TeacherResponse)
def register(data: TeacherCreate, db: Session = Depends(get_db)):
    existing = db.query(Teacher).filter(Teacher.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    teacher = Teacher(
        email=data.email,
        name=data.name,
        password_hash=hash_password(data.password),
    )
    db.add(teacher)
    db.commit()
    db.refresh(teacher)
    return teacher


@router.post("/login", response_model=Token)
def login(data: TeacherLogin, db: Session = Depends(get_db)):
    teacher = db.query(Teacher).filter(Teacher.email == data.email).first()
    if not teacher or not verify_password(data.password, teacher.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    token = create_access_token(data={"sub": teacher.id})
    return {"access_token": token, "token_type": "bearer"}


@router.get("/me", response_model=TeacherResponse)
def get_me(
    db: Session = Depends(get_db),
    current_teacher: Teacher = Depends(get_current_teacher),
):
    return current_teacher

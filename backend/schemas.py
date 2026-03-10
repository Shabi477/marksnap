from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime


# --- School ---
class SchoolCreate(BaseModel):
    name: str

class SchoolResponse(BaseModel):
    id: int
    name: str
    invite_code: str
    created_at: datetime
    class Config:
        from_attributes = True


# --- Auth ---
class TeacherCreate(BaseModel):
    email: EmailStr
    name: str
    password: str
    invite_code: Optional[str] = None  # None = standalone, provided = join school

class SchoolRegister(BaseModel):
    school_name: str
    email: EmailStr
    name: str
    password: str

class TeacherLogin(BaseModel):
    email: EmailStr
    password: str

class TeacherResponse(BaseModel):
    id: int
    email: str
    name: str
    role: str
    school_id: Optional[int] = None
    school_name: Optional[str] = None
    created_at: datetime
    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


# --- Classes ---
class ClassCreate(BaseModel):
    name: str
    academic_year: str

class ClassResponse(BaseModel):
    id: int
    name: str
    academic_year: str
    school_id: Optional[int] = None
    owner_id: Optional[int] = None
    student_count: int = 0
    teacher_names: list[str] = []
    created_at: datetime
    class Config:
        from_attributes = True

class AssignTeacher(BaseModel):
    teacher_id: int
    class_id: int


# --- Students ---
class StudentCreate(BaseModel):
    name: str
    student_code: Optional[str] = None

class StudentResponse(BaseModel):
    id: int
    name: str
    student_code: str
    class_id: int
    class_name: Optional[str] = None
    class Config:
        from_attributes = True

class StudentTransfer(BaseModel):
    student_id: int
    to_class_id: int


# --- Tests ---
class SectionConfig(BaseModel):
    section_name: str
    num_questions: int
    num_options: int = 4
    page_number: int = 1

class TestCreate(BaseModel):
    name: str
    sections: list[SectionConfig]

class TestResponse(BaseModel):
    id: int
    name: str
    teacher_id: int
    sections: list[SectionConfig] = []
    created_at: datetime
    class Config:
        from_attributes = True


# --- Answer Keys ---
class AnswerKeyEntry(BaseModel):
    question_number: int
    section_name: str
    correct_answer: str

class AnswerKeyCreate(BaseModel):
    answers: list[AnswerKeyEntry]


# --- Scan ---
class ScanBatchResponse(BaseModel):
    id: int
    test_id: int
    status: str
    total_pages: int
    processed_pages: int
    uploaded_at: datetime
    error_message: Optional[str] = None
    class Config:
        from_attributes = True


# --- Results ---
class StudentResult(BaseModel):
    student_id: int
    student_name: str
    student_code: str
    class_name: str
    answers: dict[str, Optional[str]]  # {"Q1": "A", "Q2": "B", ...}
    correct: dict[str, bool]  # {"Q1": True, "Q2": False, ...}
    score: int
    total: int
    percentage: float

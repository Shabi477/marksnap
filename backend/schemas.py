from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime, date


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


# --- Subjects ---
class SubjectCreate(BaseModel):
    name: str

class SubjectResponse(BaseModel):
    id: int
    name: str
    school_id: int
    teacher_count: int = 0
    hod_names: list[str] = []
    created_at: datetime
    class Config:
        from_attributes = True

class SubjectTeacherAssign(BaseModel):
    teacher_id: int
    is_hod: bool = False


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
    subject_id: Optional[int] = None
    test_date: Optional[str] = None  # ISO date string e.g. '2026-03-10'

class TestResponse(BaseModel):
    id: int
    name: str
    teacher_id: int
    subject_id: Optional[int] = None
    subject_name: Optional[str] = None
    test_date: Optional[datetime] = None
    has_answer_key: bool = False
    has_test_file: bool = False
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
    flagged_count: int = 0
    class Config:
        from_attributes = True

class ScanResultResponse(BaseModel):
    id: int
    scan_batch_id: int
    student_id: Optional[int] = None
    student_code: Optional[str] = None
    student_name: Optional[str] = None
    page_number: int
    section_name: str
    question_number: int
    selected_answer: Optional[str] = None
    is_correct: Optional[bool] = None
    confidence: float
    needs_review: bool = False
    class Config:
        from_attributes = True

class ScanResultCorrection(BaseModel):
    selected_answer: str

class LiveScanResponse(BaseModel):
    student_name: Optional[str] = None
    student_code: Optional[str] = None
    score: int
    total: int
    percentage: float
    flagged_count: int = 0
    answers: dict[str, Optional[str]] = {}
    correct: dict[str, bool] = {}


# --- Test Assignments ---
class TestAssignmentCreate(BaseModel):
    test_id: int
    class_ids: list[int] = []
    teacher_ids: list[int] = []
    year_groups: list[str] = []

class TestAssignmentResponse(BaseModel):
    id: int
    test_id: int
    test_name: str
    class_id: Optional[int] = None
    class_name: Optional[str] = None
    teacher_id: Optional[int] = None
    teacher_name: Optional[str] = None
    year_group: Optional[str] = None
    assigned_by_name: str
    created_at: datetime
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

class StudentProgressEntry(BaseModel):
    test_id: int
    test_name: str
    subject_name: Optional[str] = None
    test_date: Optional[datetime] = None
    score: int
    total: int
    percentage: float
    scanned_at: Optional[datetime] = None

class StudentProgressReport(BaseModel):
    student_id: int
    student_name: str
    student_code: str
    class_name: str
    tests: list[StudentProgressEntry] = []
    average_percentage: float = 0.0

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
    school_type: Optional[str] = None
    region: str = "UK"
    tier: str = "free"
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
    school_type: Optional[str] = None  # 'primary' or 'secondary'
    region: str = "UK"
    tier: str = "free"  # 'free', 'standard', 'premium', 'all_access'

class TeacherLogin(BaseModel):
    email: EmailStr
    password: str

class TeacherResponse(BaseModel):
    id: int
    email: str
    name: str
    role: str
    tier: str = "free"
    school_id: Optional[int] = None
    school_name: Optional[str] = None
    school_type: Optional[str] = None
    region: Optional[str] = None
    school_tier: Optional[str] = None
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
    school_id: Optional[int] = None
    is_default: bool = False
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
    key_stage: Optional[str] = None  # 'KS1', 'KS2', 'KS3', 'KS4', 'KS5'

class ClassResponse(BaseModel):
    id: int
    name: str
    academic_year: str
    key_stage: Optional[str] = None
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

class ScanResultAssignStudent(BaseModel):
    student_id: int

class LiveScanResponse(BaseModel):
    student_name: Optional[str] = None
    student_code: Optional[str] = None


# --- Topics ---
class TopicCreate(BaseModel):
    name: str
    key_stage: Optional[str] = None
    strand: Optional[str] = None
    order_index: int = 0

class TopicResponse(BaseModel):
    id: int
    name: str
    subject_id: int
    key_stage: Optional[str] = None
    strand: Optional[str] = None
    order_index: int = 0
    question_count: int = 0
    created_at: datetime
    class Config:
        from_attributes = True


# --- Questions ---
class QuestionCreate(BaseModel):
    topic_id: int
    subject_id: int
    question_text: str
    option_a: str
    option_b: str
    option_c: Optional[str] = None
    option_d: Optional[str] = None
    option_e: Optional[str] = None
    num_options: int = 4
    correct_answer: str  # 'A'-'E'
    difficulty: str = "medium"  # easy/medium/hard
    source: str = "system"  # system/school/teacher
    school_id: Optional[int] = None
    image_url: Optional[str] = None
    explanation: Optional[str] = None
    distractor_rationale: Optional[str] = None
    year_group: Optional[str] = None
    key_stage: Optional[str] = None
    status: str = "approved"

class QuestionUpdate(BaseModel):
    question_text: Optional[str] = None
    option_a: Optional[str] = None
    option_b: Optional[str] = None
    option_c: Optional[str] = None
    option_d: Optional[str] = None
    option_e: Optional[str] = None
    num_options: Optional[int] = None
    correct_answer: Optional[str] = None
    difficulty: Optional[str] = None
    topic_id: Optional[int] = None
    explanation: Optional[str] = None
    distractor_rationale: Optional[str] = None
    year_group: Optional[str] = None
    key_stage: Optional[str] = None
    status: Optional[str] = None

class QuestionResponse(BaseModel):
    id: int
    topic_id: int
    subject_id: int
    question_text: str
    option_a: str
    option_b: str
    option_c: Optional[str] = None
    option_d: Optional[str] = None
    option_e: Optional[str] = None
    num_options: int = 4
    correct_answer: str
    difficulty: str = "medium"
    source: str = "system"
    school_id: Optional[int] = None
    created_by: Optional[int] = None
    creator_name: Optional[str] = None
    image_url: Optional[str] = None
    explanation: Optional[str] = None
    distractor_rationale: Optional[str] = None
    year_group: Optional[str] = None
    key_stage: Optional[str] = None
    topic_name: Optional[str] = None
    strand: Optional[str] = None
    subject_name: Optional[str] = None
    is_active: bool = True
    status: str = "approved"
    created_at: datetime
    updated_at: Optional[datetime] = None
    class Config:
        from_attributes = True


# --- Test Generation from Bank ---
class TestGenerateSection(BaseModel):
    section_name: str
    question_ids: list[int]

class TestGenerate(BaseModel):
    name: str
    subject_id: int
    test_date: Optional[str] = None
    sections: list[TestGenerateSection]

class AutoGenerateSection(BaseModel):
    section_name: str
    topic_ids: list[int]
    count: int
    difficulty_mix: Optional[dict] = None  # {"easy": 5, "medium": 10, "hard": 5}

class TestAutoGenerate(BaseModel):
    name: str
    subject_id: int
    test_date: Optional[str] = None
    sections: list[AutoGenerateSection]


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

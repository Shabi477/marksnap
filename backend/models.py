from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, Float, Text, Table
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime
import secrets
import string


def _generate_invite_code():
    chars = string.ascii_uppercase + string.digits
    return "MARK-" + "".join(secrets.choice(chars) for _ in range(4))


class School(Base):
    __tablename__ = "schools"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    invite_code = Column(String, unique=True, index=True, nullable=False, default=_generate_invite_code)
    school_type = Column(String, nullable=True)  # 'primary' or 'secondary'
    region = Column(String, nullable=False, default="UK")  # 'UK', 'US', etc.
    tier = Column(String, nullable=False, default="free")  # 'free', 'standard', 'premium', 'all_access'
    created_at = Column(DateTime, default=datetime.utcnow)

    teachers = relationship("Teacher", back_populates="school")
    classes = relationship("ClassGroup", back_populates="school")
    subjects = relationship("Subject", back_populates="school")


# Many-to-many: Teacher <-> ClassGroup
teacher_classes = Table(
    "teacher_classes",
    Base.metadata,
    Column("teacher_id", Integer, ForeignKey("teachers.id"), primary_key=True),
    Column("class_id", Integer, ForeignKey("class_groups.id"), primary_key=True),
)

# Many-to-many: Teacher <-> Subject (with is_hod flag)
teacher_subjects = Table(
    "teacher_subjects",
    Base.metadata,
    Column("teacher_id", Integer, ForeignKey("teachers.id"), primary_key=True),
    Column("subject_id", Integer, ForeignKey("subjects.id"), primary_key=True),
    Column("is_hod", Integer, default=0),  # 1 = HOD of this subject
)


class Subject(Base):
    __tablename__ = "subjects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    # Nullable: null = platform-level default subject, set = school-specific subject
    school_id = Column(Integer, ForeignKey("schools.id"), nullable=True)
    is_default = Column(Boolean, default=False)  # True for platform-seeded subjects
    created_at = Column(DateTime, default=datetime.utcnow)

    school = relationship("School", back_populates="subjects")
    teachers = relationship("Teacher", secondary=teacher_subjects, back_populates="subjects")
    tests = relationship("Test", back_populates="subject")
    topics = relationship("Topic", back_populates="subject")
    questions = relationship("Question", back_populates="subject")


class Teacher(Base):
    __tablename__ = "teachers"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False, default="standalone")  # 'super_admin', 'school_admin', 'hod', 'teacher', 'standalone'
    school_id = Column(Integer, ForeignKey("schools.id"), nullable=True)
    tier = Column(String, nullable=False, default="free")  # For standalone teachers: 'free', 'standard', 'premium'
    created_at = Column(DateTime, default=datetime.utcnow)

    school = relationship("School", back_populates="teachers")
    owned_classes = relationship("ClassGroup", back_populates="owner", foreign_keys="ClassGroup.owner_id")
    assigned_classes = relationship("ClassGroup", secondary=teacher_classes, back_populates="teachers")
    tests = relationship("Test", back_populates="teacher")
    subjects = relationship("Subject", secondary=teacher_subjects, back_populates="teachers")


class ClassGroup(Base):
    __tablename__ = "class_groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    academic_year = Column(String, nullable=False)
    key_stage = Column(String, nullable=True)  # 'KS1', 'KS2', 'KS3', 'KS4', 'KS5'
    school_id = Column(Integer, ForeignKey("schools.id"), nullable=True)
    owner_id = Column(Integer, ForeignKey("teachers.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    school = relationship("School", back_populates="classes")
    owner = relationship("Teacher", back_populates="owned_classes", foreign_keys=[owner_id])
    teachers = relationship("Teacher", secondary=teacher_classes, back_populates="assigned_classes")
    students = relationship("Student", back_populates="class_group")


class Student(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    student_code = Column(String, unique=True, index=True, nullable=False)
    class_id = Column(Integer, ForeignKey("class_groups.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    class_group = relationship("ClassGroup", back_populates="students")
    results = relationship("ScanResult", back_populates="student")


class Topic(Base):
    __tablename__ = "topics"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    subject_id = Column(Integer, ForeignKey("subjects.id"), nullable=False)
    key_stage = Column(String, nullable=True)  # KS1/KS2/KS3/KS4
    strand = Column(String, nullable=True)  # e.g. "Number", "Algebra", "Geometry & Measures"
    order_index = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    subject = relationship("Subject", back_populates="topics")
    questions = relationship("Question", back_populates="topic")


class Question(Base):
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, index=True)
    topic_id = Column(Integer, ForeignKey("topics.id"), nullable=False)
    subject_id = Column(Integer, ForeignKey("subjects.id"), nullable=False)  # denormalised
    question_text = Column(Text, nullable=False)
    option_a = Column(String, nullable=False)
    option_b = Column(String, nullable=False)
    option_c = Column(String, nullable=True)
    option_d = Column(String, nullable=True)
    option_e = Column(String, nullable=True)
    num_options = Column(Integer, nullable=False, default=4)
    correct_answer = Column(String, nullable=False)  # 'A'-'E'
    difficulty = Column(String, nullable=False, default="medium")  # easy/medium/hard
    source = Column(String, nullable=False, default="system")  # system/school/teacher
    school_id = Column(Integer, ForeignKey("schools.id"), nullable=True)  # NULL = system-wide
    created_by = Column(Integer, ForeignKey("teachers.id"), nullable=True)
    image_url = Column(String, nullable=True)
    explanation = Column(Text, nullable=True)
    distractor_rationale = Column(Text, nullable=True)  # JSON: {"B": "reason", "C": "reason", ...}
    skill_type = Column(String, nullable=True)  # 'fluency', 'reasoning', 'problem_solving'
    year_group = Column(String, nullable=True)  # e.g. "Year 7", "Year 8"
    key_stage = Column(String, nullable=True)  # KS1-KS5
    is_active = Column(Boolean, default=True)
    status = Column(String, nullable=False, default="approved")  # draft/pending_review/approved/rejected
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    topic = relationship("Topic", back_populates="questions")
    subject = relationship("Subject", back_populates="questions")
    school = relationship("School")
    creator = relationship("Teacher")
    test_questions = relationship("TestQuestion", back_populates="question")


class Test(Base):
    __tablename__ = "tests"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    teacher_id = Column(Integer, ForeignKey("teachers.id"), nullable=False)
    subject_id = Column(Integer, ForeignKey("subjects.id"), nullable=True)
    test_date = Column(DateTime, nullable=True)  # When the test is/was taken
    test_file_path = Column(String, nullable=True)  # Uploaded reference paper
    is_bank_test = Column(Boolean, default=False)  # True if built from question bank
    created_at = Column(DateTime, default=datetime.utcnow)

    teacher = relationship("Teacher", back_populates="tests")
    subject = relationship("Subject", back_populates="tests")
    sections = relationship("TestSection", back_populates="test", order_by="TestSection.order_index")
    answer_keys = relationship("AnswerKey", back_populates="test")
    scan_batches = relationship("ScanBatch", back_populates="test")
    assignments = relationship("TestAssignment", back_populates="test")
    test_questions = relationship("TestQuestion", back_populates="test", order_by="TestQuestion.question_number")


class TestSection(Base):
    __tablename__ = "test_sections"

    id = Column(Integer, primary_key=True, index=True)
    test_id = Column(Integer, ForeignKey("tests.id"), nullable=False)
    section_name = Column(String, nullable=False)
    num_questions = Column(Integer, nullable=False)
    num_options = Column(Integer, nullable=False, default=4)  # A-D=4, A-E=5
    start_question = Column(Integer, nullable=False, default=1)
    order_index = Column(Integer, nullable=False, default=0)
    page_number = Column(Integer, nullable=False, default=1)

    test = relationship("Test", back_populates="sections")


class AnswerKey(Base):
    __tablename__ = "answer_keys"

    id = Column(Integer, primary_key=True, index=True)
    test_id = Column(Integer, ForeignKey("tests.id"), nullable=False)
    question_number = Column(Integer, nullable=False)
    section_name = Column(String, nullable=False)
    correct_answer = Column(String, nullable=False)  # 'A', 'B', 'C', 'D', 'E'

    test = relationship("Test", back_populates="answer_keys")


class TestAssignment(Base):
    __tablename__ = "test_assignments"

    id = Column(Integer, primary_key=True, index=True)
    test_id = Column(Integer, ForeignKey("tests.id"), nullable=False)
    school_id = Column(Integer, ForeignKey("schools.id"), nullable=False)
    assigned_by = Column(Integer, ForeignKey("teachers.id"), nullable=False)
    class_id = Column(Integer, ForeignKey("class_groups.id"), nullable=True)
    teacher_id = Column(Integer, ForeignKey("teachers.id"), nullable=True)
    year_group = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    test = relationship("Test", back_populates="assignments")
    school = relationship("School")
    assigner = relationship("Teacher", foreign_keys=[assigned_by])
    class_group = relationship("ClassGroup")
    target_teacher = relationship("Teacher", foreign_keys=[teacher_id])


class ScanBatch(Base):
    __tablename__ = "scan_batches"

    id = Column(Integer, primary_key=True, index=True)
    test_id = Column(Integer, ForeignKey("tests.id"), nullable=False)
    class_id = Column(Integer, ForeignKey("class_groups.id"), nullable=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    status = Column(String, default="pending")  # pending, processing, completed, error
    total_pages = Column(Integer, default=0)
    processed_pages = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)

    test = relationship("Test", back_populates="scan_batches")
    class_group = relationship("ClassGroup")
    results = relationship("ScanResult", back_populates="scan_batch")


class ScanResult(Base):
    __tablename__ = "scan_results"

    id = Column(Integer, primary_key=True, index=True)
    scan_batch_id = Column(Integer, ForeignKey("scan_batches.id"), nullable=False)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=True)
    student_code = Column(String, nullable=True)
    page_number = Column(Integer, nullable=False)
    section_name = Column(String, nullable=False)
    question_number = Column(Integer, nullable=False)
    selected_answer = Column(String, nullable=True)  # None if no bubble filled
    is_correct = Column(Boolean, nullable=True)
    confidence = Column(Float, default=1.0)
    needs_review = Column(Boolean, default=False)

    scan_batch = relationship("ScanBatch", back_populates="results")
    student = relationship("Student", back_populates="results")


class TestQuestion(Base):
    __tablename__ = "test_questions"

    id = Column(Integer, primary_key=True, index=True)
    test_id = Column(Integer, ForeignKey("tests.id"), nullable=False)
    question_id = Column(Integer, ForeignKey("questions.id"), nullable=False)
    section_name = Column(String, nullable=False, default="A")
    question_number = Column(Integer, nullable=False)  # position in test

    test = relationship("Test", back_populates="test_questions")
    question = relationship("Question", back_populates="test_questions")

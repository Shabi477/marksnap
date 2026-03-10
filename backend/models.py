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
    created_at = Column(DateTime, default=datetime.utcnow)

    teachers = relationship("Teacher", back_populates="school")
    classes = relationship("ClassGroup", back_populates="school")


# Many-to-many: Teacher <-> ClassGroup
teacher_classes = Table(
    "teacher_classes",
    Base.metadata,
    Column("teacher_id", Integer, ForeignKey("teachers.id"), primary_key=True),
    Column("class_id", Integer, ForeignKey("class_groups.id"), primary_key=True),
)


class Teacher(Base):
    __tablename__ = "teachers"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False, default="standalone")  # 'hod', 'teacher', 'standalone'
    school_id = Column(Integer, ForeignKey("schools.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    school = relationship("School", back_populates="teachers")
    owned_classes = relationship("ClassGroup", back_populates="owner", foreign_keys="ClassGroup.owner_id")
    assigned_classes = relationship("ClassGroup", secondary=teacher_classes, back_populates="teachers")
    tests = relationship("Test", back_populates="teacher")


class ClassGroup(Base):
    __tablename__ = "class_groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    academic_year = Column(String, nullable=False)
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


class Test(Base):
    __tablename__ = "tests"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    teacher_id = Column(Integer, ForeignKey("teachers.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    teacher = relationship("Teacher", back_populates="tests")
    sections = relationship("TestSection", back_populates="test", order_by="TestSection.order_index")
    answer_keys = relationship("AnswerKey", back_populates="test")
    scan_batches = relationship("ScanBatch", back_populates="test")
    assignments = relationship("TestAssignment", back_populates="test")


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

    scan_batch = relationship("ScanBatch", back_populates="results")
    student = relationship("Student", back_populates="results")

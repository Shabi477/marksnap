from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, JSON, Float, Text
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime


class Teacher(Base):
    __tablename__ = "teachers"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    classes = relationship("ClassGroup", back_populates="teacher")
    tests = relationship("Test", back_populates="teacher")


class ClassGroup(Base):
    __tablename__ = "class_groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    academic_year = Column(String, nullable=False)
    teacher_id = Column(Integer, ForeignKey("teachers.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    teacher = relationship("Teacher", back_populates="classes")
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

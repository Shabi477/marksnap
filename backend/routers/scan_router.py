from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from database import get_db
from models import Teacher, Test, ScanBatch, ScanResult, AnswerKey, Student
from schemas import ScanBatchResponse, ScanResultResponse, ScanResultCorrection, ScanResultAssignStudent, LiveScanResponse
from auth import get_current_teacher
from routers.tests_router import _can_access_test
from services.scanner import process_scan_batch
import os
import uuid
import shutil

REVIEW_CONFIDENCE_THRESHOLD = 0.5

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

router = APIRouter(prefix="/api/scan", tags=["scan"])


@router.post("/upload/{test_id}", response_model=ScanBatchResponse)
async def upload_scans(
    test_id: int,
    files: list[UploadFile] = File(...),
    class_id: int = None,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    test = db.query(Test).filter(Test.id == test_id).first()
    if not test or not _can_access_test(teacher, test, db):
        raise HTTPException(status_code=404, detail="Test not found")

    # Check answer key exists
    answer_keys = db.query(AnswerKey).filter(AnswerKey.test_id == test_id).all()
    if not answer_keys:
        raise HTTPException(status_code=400, detail="Please set the answer key before scanning")

    batch = ScanBatch(
        test_id=test_id,
        class_id=class_id,
        status="processing",
        total_pages=0,
    )
    db.add(batch)
    db.commit()
    db.refresh(batch)

    # Save uploaded files
    batch_dir = os.path.join(UPLOAD_DIR, f"batch_{batch.id}")
    os.makedirs(batch_dir, exist_ok=True)

    saved_files = []
    for f in files:
        ext = os.path.splitext(f.filename)[1].lower()
        if ext not in (".jpg", ".jpeg", ".png", ".pdf", ".tiff", ".tif"):
            continue
        file_id = uuid.uuid4().hex[:12]
        safe_name = f"{file_id}{ext}"
        file_path = os.path.join(batch_dir, safe_name)
        with open(file_path, "wb") as out:
            content = await f.read()
            out.write(content)
        saved_files.append(file_path)

    if not saved_files:
        batch.status = "error"
        batch.error_message = "No valid image or PDF files uploaded"
        db.commit()
        raise HTTPException(status_code=400, detail="No valid files uploaded")

    # Process the scans
    try:
        answer_key_map = {(k.question_number, k.section_name): k.correct_answer for k in answer_keys}
        results = process_scan_batch(saved_files, test, answer_key_map, db)

        for r in results:
            confidence = r.get("confidence", 1.0)
            student_id = r.get("student_id")
            needs_review = (
                confidence < REVIEW_CONFIDENCE_THRESHOLD
                or r.get("selected_answer") is None
                or student_id is None  # Flag unidentified students
            )
            scan_result = ScanResult(
                scan_batch_id=batch.id,
                student_id=student_id,
                student_code=r.get("student_code"),
                page_number=r.get("page_number", 1),
                section_name=r.get("section_name", "A"),
                question_number=r["question_number"],
                selected_answer=r.get("selected_answer"),
                is_correct=r.get("is_correct"),
                confidence=confidence,
                needs_review=needs_review,
            )
            db.add(scan_result)

        batch.status = "completed"
        batch.total_pages = len(saved_files)
        batch.processed_pages = len(saved_files)
        db.commit()
        db.refresh(batch)

    except Exception as e:
        batch.status = "error"
        batch.error_message = str(e)
        db.commit()
        raise HTTPException(status_code=500, detail=f"Scan processing failed: {str(e)}")

    return _build_batch_response(batch, db)


@router.get("/batches/{test_id}", response_model=list[ScanBatchResponse])
def list_batches(
    test_id: int,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    test = db.query(Test).filter(Test.id == test_id).first()
    if not test or not _can_access_test(teacher, test, db):
        raise HTTPException(status_code=404, detail="Test not found")
    batches = db.query(ScanBatch).filter(ScanBatch.test_id == test_id).all()
    return [_build_batch_response(b, db) for b in batches]


@router.get("/batch/{batch_id}/status", response_model=ScanBatchResponse)
def batch_status(
    batch_id: int,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    batch = db.query(ScanBatch).filter(ScanBatch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    return _build_batch_response(batch, db)


@router.get("/batch/{batch_id}/flagged", response_model=list[ScanResultResponse])
def get_flagged_results(
    batch_id: int,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    """Get all results that need teacher review (low confidence or no answer detected)."""
    batch = db.query(ScanBatch).filter(ScanBatch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    test = db.query(Test).filter(Test.id == batch.test_id).first()
    if not test or not _can_access_test(teacher, test, db):
        raise HTTPException(status_code=404, detail="Test not found")

    flagged = (
        db.query(ScanResult)
        .filter(ScanResult.scan_batch_id == batch_id, ScanResult.needs_review == True)
        .order_by(ScanResult.student_code, ScanResult.question_number)
        .all()
    )

    results = []
    for r in flagged:
        student_name = None
        if r.student_id:
            student = db.query(Student).filter(Student.id == r.student_id).first()
            student_name = student.name if student else None
        results.append(ScanResultResponse(
            id=r.id,
            scan_batch_id=r.scan_batch_id,
            student_id=r.student_id,
            student_code=r.student_code,
            student_name=student_name,
            page_number=r.page_number,
            section_name=r.section_name,
            question_number=r.question_number,
            selected_answer=r.selected_answer,
            is_correct=r.is_correct,
            confidence=r.confidence,
            needs_review=r.needs_review,
        ))
    return results


@router.put("/result/{result_id}/correct", response_model=ScanResultResponse)
def correct_result(
    result_id: int,
    correction: ScanResultCorrection,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    """Teacher corrects a flagged scan result."""
    result = db.query(ScanResult).filter(ScanResult.id == result_id).first()
    if not result:
        raise HTTPException(status_code=404, detail="Result not found")

    batch = db.query(ScanBatch).filter(ScanBatch.id == result.scan_batch_id).first()
    test = db.query(Test).filter(Test.id == batch.test_id).first()
    if not test or not _can_access_test(teacher, test, db):
        raise HTTPException(status_code=404, detail="Test not found")

    # Update the answer
    result.selected_answer = correction.selected_answer
    result.needs_review = False
    result.confidence = 1.0  # Teacher-verified

    # Re-check correctness
    answer_key = (
        db.query(AnswerKey)
        .filter(
            AnswerKey.test_id == test.id,
            AnswerKey.question_number == result.question_number,
            AnswerKey.section_name == result.section_name,
        )
        .first()
    )
    if answer_key:
        result.is_correct = result.selected_answer == answer_key.correct_answer

    db.commit()
    db.refresh(result)

    student_name = None
    if result.student_id:
        student = db.query(Student).filter(Student.id == result.student_id).first()
        student_name = student.name if student else None

    return ScanResultResponse(
        id=result.id,
        scan_batch_id=result.scan_batch_id,
        student_id=result.student_id,
        student_code=result.student_code,
        student_name=student_name,
        page_number=result.page_number,
        section_name=result.section_name,
        question_number=result.question_number,
        selected_answer=result.selected_answer,
        is_correct=result.is_correct,
        confidence=result.confidence,
        needs_review=result.needs_review,
    )


def _build_batch_response(batch: ScanBatch, db: Session) -> ScanBatchResponse:
    flagged_count = (
        db.query(ScanResult)
        .filter(ScanResult.scan_batch_id == batch.id, ScanResult.needs_review == True)
        .count()
    )
    return ScanBatchResponse(
        id=batch.id,
        test_id=batch.test_id,
        status=batch.status,
        total_pages=batch.total_pages,
        processed_pages=batch.processed_pages,
        uploaded_at=batch.uploaded_at,
        error_message=batch.error_message,
        flagged_count=flagged_count,
    )


@router.put("/result/{result_id}/assign-student", response_model=ScanResultResponse)
def assign_student_to_result(
    result_id: int,
    data: ScanResultAssignStudent,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    """Assign a student to an unidentified scan result."""
    result = db.query(ScanResult).filter(ScanResult.id == result_id).first()
    if not result:
        raise HTTPException(status_code=404, detail="Result not found")

    batch = db.query(ScanBatch).filter(ScanBatch.id == result.scan_batch_id).first()
    test = db.query(Test).filter(Test.id == batch.test_id).first()
    if not test or not _can_access_test(teacher, test, db):
        raise HTTPException(status_code=404, detail="Test not found")

    student = db.query(Student).filter(Student.id == data.student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    # Assign student to this result and all other results on the same page/batch
    same_page_results = (
        db.query(ScanResult)
        .filter(
            ScanResult.scan_batch_id == result.scan_batch_id,
            ScanResult.page_number == result.page_number,
            ScanResult.student_id == None,
        )
        .all()
    )
    for r in same_page_results:
        r.student_id = student.id
        r.student_code = student.student_code
        # Clear the needs_review flag if the only issue was missing student
        if r.selected_answer is not None and r.confidence >= REVIEW_CONFIDENCE_THRESHOLD:
            r.needs_review = False

    db.commit()
    db.refresh(result)

    return ScanResultResponse(
        id=result.id,
        scan_batch_id=result.scan_batch_id,
        student_id=result.student_id,
        student_code=result.student_code,
        student_name=student.name,
        page_number=result.page_number,
        section_name=result.section_name,
        question_number=result.question_number,
        selected_answer=result.selected_answer,
        is_correct=result.is_correct,
        confidence=result.confidence,
        needs_review=result.needs_review,
    )


@router.post("/live/{test_id}", response_model=LiveScanResponse)
async def live_scan(
    test_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    """Process a single scanned answer sheet image and return instant results."""
    test = db.query(Test).filter(Test.id == test_id).first()
    if not test or not _can_access_test(teacher, test, db):
        raise HTTPException(status_code=404, detail="Test not found")

    answer_keys = db.query(AnswerKey).filter(AnswerKey.test_id == test_id).all()
    if not answer_keys:
        raise HTTPException(status_code=400, detail="Please set the answer key before scanning")

    # Save temp file
    ext = os.path.splitext(file.filename or "image.jpg")[1].lower()
    if ext not in (".jpg", ".jpeg", ".png"):
        raise HTTPException(status_code=400, detail="Only JPG/PNG images accepted for live scan")

    live_dir = os.path.join(UPLOAD_DIR, "live")
    os.makedirs(live_dir, exist_ok=True)
    file_id = uuid.uuid4().hex[:12]
    file_path = os.path.join(live_dir, f"{file_id}{ext}")

    try:
        content = await file.read()
        with open(file_path, "wb") as out:
            out.write(content)

        answer_key_map = {(k.question_number, k.section_name): k.correct_answer for k in answer_keys}
        results = process_scan_batch([file_path], test, answer_key_map, db)

        # Build response
        student_code = None
        student_name = None
        answers = {}
        correct = {}
        flagged = 0

        for r in results:
            q_key = f"{r.get('section_name', 'A')}_{r['question_number']}"
            answers[q_key] = r.get("selected_answer")
            correct[q_key] = bool(r.get("is_correct"))

            confidence = r.get("confidence", 1.0)
            if confidence < REVIEW_CONFIDENCE_THRESHOLD or r.get("selected_answer") is None:
                flagged += 1

            if not student_code and r.get("student_code"):
                student_code = r["student_code"]
            if not student_name and r.get("student_id"):
                student = db.query(Student).filter(Student.id == r["student_id"]).first()
                if student:
                    student_name = student.name

            # Also persist as ScanResult (create a batch for record-keeping)
        batch = ScanBatch(
            test_id=test_id,
            status="completed",
            total_pages=1,
            processed_pages=1,
        )
        db.add(batch)
        db.commit()
        db.refresh(batch)

        for r in results:
            confidence = r.get("confidence", 1.0)
            needs_review = confidence < REVIEW_CONFIDENCE_THRESHOLD or r.get("selected_answer") is None
            scan_result = ScanResult(
                scan_batch_id=batch.id,
                student_id=r.get("student_id"),
                student_code=r.get("student_code"),
                page_number=r.get("page_number", 1),
                section_name=r.get("section_name", "A"),
                question_number=r["question_number"],
                selected_answer=r.get("selected_answer"),
                is_correct=r.get("is_correct"),
                confidence=confidence,
                needs_review=needs_review,
            )
            db.add(scan_result)
        db.commit()

        score = sum(1 for v in correct.values() if v)
        total = len(answers)
        percentage = round((score / total * 100) if total > 0 else 0, 1)

        return LiveScanResponse(
            student_name=student_name,
            student_code=student_code,
            score=score,
            total=total,
            percentage=percentage,
            flagged_count=flagged,
            answers=answers,
            correct=correct,
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scan failed: {str(e)}")
    finally:
        if os.path.exists(file_path):
            os.remove(file_path)

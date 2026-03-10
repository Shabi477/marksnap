from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from database import get_db
from models import Teacher, Test, ScanBatch, ScanResult, AnswerKey, Student
from schemas import ScanBatchResponse
from auth import get_current_teacher
from routers.tests_router import _can_access_test
from services.scanner import process_scan_batch
import os
import uuid
import shutil

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
            scan_result = ScanResult(
                scan_batch_id=batch.id,
                student_id=r.get("student_id"),
                student_code=r.get("student_code"),
                page_number=r.get("page_number", 1),
                section_name=r.get("section_name", "A"),
                question_number=r["question_number"],
                selected_answer=r.get("selected_answer"),
                is_correct=r.get("is_correct"),
                confidence=r.get("confidence", 1.0),
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

    return batch


@router.get("/batches/{test_id}", response_model=list[ScanBatchResponse])
def list_batches(
    test_id: int,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    test = db.query(Test).filter(Test.id == test_id).first()
    if not test or not _can_access_test(teacher, test, db):
        raise HTTPException(status_code=404, detail="Test not found")
    return db.query(ScanBatch).filter(ScanBatch.test_id == test_id).all()


@router.get("/batch/{batch_id}/status", response_model=ScanBatchResponse)
def batch_status(
    batch_id: int,
    db: Session = Depends(get_db),
    teacher: Teacher = Depends(get_current_teacher),
):
    batch = db.query(ScanBatch).filter(ScanBatch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    return batch

from pathlib import Path

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
import json
from models.schemas import OCRResponse, SubjectCriteria
from services.preprocessor import preprocess_image, preprocess_pages
from services.ocr_engine import extract_text
from services.processor import parse_transcript, evaluate_grades

router = APIRouter()

ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".pdf"}

@router.post("/debug-ocr")
async def debug_ocr(file: UploadFile = File(...)):
    """Debug endpoint: คืนค่า raw OCR output เพื่อดูว่า EasyOCR อ่านเห็นอะไร"""
    file_bytes = await file.read()
    processed_image = preprocess_image(file_bytes)
    ocr_results = extract_text(processed_image)
    return {
        "total_boxes": len(ocr_results),
        "results": [
            {"text": text, "confidence": round(float(conf), 3)}
            for _box, text, conf in ocr_results
        ]
    }

@router.post("/process-transcript", response_model=OCRResponse)
async def process_transcript(
    file: UploadFile = File(...),
    criteria_json: str = Form(...), # รับเกณฑ์มาเป็น JSON string
    # รายชื่อรหัสวิชาที่สนใจ (JSON array) มาจากตาราง core_courses ฝั่ง backend
    # ถ้าไม่ส่งมาหรือส่ง "[]" จะดึงทุกวิชาที่หน้าตาเหมือนรหัสวิชาเหมือนเดิม
    course_codes_json: str = Form("[]")
):
    extension = Path(file.filename or "").suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"ไม่รองรับไฟล์นามสกุล '{extension}' กรุณาอัปโหลดไฟล์ PNG, JPG หรือ PDF เท่านั้น"
        )

    try:
        # แปลง JSON criteria จาก Go เป็น List of Objects
        criteria_dicts = json.loads(criteria_json)
        criteria = [SubjectCriteria(**c) for c in criteria_dicts]

        # รหัสวิชาที่ backend สนใจ — ใช้กรอง anchor ให้เหลือแต่วิชาจริงในหลักสูตร
        # กันตัวเลข 6-8 หลักอื่นบนทรานสคริปต์ถูกอ่านเป็นรหัสวิชา
        known_codes = set(str(code) for code in json.loads(course_codes_json))
        if not known_codes:
            known_codes = None

        # 1. อ่านไฟล์และ Preprocess (รองรับทั้งรูปภาพและ PDF ทุกหน้า เพราะทรานสคริปต์จริงมักมีหลายหน้า)
        file_bytes = await file.read()
        page_images = preprocess_pages(file_bytes)

        # 2-5. ทำ OCR แต่ละหน้า แล้วสกัดรหัสวิชา/เกรด รวมผลทุกหน้าเข้าด้วยกัน
        # (หน้าหลังทับหน้าก่อนหน้า เผื่อกรณีลงทะเบียนเรียนซ้ำแล้วเกรดล่าสุดอยู่หน้าถัดไป)
        extracted_grades = {}
        confidence_weighted_sum = 0.0
        confidence_count = 0
        for page_image in page_images:
            ocr_results = extract_text(page_image)
            page_grades, page_avg_confidence = parse_transcript(ocr_results, known_codes)
            extracted_grades.update(page_grades)
            confidence_weighted_sum += page_avg_confidence * len(page_grades)
            confidence_count += len(page_grades)

        avg_confidence = (confidence_weighted_sum / confidence_count) if confidence_count > 0 else 0.0

        # 6. ประเมินผล
        status, message = evaluate_grades(extracted_grades, criteria, avg_confidence)
        
        return OCRResponse(
            status=status,
            message=message,
            extracted_data=extracted_grades,
            confidence_score=avg_confidence
        )
        
    except Exception as e:
        return OCRResponse(
            status="needs_review",
            message=f"เกิดข้อผิดพลาดในการประมวลผล: {str(e)}",
            extracted_data={},
            confidence_score=0.0
        )
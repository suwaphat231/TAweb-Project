from pydantic import BaseModel
from typing import List, Dict, Optional

class SubjectCriteria(BaseModel):
    subject_code: str
    minimum_grade: float  # คะแนนเกรด GPA เช่น 2.0 (C), 2.5 (C+), 3.0 (B)

class OCRResponse(BaseModel):
    status: str # 'pass', 'needs_review', 'fail'
    message: str
    extracted_data: Dict[str, str] # คืนค่ารหัสวิชาและเกรดที่อ่านได้ เช่น {"254101": "A"}
    confidence_score: float

class ScheduleSlot(BaseModel):
    day: str         # English abbreviation: MON TUE WED THU FRI SAT SUN
    start_time: str  # HH:MM (24-hour)
    end_time: str    # HH:MM (24-hour)

class ScheduleOCRResponse(BaseModel):
    slots: List[ScheduleSlot]
    raw_text: str     # full OCR text dump for debugging
    confidence: float # average confidence of detected tokens
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

class StudentInfoExtractResult(BaseModel):
    """Fields extracted from a student information document.

    Allowlist: student_id, full_name_th, full_name_en, education_level,
               curriculum, faculty, campus, student_status.

    Sensitive fields (national_id, birth_date, age, religion, nationality,
    address, postal_code, phone, emergency_contact) are never returned.
    """
    student_id: Optional[str] = None
    full_name_th: Optional[str] = None
    full_name_en: Optional[str] = None
    education_level: Optional[str] = None
    curriculum: Optional[str] = None
    faculty: Optional[str] = None
    campus: Optional[str] = None
    student_status: Optional[str] = None
    # Which REG box the image shows: "personal", "student", or None if unclear.
    page_kind: Optional[str] = None
    confidence: float
class AcademicCalendarEntry(BaseModel):
    start_date: str              # YYYY-MM-DD (Christian era)
    end_date: str                # YYYY-MM-DD, same as start_date for a single day
    name: str
    semester: str                # "1", "2" or "S"
    date_type: Optional[str] = None  # public_holiday | university_holiday | no_class; None = activity only
    include: bool                # suggested default: the date stops teaching
    page: int

class AcademicCalendarResponse(BaseModel):
    entries: List[AcademicCalendarEntry]
    detected_academic_year: Optional[int] = None  # "ปีการศึกษา 2569" found in the file
    used_ocr: bool               # True when the PDF had no text layer (scanned)

import re

from utils.helpers import is_subject_code, group_into_lines

VALID_GRADES = {'A', 'B+', 'B', 'C+', 'C', 'D+', 'D', 'F'}

def normalize_grade(grade_text: str) -> str:
    """Step 5: Normalize แก้ไขตัวอักษรที่มักอ่านผิดในคอลัมน์เกรด"""
    grade_text = grade_text.strip().upper()
    mapping = {
        '8': 'B',
        '0': 'D',
        'O': 'D',
        'Q': 'D',
    }
    if grade_text in mapping:
        return mapping[grade_text]

    # EasyOCR occasionally reads the '+' in "B+"/"C+"/"D+" as a trailing '.'
    # instead (e.g. "D+" -> "d.") — only remap when doing so lands on an
    # actual plus-grade, so a genuinely invalid "X." isn't silently rewritten.
    if grade_text.endswith('.') and grade_text[:-1] + '+' in VALID_GRADES:
        return grade_text[:-1] + '+'

    return grade_text

# ทรานสคริปต์/ใบเกรดบางแบบพิมพ์รหัสหลักสูตรต่อท้ายรหัสวิชามาด้วย เช่น
# '517121-165' แต่ core_courses ฝั่ง backend เก็บเป็นรหัส 6 หลักล้วน
CURRICULUM_SUFFIX_PATTERN = re.compile(r'^(\d{6})\s*[-–—]\s*\d{2,4}$')

def clean_code_text(text: str) -> str:
    """เตรียมข้อความหนึ่ง box ให้พร้อมเช็คว่าเป็นรหัสวิชาไหม

    ตัดรหัสหลักสูตรท้ายรหัสวิชาทิ้ง ('517121-165' -> '517121') ส่วนกรณีอื่น
    แค่ลบ noise จาก OCR (เว้นวรรค ขีด จุด) ออกตามเดิม
    """
    stripped = text.strip()
    suffix_match = CURRICULUM_SUFFIX_PATTERN.match(stripped)
    if suffix_match:
        return suffix_match.group(1)
    return re.sub(r'[\s\-\.\,\/]', '', stripped)


GRADE_HEADERS = {'เกรด', 'grade'}


def box_center_x(box) -> float:
    return (box[0][0] + box[1][0]) / 2


def grade_column_xs(lines) -> list:
    """หาตำแหน่งแกน X ของหัวคอลัมน์ "เกรด" ในหน้า (อาจมีหลายคอลัมน์ถ้าทรานสคริปต์แบ่งซ้าย-ขวา)

    ต้องตรงทั้งคำ — กัน "คะแนนเกรดรวม" ถูกนับเป็นหัวคอลัมน์เกรด
    """
    return [
        box_center_x(box)
        for line in lines
        for box, text, _confidence in line
        if text.strip().lower() in GRADE_HEADERS
    ]


def parse_transcript(ocr_results, known_codes=None):
    """Step 3 & 4: จัดกลุ่มบรรทัดตามแกน Y, หารหัสวิชา (Anchor) แล้วดึงเกรดที่อยู่ในบรรทัดเดียวกัน

    known_codes (optional): set ของรหัสวิชาที่ backend สนใจ (มาจากตาราง core_courses)
    ถ้าส่งมา จะรับเฉพาะรหัสที่อยู่ในชุดนี้เป็น anchor — กันตัวเลข 6-8 หลักอื่นบน
    ทรานสคริปต์ (รหัสนักศึกษา, เลขที่เอกสาร) ถูกเข้าใจผิดว่าเป็นรหัสวิชา
    """
    extracted_grades = {}
    total_confidence = 0
    count = 0

    lines = group_into_lines(ocr_results)
    header_xs = grade_column_xs(lines)

    def accept(candidate: str):
        """คืนรหัสวิชาถ้าใช้เป็น anchor ได้ ไม่งั้นคืน None"""
        if not is_subject_code(candidate):
            return None
        if known_codes is not None and candidate not in known_codes:
            return None
        return candidate

    for line in lines:
        # หา index ของข้อความที่หน้าตาเหมือนรหัสวิชาในบรรทัดนี้
        # รองรับทั้งกรณีที่ EasyOCR อ่านเป็น box เดียว และกรณีที่แบ่งเป็น 2 box ติดกัน
        subject_code = None
        subject_index = None
        for idx, (_box, text, _confidence) in enumerate(line):
            cleaned = clean_code_text(text)
            matched = accept(cleaned)
            if matched:
                subject_code = matched
                subject_index = idx
                break
            # ลองรวมกับ box ถัดไป (กรณี EasyOCR แบ่งตัวเลขเป็น 2 ส่วน)
            if idx + 1 < len(line) and cleaned.isdigit():
                matched = accept(cleaned + clean_code_text(line[idx + 1][1]))
                if matched:
                    subject_code = matched
                    subject_index = idx + 1
                    break

        if subject_code is None:
            continue

        # รายการที่อยู่ถัดจากรหัสวิชาในบรรทัดเดียวกัน (ซ้ายไปขวา) ที่หน้าตาเป็นเกรด
        candidates = [
            (box, normalize_grade(text), confidence)
            for box, text, confidence in line[subject_index + 1:]
            if normalize_grade(text) in VALID_GRADES
        ]
        if not candidates:
            continue
        if header_xs:
            # เลือกตัวที่อยู่ตรงคอลัมน์ "เกรด" ที่สุด — คอลัมน์หน่วยกิตที่อยู่ก่อนหน้า
            # อาจถูกอ่านเป็นตัวอักษรที่หน้าตาเหมือนเกรด เช่น "4" -> "a"
            _box, grade, confidence = min(
                candidates,
                key=lambda c: min(abs(box_center_x(c[0]) - x) for x in header_xs),
            )
        else:
            _box, grade, confidence = candidates[0]
        extracted_grades[subject_code] = grade
        total_confidence += confidence
        count += 1

    avg_confidence = (total_confidence / count) if count > 0 else 0
    return extracted_grades, avg_confidence

GRADE_TO_GPA = {'A': 4.0, 'B+': 3.5, 'B': 3.0, 'C+': 2.5, 'C': 2.0, 'D+': 1.5, 'D': 1.0, 'F': 0.0}
GPA_TO_GRADE = {v: k for k, v in GRADE_TO_GPA.items()}

def evaluate_grades(extracted_grades: dict, criteria: list, avg_confidence: float):
    """Step 6: เทียบเกณฑ์ที่อาจารย์ตั้ง โดยใช้คะแนนเกรด GPA เป็นตัวเปรียบเทียบ"""
    for crit in criteria:
        subject = crit.subject_code
        min_gpa = crit.minimum_grade  # float เช่น 2.0, 2.5, 3.0

        if subject not in extracted_grades:
            return "needs_review", f"ไม่พบรหัสวิชา {subject} ในทรานสคริปต์"

        actual_grade = normalize_grade(extracted_grades[subject])
        actual_gpa = GRADE_TO_GPA.get(actual_grade, -1.0)
        min_grade_letter = GPA_TO_GRADE.get(min_gpa, str(min_gpa))

        if actual_gpa < min_gpa:
            return "fail", f"วิชา {subject} ได้ GPA {actual_gpa:.1f} (เกรด {actual_grade}) ต่ำกว่าเกณฑ์ขั้นต่ำ {min_gpa:.1f} (เกรด {min_grade_letter})"

    # ไม่เจอวิชาแกนที่ต้องการเลยสักตัว (avg_confidence เป็น 0 เพราะไม่มีอะไรให้เฉลี่ย
    # ไม่ใช่เพราะ OCR อ่านได้แต่ไม่มั่นใจ) แยกข้อความออกจากเคส "อ่านได้แต่มั่นใจต่ำ" ด้านล่าง
    if not extracted_grades:
        return "needs_review", "ไม่พบวิชาแกนที่ต้องการในไฟล์นี้ กรุณาตรวจสอบว่าแนบไฟล์ถูกต้องและครบทุกหน้า"

    if avg_confidence < 0.7:
        return "needs_review", "ผ่านเกณฑ์ แต่ระบบมีความมั่นใจในการอ่านต่ำ โปรดตรวจสอบด้วยมนุษย์"

    return "pass", "ผ่านเกณฑ์ทั้งหมด"

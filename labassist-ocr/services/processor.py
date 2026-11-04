import re

from utils.helpers import is_subject_code, group_into_lines

VALID_GRADES = {'A', 'B+', 'B', 'C+', 'C', 'D+', 'D', 'F'}

def normalize_grade(grade_text: str) -> str:
    """Step 5: Normalize ข้อความในช่องเกรด

    ไม่เดาตัวเลขเป็นเกรด ('8' -> B, '0' -> D) เพราะตัวเลขในบรรทัดเดียวกันมาจาก
    คอลัมน์หน่วยกิต/คะแนนเกรดรวม ไม่ใช่เกรดที่อ่านผิด
    """
    grade_text = re.sub(r'\s', '', grade_text).upper()
    # จุดท้ายเกรดเป็นเศษจากขอบเซลล์ ("d." คือ D ธรรมดา ส่วน D+ จะอ่านได้ "d+")
    return grade_text.rstrip('.')

# ทรานสคริปต์/ใบเกรดบางแบบพิมพ์รหัสหลักสูตรต่อท้ายรหัสวิชามาด้วย เช่น
# '517121-165' หรือ 'SU102-162' แต่ core_courses ฝั่ง backend เก็บแค่รหัสวิชา
CURRICULUM_SUFFIX_PATTERN = re.compile(r'^(\d{6}|[A-Z]{2,4}\d{3,4})\s*[-–—]\s*\d{2,4}$')

def clean_code_text(text: str) -> str:
    """เตรียมข้อความหนึ่ง box ให้พร้อมเช็คว่าเป็นรหัสวิชาไหม

    ตัดรหัสหลักสูตรท้ายรหัสวิชาทิ้ง ('517121-165' -> '517121') ส่วนกรณีอื่น
    แค่ลบ noise จาก OCR (เว้นวรรค ขีด จุด เส้นขอบตาราง) ออก
    รหัสถูกแปลงเป็นตัวพิมพ์ใหญ่ เพราะโมเดลภาษาไทยอ่านอักษรอังกฤษเป็นตัวพิมพ์เล็ก ("su101")
    """
    stripped = text.strip().upper()
    suffix_match = CURRICULUM_SUFFIX_PATTERN.match(stripped)
    if suffix_match:
        return suffix_match.group(1)
    return fix_digit_confusions(re.sub(r'[\s\-\.\,\/\|]', '', stripped))


# ตัวอักษรที่หน้าตาเหมือนตัวเลข — ใช้แก้เฉพาะส่วนที่ต้องเป็นตัวเลขของรหัสวิชา ("SU4O1" -> "SU401")
DIGIT_LOOKALIKES = str.maketrans({'O': '0', 'Q': '0', 'D': '0', 'I': '1', 'L': '1', 'Z': '2', 'S': '5', 'B': '8'})
# รหัสวิชา = ตัวอักษรนำหน้า 0-4 ตัว ตามด้วยส่วนตัวเลข (ที่อาจอ่านเพี้ยนเป็นตัวอักษร) 3-8 ตัว
CODE_SHAPE_PATTERN = re.compile(r'^([A-Z]{2,4}?)([0-9OQDILZSB]{3,4})$|^()([0-9OQDILZSB]{6,8})$')


def fix_digit_confusions(code: str) -> str:
    match = CODE_SHAPE_PATTERN.match(code)
    if not match or not any(ch.isdigit() for ch in code):
        return code
    prefix, digits = (match.group(1), match.group(2)) if match.group(2) else (match.group(3), match.group(4))
    return prefix + digits.translate(DIGIT_LOOKALIKES)


GRADE_HEADERS = {'เกรด', 'grade'}


def box_center_x(box) -> float:
    return (box[0][0] + box[1][0]) / 2


def box_height(box) -> float:
    return box[2][1] - box[0][1]


def grade_column_headers(lines) -> list:
    """หาหัวคอลัมน์ "เกรด" ในหน้า คืน [(center_x, width, top_y), ...] (อาจมีหลายตาราง/หลายคอลัมน์)

    ต้องตรงทั้งคำ — กัน "คะแนนเกรดรวม" ถูกนับเป็นหัวคอลัมน์เกรด
    """
    return [
        (box_center_x(box), box[1][0] - box[0][0], box[0][1])
        for line in lines
        for box, text, _confidence in line
        if text.strip().lower() in GRADE_HEADERS
    ]


# ตัวอักษรที่ยอมให้โมเดลอังกฤษอ่านในช่องรหัสวิชา/ช่องเกรด — จำกัดไว้กันอ่าน "D" เป็น "0" หรือ "O"
CODE_ALLOWLIST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-'
# รวม W/U/S/I/* ด้วย ไม่งั้นช่องที่เป็น "W" หรือ "U*" จะถูกบังคับอ่านเป็นเกรดที่ใกล้ที่สุด
GRADE_ALLOWLIST = 'ABCDFISUW+*'

# อัตรากว้าง/สูงของหมึกในช่องเกรด: ตัวอักษรเดียว (A, B, C, D) วัดได้ไม่เกิน ~0.9 ส่วนเกรดที่มี "+"
# วัดได้ตั้งแต่ ~1.1 ขึ้นไป (วัดจากใบเกรดตัวอย่างใน test-ocr-grade/)
PLUS_CAPABLE = {'B', 'C', 'D'}
PLUS_INK_ASPECT = 1.0
INFERRED_PLUS_CONFIDENCE = 0.6

# box ที่กว้างเกิน (ความสูง x ค่านี้) เป็นชื่อวิชา ไม่ต้องลองอ่านเป็นรหัสวิชาซ้ำ
MAX_CODE_ASPECT = 8


def parse_transcript(ocr_results, known_codes=None, read_region=None):
    """Step 3 & 4: จัดกลุ่มบรรทัดตามแกน Y, หารหัสวิชา (Anchor) แล้วดึงเกรดที่อยู่ในบรรทัดเดียวกัน

    known_codes (optional): set ของรหัสวิชาที่ backend สนใจ (มาจากตาราง core_courses)
    ถ้าส่งมา จะรับเฉพาะรหัสที่อยู่ในชุดนี้เป็น anchor — กันตัวเลข 6-8 หลักอื่นบน
    ทรานสคริปต์ (รหัสนักศึกษา, เลขที่เอกสาร) ถูกเข้าใจผิดว่าเป็นรหัสวิชา

    read_region (optional): ฟังก์ชัน (region, allowlist) -> (text, confidence, ink_aspect) ที่อ่าน
    กรอบ (x_min, x_max, y_min, y_max) บนภาพด้วยโมเดลอังกฤษ ใช้อ่านช่องรหัสวิชาที่
    โมเดลไทยอ่านเพี้ยน และอ่านช่องเกรดซ้ำ (detector มักมองไม่เห็นเกรดตัวอักษรเดียว)
    """
    extracted_grades = {}
    total_confidence = 0
    count = 0

    lines = group_into_lines(ocr_results)
    headers = grade_column_headers(lines)

    def accept(candidate: str):
        """คืนรหัสวิชาถ้าใช้เป็น anchor ได้ ไม่งั้นคืน None"""
        if not is_subject_code(candidate):
            return None
        if known_codes is not None and candidate not in known_codes:
            return None
        return candidate

    def find_code(line):
        """คืน (รหัสวิชา, index ของ box รหัสวิชา) ของบรรทัด หรือ (None, None)"""
        for idx, (box, text, _confidence) in enumerate(line):
            cleaned = clean_code_text(text)
            matched = accept(cleaned)
            if matched:
                return matched, idx
            # ลองรวมกับ box ถัดไป (กรณี EasyOCR แบ่งตัวเลขเป็น 2 ส่วน)
            if idx + 1 < len(line) and cleaned.isdigit():
                matched = accept(cleaned + clean_code_text(line[idx + 1][1]))
                if matched:
                    return matched, idx + 1
        if read_region is None:
            return None, None
        # โมเดลไทยอ่านรหัสอย่าง "SU102" เพี้ยน ("sū102") — อ่าน box สั้น ๆ ซ้ำด้วยโมเดลอังกฤษ
        for idx, (box, text, _confidence) in enumerate(line):
            height = box_height(box)
            if height <= 0 or (box[1][0] - box[0][0]) > height * MAX_CODE_ASPECT:
                continue
            # รหัสวิชามีตัวเลขอย่างน้อย 3 ตัวเสมอ ("sū102") — ข้าม box อื่นเพื่อไม่ต้องอ่านซ้ำทั้งหน้า
            if sum(ch.isdigit() for ch in text) < 3:
                continue
            pad = height * 0.2
            text, _conf, _aspect = read_region((box[0][0] - pad, box[1][0] + pad, box[0][1] - pad, box[2][1] + pad), CODE_ALLOWLIST)
            matched = accept(clean_code_text(text))
            if matched:
                return matched, idx
        return None, None

    # บรรทัดที่หารหัสวิชาเจอ: (รหัสวิชา, box รหัสวิชา, box ที่อยู่ทางขวาของรหัส)
    rows = []
    for line in lines:
        subject_code, subject_index = find_code(line)
        if subject_code is not None:
            rows.append((subject_code, line[subject_index][0], line[subject_index + 1:]))

    def detected_candidates(rest):
        """box ทางขวาของรหัสวิชาที่ detector อ่านได้หน้าตาเป็นเกรด"""
        return [
            (box, normalize_grade(text), confidence)
            for box, text, confidence in rest
            if normalize_grade(text) in VALID_GRADES
        ]

    # ถ้าไม่มีหัวคอลัมน์ "เกรด" (ภาพครอปแค่บางแถว) ใช้ค่ากลางของตำแหน่งเกรดที่ detector อ่านได้ในแถวอื่น
    fallback_x = None
    xs = sorted(box_center_x(c[0]) for _code, _box, rest in rows for c in detected_candidates(rest)[-1:])
    if xs:
        fallback_x = xs[len(xs) // 2]

    def grade_column_x(code_box):
        """ตำแหน่ง X ของคอลัมน์เกรดสำหรับแถวนี้ — ใช้หัวคอลัมน์ที่อยู่เหนือแถวและใกล้ที่สุด
        (ภาพเดียวอาจมีหลายตารางที่คอลัมน์ไม่ตรงกัน) หรือ None ถ้าไม่รู้"""
        above = [h for h in headers if h[2] < code_box[0][1] and h[0] > code_box[1][0]]
        if above:
            return max(above, key=lambda h: h[2])[0]
        return fallback_x

    for subject_code, code_box, rest in rows:
        candidates = detected_candidates(rest)
        row_height = box_height(code_box)
        column_x = grade_column_x(code_box)
        if column_x is not None:
            # เลือกเฉพาะตัวที่อยู่ในคอลัมน์ "เกรด" — คอลัมน์หน่วยกิต/คะแนนเกรดรวม
            # อาจถูกอ่านเป็นตัวอักษรที่หน้าตาเหมือนเกรด เช่น "4" -> "a"
            candidates = [c for c in candidates if abs(box_center_x(c[0]) - column_x) <= row_height * 2.5]
        detected = candidates[0] if candidates else None

        grade = confidence = None
        if read_region is not None and column_x is not None:
            # กรอบกว้างพอสำหรับเกรดที่ไม่ได้อยู่ตรงกลางหัวคอลัมน์พอดี read_region ตัดให้พอดีกับหมึกเอง
            code_y = (code_box[0][1] + code_box[2][1]) / 2
            half_width, half_height = row_height * 2.5, row_height * 0.8
            text, conf, ink_aspect = read_region(
                (column_x - half_width, column_x + half_width, code_y - half_height, code_y + half_height),
                GRADE_ALLOWLIST,
            )
            text = normalize_grade(text)
            if text in PLUS_CAPABLE and ink_aspect > PLUS_INK_ASPECT:
                # หมึกกว้างเกินกว่าตัวอักษรเดียว แปลว่ามี "+" ที่เล็กจนโมเดลมองไม่เห็น
                # ลด confidence ลงเพื่อให้นักศึกษาตรวจเกรดนี้อีกครั้ง
                text, conf = text + '+', min(conf, INFERRED_PLUS_CONFIDENCE)
            if text in VALID_GRADES:
                grade, confidence = text, conf
        if grade is None and detected is not None:
            _box, grade, confidence = detected
        if grade is None:
            continue
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

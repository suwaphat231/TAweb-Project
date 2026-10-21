"""
student_info_parser.py — extract allowed student profile fields from a
registrar (REG) screenshot.

Allowlist: student_id, full_name_th, full_name_en, education_level,
           curriculum, faculty, campus, student_status.

Sensitive fields (national_id, birth_date, age, religion, nationality,
address, postal_code, phone, emergency_contact) are explicitly blocked
and never returned.

REG lays its boxes out as "label: value" pairs, often two pairs per row:

    ชื่อ - สกุล (ไทย):  นายสมชาย ใจดี     ชื่อ - สกุล (อังกฤษ):  Mr.Somchai Jaidee

so each OCR line is split into (label, value) pairs at the colon-terminated
label tokens; a value never runs on into the next column's label.
"""

import re
from typing import Dict, List, Optional, Tuple

from utils.helpers import group_into_lines

# Silpakorn student IDs are 9 digits (e.g. 660710260); 10 is accepted too.
# They never start with 0, which keeps phone numbers (08x…) out.
_STUDENT_ID_RE = re.compile(r'(?<!\d)([1-9]\d{8,9})(?!\d)', re.ASCII)
_THAI_CHARS = re.compile(r'[฀-๿]')

# Thai above/below vowels and tone marks. EasyOCR often drops or swaps them
# ("ชื่อ" → "ชือ"), so labels are compared with them removed.
_THAI_MARKS = re.compile(r'[ัิ-ฺ็-๎]')
_LABEL_NOISE = re.compile(r'[\s\-–—_().:：/]')

FIELDS = ('student_id', 'full_name_th', 'full_name_en', 'education_level',
          'curriculum', 'faculty', 'campus', 'student_status')


def _norm(text: str) -> str:
    """Lowercase, drop Thai marks, spaces and punctuation — for label matching."""
    return _LABEL_NOISE.sub('', _THAI_MARKS.sub('', text.lower()))


def _keys(*words: str) -> List[str]:
    return [_norm(w) for w in words]


# Label keywords per field, best first. The profile's "faculty" holds the
# programme (เทคโนโลยีสารสนเทศ), not the คณะ (วิทยาศาสตร์), so คณะ is not used;
# when REG shows no ภาควิชา/สาขา the programme is taken from หลักสูตร instead.
_FIELD_KEYWORDS: Dict[str, List[str]] = {
    'student_id': _keys('รหัสนักศึกษา', 'รหัสประจำตัวนักศึกษา', 'student id', 'student code'),
    'education_level': _keys('ระดับการศึกษา', 'education level', 'degree'),
    'curriculum': _keys('หลักสูตร', 'curriculum', 'program'),
    'faculty': _keys('ภาควิชา', 'สาขาวิชา', 'department', 'major'),
    'campus': _keys('วิทยาเขต', 'campus'),
    'student_status': _keys('สถานภาพนักศึกษา', 'สถานะนักศึกษา', 'สถานภาพ', 'student status', 'status'),
}
_NAME_KEYWORDS = _keys('ชื่อ', 'สกุล', 'name')
# Other people's names (e.g. the advisor) must not be read as the student's.
# Nor are labels that merely contain "ชื่อ" (ชื่อปริญญา = degree name).
_OTHER_PERSON_KEYWORDS = _keys('อาจารย์', 'ที่ปรึกษา', 'advisor', 'บิดา', 'มารดา')
_NOT_A_NAME_KEYWORDS = _keys('ปริญญา', 'degree', 'หลักสูตร', 'วิชา')
_ENGLISH_KEYWORDS = _keys('อังกฤษ', 'english', 'eng')

_SENSITIVE_KEYWORDS = _keys(
    'เลขบัตรประชาชน', 'เลขประจำตัวประชาชน', 'national id', 'id card',
    'วันเกิด', 'เดือนปีเกิด', 'birth', 'อายุ', 'age',
    'ศาสนา', 'religion', 'สัญชาติ', 'เชื้อชาติ', 'nationality',
    'ที่อยู่', 'address', 'รหัสไปรษณีย์', 'postal', 'zip',
    'โทรศัพท์', 'เบอร์โทร', 'phone', 'tel', 'อีเมล', 'email',
    'ผู้ติดต่อฉุกเฉิน', 'emergency', 'ผู้ปกครอง', 'บิดา', 'มารดา',
    'หมู่เลือด', 'เกรดเฉลี่ย', 'gpa',
)

_PAGE_HEADERS = {
    'personal': _keys('ข้อมูลส่วนตัว', 'personal information'),
    'student': _keys('ข้อมูลนักศึกษา', 'student information'),
}


def _is_sensitive(label: str) -> bool:
    n = _norm(label)
    return any(k in n for k in _SENSITIVE_KEYWORDS)


def _classify_label(label: str) -> Tuple[Optional[str], int]:
    """Map a label to (field, rank); lower rank = better keyword. (None, 0) if unknown."""
    n = _norm(label)
    if not n or _is_sensitive(label):
        return None, 0
    if any(k in n for k in _OTHER_PERSON_KEYWORDS):
        return None, 0
    if (any(k in n for k in _NAME_KEYWORDS) and 'รหส' not in n
            and not any(k in n for k in _NOT_A_NAME_KEYWORDS)):
        if any(k in n for k in _ENGLISH_KEYWORDS):
            return 'full_name_en', 0
        return 'full_name_th', 0
    for field, keywords in _FIELD_KEYWORDS.items():
        for rank, k in enumerate(keywords):
            if k in n:
                return field, rank
    return None, 0


def _ends_label(text: str) -> bool:
    return text.rstrip().endswith((':', '：'))


def _split_inline_colon(line):
    """Split "label: value" tokens so the label and value become separate tokens."""
    out = []
    for box, text, conf in line:
        m = re.match(r'^(.+?[:：])\s*(\S.*)$', text.strip())
        if m and not _STUDENT_ID_RE.fullmatch(m.group(1)):
            out.append((box, m.group(1), conf))
            out.append((box, m.group(2), conf))
        else:
            out.append((box, text, conf))
    return out


def _box_height(box) -> float:
    return max(1.0, box[2][1] - box[0][1])


def _gap(left_box, right_box) -> float:
    return right_box[0][0] - left_box[1][0]


def line_pairs(line) -> List[Tuple[str, str]]:
    """Split one OCR line into (label, value) pairs at colon-terminated labels.

    A label may span several tokens ("ชือ" + "สกุล (ไทย):"): tokens directly
    left of the colon token belong to it while the horizontal gap stays under
    two text heights. Column gaps in REG are far wider than that.
    """
    tokens = _split_inline_colon(line)
    colon_idx = [i for i, (_, t, _) in enumerate(tokens) if _ends_label(t)]
    if not colon_idx:
        return []

    starts = []
    prev_end = -1
    for c in colon_idx:
        start = c
        while start - 1 > prev_end:
            left, right = tokens[start - 1][0], tokens[start][0]
            if _ends_label(tokens[start - 1][1]) or _gap(left, right) > 2 * _box_height(right):
                break
            start -= 1
        starts.append(start)
        prev_end = c

    pairs = []
    for n, c in enumerate(colon_idx):
        label = ' '.join(t for _, t, _ in tokens[starts[n]:c + 1])
        value_end = starts[n + 1] if n + 1 < len(colon_idx) else len(tokens)
        value = ' '.join(t.strip() for _, t, _ in tokens[c + 1:value_end]).strip()
        pairs.append((label, value))
    return pairs


def _programme_from_curriculum(curriculum: str) -> Optional[str]:
    """'107090000650 เทคโนโลยีสารสนเทศ (โครงการวิจัย)' → 'เทคโนโลยีสารสนเทศ'."""
    name = re.sub(r'^\s*\d+\s*', '', curriculum)
    name = re.sub(r'\s*[(（].*$', '', name).strip()
    return name or None


def _clean_value(field: str, value: str) -> Optional[str]:
    value = value.strip(' :：-–')
    if not value:
        return None
    if field == 'student_id':
        digits = value.translate(str.maketrans('OoIl|', '00111')).replace(' ', '')
        m = _STUDENT_ID_RE.search(digits)
        return m.group(1) if m else None
    if field == 'full_name_th':
        return value[:200] if _THAI_CHARS.search(value) else None
    if field == 'full_name_en':
        if _THAI_CHARS.search(value) or len(value) < 4:
            return None
        # EasyOCR's English model tends to lowercase everything.
        if value == value.lower():
            value = re.sub(r'(^|[\s.])([a-z])', lambda m: m.group(1) + m.group(2).upper(), value)
        return value[:200]
    return value[:300]


def detect_page_kind(lines, extracted: Dict) -> Optional[str]:
    """Which REG box the image shows: 'personal', 'student' or None if unclear.

    The box title is the first header on its line; the student box also has
    "*แก้ไขข้อมูลส่วนตัว ล่าสุด…" at the far right, which must not count.
    """
    for line in lines[:3]:
        n = _norm(' '.join(t for _, t, _ in line))
        found = [(n.find(h), kind) for kind, headers in _PAGE_HEADERS.items() for h in headers if h in n]
        if found:
            return min(found)[1]
    has_names = bool(extracted.get('full_name_th') or extracted.get('full_name_en'))
    has_student = any(extracted.get(f) for f in ('student_id', 'student_status', 'faculty', 'curriculum'))
    if has_names and not has_student:
        return 'personal'
    if has_student and not has_names:
        return 'student'
    return None


def extract_student_info(ocr_results) -> Tuple[Dict, float, Optional[str]]:
    """
    Scan OCR results for allowed student-info fields.

    Returns (fields_dict, avg_confidence, page_kind). Sensitive labels are
    skipped. Raw text is never included in the returned dict.
    """
    lines = group_into_lines(ocr_results)

    extracted: Dict[str, Optional[str]] = {k: None for k in FIELDS}
    ranks: Dict[str, int] = {}

    confidences = [float(conf) for _, _, conf in ocr_results] if ocr_results else []
    avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0

    for line in lines:
        for label, value in line_pairs(line):
            field, rank = _classify_label(label)
            if field is None or (field in ranks and ranks[field] <= rank):
                continue
            cleaned = _clean_value(field, value)
            if cleaned is not None:
                extracted[field] = cleaned
                ranks[field] = rank

    # Fallback: a student ID anywhere outside sensitive rows.
    if extracted['student_id'] is None:
        for line in lines:
            if any(_is_sensitive(label) for label, _ in line_pairs(line)):
                continue
            for _, text, _ in line:
                m = _STUDENT_ID_RE.search(text)
                if m:
                    extracted['student_id'] = m.group(1)
                    break
            if extracted['student_id']:
                break

    if extracted['faculty'] is None and extracted['curriculum']:
        extracted['faculty'] = _programme_from_curriculum(extracted['curriculum'])

    _read_profile_card(lines, extracted)

    return extracted, avg_confidence, detect_page_kind(lines, extracted)


# The REG profile card (top-left of every REG page) has no labels for the
# names: the Thai name is the line starting with a title, the English name
# is the all-Latin line under it, and the status wraps onto the next line:
#
#     660710260
#     นายสุวพัชร วัฒกีเจริญ
#     suwaphat watthakicharoen
#     สถานภาพนักศึกษา : นักศึกษาปัจจุบัน
#     สถานะปกติ
_THAI_TITLE_RE = re.compile(r'^\s*(นางสาว|นาย|นาง|น\.ส\.)\s*\S')
_LATIN_NAME_RE = re.compile(r'^[A-Za-z][A-Za-z.\'\- ]+[A-Za-z]$')


def _line_text(line) -> str:
    return ' '.join(t.strip() for _, t, _ in line).strip()


def _read_profile_card(lines, extracted: Dict) -> None:
    texts = [_line_text(line) for line in lines]
    th_at = None
    if extracted['full_name_th'] is None:
        for i, text in enumerate(texts):
            if ':' not in text and _THAI_TITLE_RE.match(text):
                extracted['full_name_th'] = text[:200]
                th_at = i
                break
    if extracted['full_name_en'] is None and th_at is not None:
        for text in texts[th_at + 1:th_at + 3]:
            if '@' not in text and _LATIN_NAME_RE.match(text) and ' ' in text:
                extracted['full_name_en'] = _clean_value('full_name_en', text)
                break

    status = extracted['student_status']
    if status and 'ปกติ' not in status and 'สถานะ' not in status:
        at = next((i for i, t in enumerate(texts) if status in t), None)
        for text in texts[at + 1:at + 3] if at is not None else []:
            if ':' in text or _is_sensitive(text):
                break
            if text.startswith('สถานะ'):
                extracted['student_status'] = f'{status} {text}'[:300]
                break

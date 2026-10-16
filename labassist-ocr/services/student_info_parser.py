"""
student_info_parser.py — extract allowed student profile fields from a
university info document image.

Allowlist: student_id, full_name_th, full_name_en, education_level,
           curriculum, faculty, campus, student_status.

Sensitive fields (national_id, birth_date, age, religion, nationality,
address, postal_code, phone, emergency_contact) are explicitly blocked
and never returned.
"""

import re
from typing import Dict, Optional, Tuple

from utils.helpers import group_into_lines

_STUDENT_ID_RE = re.compile(r'\b(\d{10})\b')
_THAI_CHARS = re.compile(r'[฀-๿]')

_LABELS: Dict[str, list] = {
    'student_id': [
        r'รหัสนักศึกษา',
        r'รหัสประจำตัวนักศึกษา',
        r'student[\s_]?id',
    ],
    'full_name_th': [
        r'ชื่อ[-\s]?นามสกุล\s*[\(\（]?ภาษาไทย',
        r'ชื่อ[-\s]?นามสกุล\s*[\(\（]?ไทย',
        r'ชื่อ[-\s]?นามสกุล',
        r'ชื่อ[-\s]?สกุล',
        r'ชื่อ\s*\(นาม\)สกุล',
        r'^ชื่อ$',
    ],
    'full_name_en': [
        r'ชื่อ[-\s]?นามสกุล\s*[\(\（]?ภาษาอังกฤษ',
        r'ชื่อ[-\s]?นามสกุล\s*[\(\（]?อังกฤษ',
        r'full[\s_]?name',
        r'name[\s_]?\(english\)',
        r'english[\s_]?name',
    ],
    'education_level': [
        r'ระดับการศึกษา',
        r'ระดับ\b',
        r'education[\s_]?level',
    ],
    'curriculum': [
        r'หลักสูตร',
        r'curriculum',
    ],
    'faculty': [
        r'ภาควิชา',
        r'faculty',
        r'department',
        r'คณะ/สาขา',
        r'^คณะ$',
    ],
    'campus': [
        r'วิทยาเขต',
        r'\bcampus\b',
    ],
    'student_status': [
        r'สถานภาพ',
        r'สถานะนักศึกษา',
        r'student[\s_]?status',
    ],
}

# Sensitive field patterns — lines matching these are skipped entirely
_SENSITIVE_PATTERNS = [
    re.compile(p, re.IGNORECASE) for p in [
        r'เลขบัตรประชาชน', r'เลขประจำตัวประชาชน',
        r'national[\s_]?id', r'id[\s_]?card',
        r'วันเกิด', r'วันเดือนปีเกิด',
        r'birth[\s_]?date', r'date[\s_]?of[\s_]?birth',
        r'\bอายุ\b', r'\bage\b',
        r'ศาสนา', r'religion',
        r'สัญชาติ', r'nationality',
        r'ที่อยู่', r'\baddress\b',
        r'รหัสไปรษณีย์', r'postal[\s_]?code', r'zip[\s_]?code',
        r'โทรศัพท์', r'เบอร์โทร', r'\bphone\b', r'\btel\b',
        r'ผู้ติดต่อฉุกเฉิน', r'emergency[\s_]?contact',
        r'ผู้ปกครอง',
    ]
]


def _is_label(text: str, patterns: list) -> bool:
    t = text.strip()
    return any(re.search(pat, t, re.IGNORECASE) for pat in patterns)


def _is_sensitive(text: str) -> bool:
    return any(pat.search(text) for pat in _SENSITIVE_PATTERNS)


def _after_colon(text: str) -> str:
    for sep in (':', '：'):
        if sep in text:
            return text.split(sep, 1)[1].strip()
    return ''


def _is_thai(text: str) -> bool:
    return bool(_THAI_CHARS.search(text))


def extract_student_info(ocr_results) -> Tuple[Dict, float]:
    """
    Scan OCR results for allowed student-info fields.

    Returns (fields_dict, avg_confidence). Sensitive fields are explicitly
    skipped. Raw text is never included in the returned dict.
    """
    lines = group_into_lines(ocr_results)

    extracted: Dict[str, Optional[object]] = {k: None for k in _LABELS}

    confidences = [float(conf) for _, _, conf in ocr_results] if ocr_results else []
    avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0

    for line in lines:
        full_line_text = ' '.join(t for _, t, _ in line)
        if _is_sensitive(full_line_text):
            continue

        for idx, (_, text, _) in enumerate(line):
            same_token_after_colon = _after_colon(text)
            rest_of_line = ' '.join(t for _, t, _ in line[idx + 1:])
            value_text = same_token_after_colon or rest_of_line

            if not value_text.strip():
                continue

            for field, patterns in _LABELS.items():
                if extracted[field] is not None:
                    continue
                if not _is_label(text, patterns):
                    continue

                if field == 'student_id':
                    m = _STUDENT_ID_RE.search(value_text)
                    if m:
                        extracted['student_id'] = m.group(1)

                elif field == 'full_name_th':
                    v = value_text.strip()[:200]
                    if not v:
                        continue
                    # Explicit Thai-language label: trust directly if value has Thai chars
                    thai_explicit = re.search(r'ไทย|ภาษาไทย', text, re.IGNORECASE)
                    if thai_explicit and _is_thai(v):
                        extracted['full_name_th'] = v
                    elif not thai_explicit and _is_thai(v):
                        extracted['full_name_th'] = v

                elif field == 'full_name_en':
                    v = value_text.strip()[:200]
                    if not v or len(v) < 4:
                        continue
                    en_explicit = re.search(r'อังกฤษ|english', text, re.IGNORECASE)
                    if en_explicit and not _is_thai(v):
                        extracted['full_name_en'] = v
                    elif not en_explicit and not _is_thai(v):
                        extracted['full_name_en'] = v

                else:
                    v = value_text.strip()[:300]
                    if v:
                        extracted[field] = v

    # Fallback: scan entire doc for a 10-digit student ID (skip sensitive lines)
    if extracted['student_id'] is None:
        for line in lines:
            full_line = ' '.join(t for _, t, _ in line)
            if _is_sensitive(full_line):
                continue
            for _, text, _ in line:
                m = _STUDENT_ID_RE.search(text)
                if m:
                    extracted['student_id'] = m.group(1)
                    break
            if extracted['student_id']:
                break

    return extracted, avg_confidence

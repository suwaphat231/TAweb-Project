"""Parse an academic-calendar PDF (ปฏิทินการศึกษา) into dated entries.

The university publishes the calendar as a table: one activity per row, with
one date column per semester (ภาคต้น / ภาคปลาย / ภาคฤดูร้อน), sometimes
followed by a free-form list of holidays ("วันจันทร์ที่ 13 ตุลาคม 2569 ...").
The layout changes slightly every year, so the parser works on positioned
text fragments (from the PDF text layer, or EasyOCR for scanned files)
instead of a fixed template:

1. find the semester header row to learn each semester column's x position;
2. group fragments into visual rows;
3. in each row, the fragments without a date form the activity name and each
   date fragment is assigned to the nearest semester column (or, with no
   header, to the semester whose months contain the date).

Results are suggestions: the admin reviews and edits them before saving.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from typing import Optional


@dataclass
class Token:
    text: str
    x0: float
    y0: float
    x1: float
    y1: float
    page: int = 0

    @property
    def xc(self) -> float:
        return (self.x0 + self.x1) / 2

    @property
    def yc(self) -> float:
        return (self.y0 + self.y1) / 2


@dataclass
class CalendarEntry:
    start_date: date
    end_date: date
    name: str
    semester: str            # "1", "2" or "S"
    date_type: Optional[str]  # public_holiday | university_holiday | no_class | None (activity only)
    include: bool             # suggested default for the admin's checkbox
    page: int


# ---------------------------------------------------------------------------
# Thai date parsing
# ---------------------------------------------------------------------------

_THAI_DIGITS = str.maketrans("๐๑๒๓๔๕๖๗๘๙", "0123456789")

# Month spellings, full names first so "มกราคม" is not read as "ม.ค." + junk.
# Abbreviations tolerate the spaces/missing dots PDF extraction often produces.
_MONTHS = [
    (1, ["มกราคม", r"ม\.?\s?ค\.?"]),
    (2, ["กุมภาพันธ์", r"ก\.?\s?พ\.?"]),
    (3, ["มีนาคม", r"มี\.?\s?ค\.?"]),
    (4, ["เมษายน", r"เม\.?\s?ย\.?"]),
    (5, ["พฤษภาคม", r"พ\.?\s?ค\.?"]),
    # OCR of scanned calendars often reads มิ.ย. as มึ.ย.
    (6, ["มิถุนายน", r"ม[ิึ]\.?\s?ย\.?"]),
    (7, ["กรกฎาคม", r"ก\.?\s?ค\.?"]),
    (8, ["สิงหาคม", r"ส\.?\s?ค\.?"]),
    (9, ["กันยายน", r"ก\.?\s?ย\.?"]),
    (10, ["ตุลาคม", r"ต\.?\s?ค\.?"]),
    (11, ["พฤศจิกายน", r"พ\.?\s?ย\.?"]),
    (12, ["ธันวาคม", r"ธ\.?\s?ค\.?"]),
]
# Full names first across all months, then abbreviations, so the regex
# alternation never stops at a shorter abbreviation inside a full name.
_MONTH_ALTS = [(m, p) for m, pats in _MONTHS for p in pats[:1]] + \
              [(m, p) for m, pats in _MONTHS for p in pats[1:]]
_MONTH_RE = "|".join(f"(?:{p})" for _, p in _MONTH_ALTS)
_MONTH_COMPILED = [(m, re.compile(f"^(?:{p})$")) for m, p in _MONTH_ALTS]

_DAY = r"(?<!\d)(?P<{n}>[0-3]?\d)"
_MON = r"(?P<{n}>" + _MONTH_RE + ")"
_YEAR = r"(?:\s*(?:พ\.?\s?ศ\.?\s*)?(?P<{n}>25\d\d|20\d\d|\d\d)(?!\d))?"
# Between the two ends of a range: a dash or "ถึง", then an optional weekday
# ("ถึงวันศุกร์ที่ 2 ต.ค.", "จ.13 - ศ.17 ก.ค.").
# PDF text layers often encode the hyphen as a soft hyphen (U+00AD) or one
# of the Unicode hyphen/minus variants rather than "-".
_DASH = r"\s*(?:[-­‐‑‒–—−]|ถึง)\s*(?:วัน\S{0,10}?(?:ที่)?\s*|(?:จ|อ|พฤ|พ|ศ|ส|อา)\.\s*)?"

_RANGE_CROSS = re.compile(
    _DAY.format(n="d1") + r"\s*" + _MON.format(n="m1") + _YEAR.format(n="y1")
    + _DASH + _DAY.format(n="d2") + r"\s*" + _MON.format(n="m2") + _YEAR.format(n="y2")
)
_RANGE_SAME = re.compile(
    _DAY.format(n="d1") + _DASH + _DAY.format(n="d2") + r"\s*" + _MON.format(n="m2") + _YEAR.format(n="y2")
)
_SINGLE = re.compile(_DAY.format(n="d2") + r"\s*" + _MON.format(n="m2") + _YEAR.format(n="y2"))

# Weekday prefixes left behind once the date itself is cut out of a phrase.
_WEEKDAY_NOISE = re.compile(
    r"(?:วัน)?(?:จันทร์|อังคาร|พุธ|พฤหัสบดี|พฤหัสฯ?|ศุกร์|เสาร์|อาทิตย์)(?:ที่)?|"
    r"\((?:จ|อ|พ|พฤ|ศ|ส|อา)\.?[\s\-–]*\)|(?<!\S)(?:จ|อ|พฤ|พ|ศ|ส|อา)\.\d*(?!\S)|วันที่|ที่(?=\s*$)|"
    # OCR misreads of a weekday left on its own ("พุธ" read as "พธ").
    r"(?<!\S)(?:พธ|จันทร|องคาร|ศกร|เสาร|อาทิตย)(?!\S)"
)


def _month_of(text: str) -> int:
    t = text.strip()
    for m, rx in _MONTH_COMPILED:
        if rx.match(t):
            return m
    raise ValueError(text)


def _year_be(raw: Optional[str]) -> Optional[int]:
    if not raw:
        return None
    y = int(raw)
    if y < 100:
        return 2500 + y
    if y < 2400:  # Christian era
        return y + 543
    return y


def _default_year_be(month: int, academic_year: int, semester: Optional[str]) -> int:
    """Guess the BE year of a date printed without one. The academic year
    starts around June: Jun-Dec fall in the academic year itself, Jan-May in
    the next, and summer-session dates are always in the next."""
    if semester == "S" or month <= 5:
        return academic_year + 1
    return academic_year


def _make_date(day: int, month: int, year_be: int) -> Optional[date]:
    try:
        return date(year_be - 543, month, day)
    except ValueError:
        return None


@dataclass
class DateMatch:
    start: date
    end: date
    span: tuple[int, int]


def find_dates(text: str, academic_year: int, semester: Optional[str] = None) -> list[DateMatch]:
    """All dates/date ranges written in ``text``, in order."""
    text = text.translate(_THAI_DIGITS)
    out: list[DateMatch] = []
    taken: list[tuple[int, int]] = []

    def free(a: int, b: int) -> bool:
        return all(b <= s or a >= e for s, e in taken)

    for rx in (_RANGE_CROSS, _RANGE_SAME, _SINGLE):
        for m in rx.finditer(text):
            if not free(*m.span()):
                continue
            g = m.groupdict()
            m2 = _month_of(g["m2"])
            y2 = _year_be(g.get("y2")) or _default_year_be(m2, academic_year, semester)
            end = _make_date(int(g["d2"]), m2, y2)
            if end is None:
                continue
            if g.get("d1"):
                m1 = _month_of(g["m1"]) if g.get("m1") else m2
                y1 = _year_be(g.get("y1"))
                if y1 is None:
                    y1 = y2 - 1 if m1 > m2 else y2
                start = _make_date(int(g["d1"]), m1, y1)
                if start is None or start > end:
                    continue
            else:
                start = end
            taken.append(m.span())
            out.append(DateMatch(start, end, m.span()))
    out.sort(key=lambda d: d.span[0])
    return out


def strip_dates(text: str, matches: list[DateMatch]) -> str:
    text = text.translate(_THAI_DIGITS)
    for m in sorted(matches, key=lambda d: d.span[0], reverse=True):
        text = text[: m.span[0]] + " " + text[m.span[1]:]
    return clean_name(text)


def clean_name(text: str) -> str:
    # OCR scatters the phinthu mark (ฺ), which ordinary Thai never uses.
    text = text.replace("ฺ", "")
    text = _WEEKDAY_NOISE.sub(" ", text)
    text = re.sub(r"^[\s\d.)\-–—•*:,]+", "", text)  # leading list numbering / bullets
    # A row number OCR misread as Latin letters ("15." → "a.", "11." → "ii.").
    text = re.sub(r"^[A-Za-z|]{1,3}\.\s*", "", text)
    text = re.sub(r"[\s\-–—:,]+$", "", text)
    return re.sub(r"\s+", " ", text).strip()


# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------

_NO_CLASS = re.compile(
    r"งด(?:การ)?(?:เรียน|สอน)|สอบ(?:กลางภาค|ปลายภาค|ประจำภาค|ไล่)|สัปดาห์สอบ|การสอบ|วันสอบ|midterm|final exam",
    re.I,
)
# Exam-related deadlines that do not stop teaching themselves.
_EXAM_PAPERWORK = re.compile(r"ประกาศผล|ส่งผล|ส่งเกรด|คำร้อง|คําร้อง|ตารางสอบ|ขอสอบ")
# "วันหยุด" but not "รวมวันหยุด" (fee wording), or a phrase starting with "หยุด".
_HOLIDAY_WORD = re.compile(r"(?<!รวม)วันหยุด|(?:^|\s)หยุด|หยุด(?:เรียน|ราชการ|ชดเชย)")
# A makeup *teaching* day is a normal working day, not a holiday.
_MAKEUP_TEACHING = re.compile(r"(?:สอน|เรียน)ชดเชย")
_UNIVERSITY_DAYS = ["ศิลป์ พีระศรี", "ศิลป์พีระศรี", "สถาปนา", "วันศิลปากร"]
_PUBLIC = ["หยุดราชการ", "นักขัตฤกษ์", "หยุดชดเชย", "ปิยมหาราช", "วันพ่อ", "วันแม่", "รัฐธรรมนูญ",
           "สิ้นปี", "ขึ้นปีใหม่", "มาฆบูชา", "วิสาขบูชา", "อาสาฬหบูชา", "อาสาฬบูชา", "เข้าพรรษา",
           "สงกรานต์", "จักรี", "ฉัตรมงคล", "เฉลิมพระชนมพรรษา", "สวรรคต", "นวมินทรมหาราช",
           "แรงงาน", "พืชมงคล", "พระบรมราชสมภพ", "ตรุษจีน"]


_NAMED_DAY = re.compile(r"^วัน\S")
# Words that make a "วัน..." row an activity or deadline rather than a named
# day (spellings without tone marks/vowels are common OCR misreads).
_ACTIVITY = re.compile(
    r"สุดท้าย|เปิด|ปิด|เริ่ม|เริม|เพิ่ม|เพิม|ถอน|ลงทะเบียน|สอบ|ประเมิน|รับ|ส่ง|แก้|เปลี่ยน|เปลียน|"
    r"ยื่น|ยีน|ชำระ|ชําระ|ประกาศ|ลบ|ลด|ปฐมนิเทศ|เรียน|สอน|ฝึก|พบ|ทับ|คำร้อง|คําร้อง|ขอ|อนุมัติ|ประชุม|สภา"
)


def classify(name: str) -> tuple[Optional[str], bool]:
    """Suggested (date_type, include) for an activity name. Activities that
    do not stop teaching (registration, payment deadlines, ...) get no type
    and are left unticked."""
    n = name.lower()
    if _MAKEUP_TEACHING.match(n.removeprefix("วัน")):
        return None, False
    if _NO_CLASS.search(n) and not _EXAM_PAPERWORK.search(n):
        return "no_class", True
    public = any(k in n for k in _PUBLIC)
    if _MAKEUP_TEACHING.search(n) and not public:
        return None, False
    holiday_word = bool(_HOLIDAY_WORD.search(n))
    if any(k in n for k in _UNIVERSITY_DAYS) or (holiday_word and "มหาวิทยาลัย" in n):
        return "university_holiday", True
    if public or holiday_word:
        return "public_holiday", True
    # A named commemoration day ("วันมหาธีรราชเจ้า", "วันหม่อมหลวงปิ่น มาลากุล")
    # is listed without saying whether teaching stops: offer it as a
    # university holiday, unticked, for the admin to decide.
    if _NAMED_DAY.match(n) and not _ACTIVITY.search(n) and len(n) <= 60:
        return "university_holiday", False
    return None, False


# ---------------------------------------------------------------------------
# Layout
# ---------------------------------------------------------------------------

_SEM_HEADERS = [
    ("S", re.compile(r"ฤดูร้อน|ภาค\S*พิเศษ|ภาค\S*\s*ที่\s*3|summer", re.I)),
    ("1", re.compile(r"ภาค\S*\s*ต้น|ภาค\S*\s*ที่\s*1|first", re.I)),
    ("2", re.compile(r"ภาค\S*\s*ปลาย|ภาค\S*\s*ที่\s*2|second", re.I)),
]
_YEAR_TITLE = re.compile(r"ปีการศึกษา\s*(25\d\d)")
_FULL_MONTHS = "|".join(pats[0] for _, pats in _MONTHS)
# Lines that are layout, never part of an activity name: month dividers
# ("กรกฎาคม 2569"), page numbers, rules.
_DIVIDER = re.compile(r"^(?:(?:" + _FULL_MONTHS + r")\s*(?:พ\.?\s?ศ\.?\s*)?\d{4}|[\d\s\-–—/.()]*|-{3,}.*)$")
# Paragraphs of prose (notes, the announcement's preamble and signature).
# A table's own header row ("ลำดับ | กำหนด | ชื่อวันหยุด").
_TABLE_HEADER = re.compile(
    r"^(?:(?:ลำดับ|ลําดับ|ที่|กำหนด|กําหนด|กำหนดการ|กําหนดการ|วันที่|วัน\s*เดือน\s*ปี|รายการ|กิจกรรม|"
    r"ชื่อวันหยุด|วันหยุด|หมายเหตุ)\s*)+$"
)
_NOTE_START = re.compile(r"^(?:หมายเหตุ|อนึ่ง|ทั้งนี้|ประกาศ\s*ณ|จึงประกาศ)")


def _semester_of_header(text: str) -> Optional[str]:
    t = text.translate(_THAI_DIGITS)
    for sem, rx in _SEM_HEADERS:
        if rx.search(t):
            return sem
    return None


def _section_heading(text: str) -> Optional[str]:
    """Semester of a heading line such as "ภาคการศึกษาต้น" or
    "กิจกรรมก่อนภาคการศึกษาที่ 1/2569", which starts a block of rows."""
    t = text.strip().lstrip("/-–• ").rstrip(". ")
    if len(t) > 60 or not re.match(r"^(?:ภาค|กิจกรรม)", t):
        return None
    return _semester_of_header(t)


def semester_for_date(d: date, academic_year: int) -> str:
    """Last-resort semester when the PDF has neither columns nor headings."""
    ce = academic_year - 543
    if d < date(ce, 11, 1):
        return "1"
    if d < date(ce + 1, 4, 16):
        return "2"
    return "S"


def group_rows(tokens: list[Token]) -> list[list[Token]]:
    """Group fragments whose vertical centres are close into visual rows."""
    rows: list[list[Token]] = []
    for t in sorted(tokens, key=lambda t: (t.page, t.yc, t.x0)):
        if rows:
            last = rows[-1]
            h = max(t.y1 - t.y0, 1.0)
            ref = sum(x.yc for x in last) / len(last)
            if last[0].page == t.page and abs(t.yc - ref) <= h * 0.5:
                last.append(t)
                continue
        rows.append([t])
    return [sorted(r, key=lambda t: t.x0) for r in rows]


_HEADER_CELL = re.compile(r"^(?:ภาค|first|second|summer)", re.I)


def _find_columns(row: list[Token]) -> dict[str, float]:
    """Semester columns of a header row. Each header cell must be a short
    label starting with "ภาค", so a table cell that merely mentions a term
    ("(แก้ I ภาคการศึกษาปลาย ...") is not taken for a new header."""
    cols: dict[str, float] = {}
    for t in row:
        text = t.text.strip()
        if len(text) > 30 or not _HEADER_CELL.match(text):
            continue
        sem = _semester_of_header(text)
        if sem and sem not in cols and not find_dates(text, 2500):
            cols[sem] = t.xc
    return cols if len(cols) >= 2 else {}


def _merge_cells(row: list[Token], columns: dict[str, float], label_edge: float) -> list[Token]:
    """Join the fragments of one table cell (OCR often splits "เสาร์ 7 พ.ย. 69"
    into pieces) so a date is matched as a whole. Label-column tokens are
    kept as they are."""
    if not columns:
        return row
    out: list[Token] = []
    cells: dict[str, Token] = {}
    for t in row:
        if t.xc < label_edge:
            out.append(t)
            continue
        sem = _nearest(columns, t.xc)
        cell = cells.get(sem)
        if cell is None:
            cells[sem] = Token(t.text, t.x0, t.y0, t.x1, t.y1, t.page)
        else:
            cell.text += " " + t.text
            cell.x0, cell.x1 = min(cell.x0, t.x0), max(cell.x1, t.x1)
            cell.y0, cell.y1 = min(cell.y0, t.y0), max(cell.y1, t.y1)
    return sorted(out + list(cells.values()), key=lambda t: t.x0)


def detect_academic_year(tokens: list[Token]) -> Optional[int]:
    for t in tokens:
        m = _YEAR_TITLE.search(t.text.translate(_THAI_DIGITS))
        if m:
            return int(m.group(1))
    return None


@dataclass
class _Line:
    kind: str                 # "dated" | "text" | "barrier"
    label: str
    y: float
    h: float
    page: int
    entries: list[CalendarEntry]
    # A dated line from the free-form list under a table; text above it is
    # that list's heading, not part of its name.
    prose: bool = False
    # The row starts with an item number ("15.") in the table's first column.
    numbered: bool = False


def _classify_rows(rows: list[list[Token]], academic_year: int) -> list[_Line]:
    """First pass: turn each visual row into a dated row (with entries whose
    names may still be incomplete), a free text line, or a barrier that text
    must not be attached across (headings, dividers, notes)."""
    lines: list[_Line] = []
    columns: dict[str, float] = {}
    # Border between the activity-name column and the first semester column:
    # half a column width left of the first header's centre. A fragment whose
    # centre lies left of it is part of the name. (Header left edges fail both
    # for centred cells wider than the header and for left-aligned ones.)
    label_edge = 0.0
    section: Optional[str] = None
    in_note = False

    for row in rows:
        page = row[0].page
        y = sum(t.yc for t in row) / len(row)
        h = sorted(t.y1 - t.y0 for t in row)[len(row) // 2]
        raw = " ".join(t.text for t in row)
        joined = clean_name(raw)

        def barrier() -> None:
            lines.append(_Line("barrier", "", y, h, page, []))

        cols = _find_columns(row)
        if cols:
            columns, section, in_note = cols, None, False
            centres = sorted(cols.values())
            label_edge = centres[0] - (centres[1] - centres[0]) / 2
            barrier()
            continue

        row = _merge_cells(row, columns, label_edge)
        label_parts: list[str] = []
        dated: list[tuple[Token, list[DateMatch]]] = []
        for t in row:
            # Text left of every semester column is the activity name, even
            # if it mentions a date ("ภายในวันที่ 5 ...").
            in_label_col = bool(columns) and t.xc < label_edge
            matches = [] if in_label_col else find_dates(t.text, academic_year, _nearest(columns, t.xc) or section)
            if matches:
                dated.append((t, matches))
                rest = strip_dates(t.text, matches)
                # A fragment that is mostly prose ("13 ต.ค. 2569 วันนวมินทรมหาราช")
                # also carries the name when the row has no label column.
                if rest and not columns:
                    label_parts.append(rest)
            else:
                label_parts.append(t.text)
        label = clean_name(" ".join(label_parts))

        # A prose line outside the table (e.g. the holiday list printed under
        # it) sits in the label column but holds its own date.
        prose = False
        if not dated and columns:
            matches = find_dates(raw, academic_year, section)
            if matches and strip_dates(raw, matches):
                dated, label, prose = [(row[0], matches)], strip_dates(raw, matches), True

        if not dated:
            heading = _section_heading(joined)
            if heading:
                section, in_note = heading, False
                barrier()
            elif _NOTE_START.match(joined):
                # Dates listed after a note belong to the whole year, not the
                # last section; they are placed by date in parse_calendar.
                in_note, section = True, None
                barrier()
            elif in_note or _DIVIDER.match(joined) or _TABLE_HEADER.match(joined):
                barrier()
            else:
                lines.append(_Line("text", joined, y, h, page, []))
            continue

        in_note = False
        entries: list[CalendarEntry] = []
        for t, matches in dated:
            col_sem = None if prose else _nearest(columns, t.xc)
            for m in matches:
                entries.append(CalendarEntry(m.start, m.end, label, col_sem or section or "", None, False, t.page + 1))
        numbered = bool(re.match(r"^\s*\d{1,3}\s*\.", raw.translate(_THAI_DIGITS)))
        lines.append(_Line("dated", label, y, h, page, entries, prose, numbered))
    return lines


def _attach_wrapped_text(lines: list[_Line]) -> None:
    """Second pass: a run of text lines between dated rows is a wrapped
    activity name. It belongs to the row with no name of its own if there is
    one, otherwise to whichever neighbouring row is closer (ties go to the
    row above, where wrapped text continues). Long runs are prose and dropped."""
    i = 0
    while i < len(lines):
        if lines[i].kind != "text":
            i += 1
            continue
        j = i
        while j < len(lines) and lines[j].kind == "text":
            j += 1
        block = lines[i:j]
        prev = lines[i - 1] if i > 0 and lines[i - 1].kind == "dated" and lines[i - 1].page == block[0].page else None
        nxt = lines[j] if j < len(lines) and lines[j].kind == "dated" and lines[j].page == block[-1].page and not lines[j].prose else None
        text = " ".join(b.label for b in block)

        # A numbered row ("15. วันศิลป์ พีระศรี") starts a new table entry, so
        # text above it can only continue the row before.
        if nxt and nxt.label and nxt.numbered:
            nxt = None

        target, prepend = None, False
        if nxt and not nxt.label:
            target, prepend = nxt, True
        elif len(block) <= 2:
            limit = 2.5 * max(b.h for b in block)
            gap_prev = block[0].y - prev.y if prev else float("inf")
            gap_next = nxt.y - block[-1].y if nxt else float("inf")
            if min(gap_prev, gap_next) <= limit:
                target, prepend = (prev, False) if gap_prev <= gap_next else (nxt, True)

        if target is not None:
            target.label = clean_name(f"{text} {target.label}" if prepend else f"{target.label} {text}")
        i = j


def parse_calendar(tokens: list[Token], academic_year: int) -> list[CalendarEntry]:
    rows = group_rows([t for t in tokens if t.text.strip()])
    lines = _classify_rows(rows, academic_year)
    _attach_wrapped_text(lines)

    entries: list[CalendarEntry] = []
    for line in lines:
        if line.kind != "dated" or not line.label:
            continue
        date_type, include = classify(line.label)
        for e in line.entries:
            e.name, e.date_type, e.include = line.label, date_type, include
            entries.append(e)
    _place_unsectioned(entries, academic_year)
    # Calendars often mention the neighbouring years (deadlines carried over,
    # next year's first exams); keep only this academic year's window.
    ce = academic_year - 543
    first, last = date(ce, 4, 1), date(ce + 1, 8, 31)
    return _dedupe([e for e in entries if e.end_date >= first and e.start_date <= last])


def _place_unsectioned(entries: list[CalendarEntry], academic_year: int) -> None:
    """Give entries outside any semester column/section the semester whose
    dates (as seen in this file) are closest; with nothing to compare
    against, fall back to the usual months."""
    spans: dict[str, tuple[date, date]] = {}
    for e in entries:
        if e.semester:
            lo, hi = spans.get(e.semester, (e.start_date, e.end_date))
            spans[e.semester] = (min(lo, e.start_date), max(hi, e.end_date))
    for e in entries:
        if e.semester:
            continue
        if not spans:
            e.semester = semester_for_date(e.start_date, academic_year)
            continue

        def distance(sem: str) -> int:
            lo, hi = spans[sem]
            if lo <= e.start_date <= hi:
                return 0
            return min(abs((e.start_date - lo).days), abs((e.start_date - hi).days))

        e.semester = min(spans, key=distance)


def _nearest(columns: dict[str, float], x: float) -> Optional[str]:
    if not columns:
        return None
    return min(columns, key=lambda s: abs(columns[s] - x))


def _dedupe(entries: list[CalendarEntry]) -> list[CalendarEntry]:
    seen: set[tuple] = set()
    out: list[CalendarEntry] = []
    for e in entries:
        key = (e.start_date, e.end_date, e.name, e.semester)
        if key not in seen:
            seen.add(key)
            out.append(e)
    return sorted(out, key=lambda e: (e.start_date, e.semester))


# ---------------------------------------------------------------------------
# PDF → tokens
# ---------------------------------------------------------------------------

def tokens_from_pdf(pdf_bytes: bytes, max_pages: int = 20) -> list[Token]:
    """Text-layer phrases of a digital PDF. Returns [] for a scanned PDF."""
    import fitz  # PyMuPDF

    tokens: list[Token] = []
    with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
        for pno, page in enumerate(doc[:max_pages]):
            # Words, re-joined into phrases. PyMuPDF often reports a whole
            # table row as one line, so a wide gap (a column boundary) must
            # start a new token.
            cur: Optional[Token] = None
            cur_key = None
            for x0, y0, x1, y1, word, block, line, _w in page.get_text("words"):
                key = (block, line)
                gap_ok = cur is not None and 0 <= x0 - cur.x1 <= 0.8 * (y1 - y0)
                if cur is not None and key == cur_key and gap_ok:
                    cur.text += " " + word
                    cur.x1, cur.y0, cur.y1 = x1, min(cur.y0, y0), max(cur.y1, y1)
                else:
                    if cur is not None:
                        tokens.append(cur)
                    cur, cur_key = Token(word, x0, y0, x1, y1, pno), key
            if cur is not None:
                tokens.append(cur)
    return tokens


def tokens_from_ocr(ocr_pages: list[list]) -> list[Token]:
    """EasyOCR (box, text, conf) results, one list per page."""
    tokens: list[Token] = []
    for pno, results in enumerate(ocr_pages):
        for box, text, _conf in results:
            xs = [p[0] for p in box]
            ys = [p[1] for p in box]
            tokens.append(Token(str(text), min(xs), min(ys), max(xs), max(ys), pno))
    return tokens


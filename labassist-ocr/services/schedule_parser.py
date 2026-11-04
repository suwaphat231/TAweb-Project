"""
schedule_parser.py — extract day+time slots from a university timetable image.

Supports two Thai university timetable layouts:
- Landscape: day names are column headers (left→right), time labels are row headers
- Portrait:  day names are row headers (top→bottom), time labels are column headers

Returns a list of ScheduleSlot (day abbreviation + HH:MM start/end).
"""

import re
from typing import List, Dict, Optional, Tuple
from models.schemas import ScheduleSlot

# ─── Day-name lookup (Thai + English, case-insensitive) ──────────────────────

_DAY_ALIASES: Dict[str, str] = {}
for _abbr, _aliases in {
    'MON': ['mon', 'monday', 'จันทร์', 'จ'],
    'TUE': ['tue', 'tuesday', 'อังคาร', 'อ'],
    'WED': ['wed', 'wednesday', 'พุธ', 'พ'],
    'THU': ['thu', 'thursday', 'พฤหัสบดี', 'พฤหัส', 'พฤ'],
    'FRI': ['fri', 'friday', 'ศุกร์', 'ศ'],
    'SAT': ['sat', 'saturday', 'เสาร์', 'ส'],
    'SUN': ['sun', 'sunday', 'อาทิตย์', 'อา'],
}.items():
    for _a in _aliases:
        _DAY_ALIASES[_a.lower()] = _abbr

_TIME_RE = re.compile(r'\b(\d{1,2})[:.：](\d{2})\b')
_DAY_ORDER = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']


def _fmt(h: int, m: int) -> str:
    return f"{h:02d}:{m:02d}"


def _add_minutes(t: str, minutes: int) -> str:
    h, m = map(int, t.split(':'))
    total = h * 60 + m + minutes
    return _fmt(total // 60 % 24, total % 60)


# Short aliases such as "พ" or "อ" are single letters that also occur inside course
# names and room labels, so they only match a whole cell. Longer aliases may match
# a word inside the cell.
_SUBSTRING_MIN_LEN = 4


def _detect_day(text: str) -> Optional[str]:
    t = text.strip().lower().rstrip('.')
    if t in _DAY_ALIASES:
        return _DAY_ALIASES[t]
    for alias, abbr in _DAY_ALIASES.items():
        if len(alias) >= _SUBSTRING_MIN_LEN and alias in t:
            return abbr
    return None


def _extract_times(text: str) -> List[str]:
    return [_fmt(int(h), int(m)) for h, m in _TIME_RE.findall(text)]


def _center(bbox) -> Tuple[float, float]:
    xs = [p[0] for p in bbox]
    ys = [p[1] for p in bbox]
    return sum(xs) / 4, sum(ys) / 4


# ─── Main entry point ─────────────────────────────────────────────────────────

def parse_schedule(ocr_results) -> List[ScheduleSlot]:
    """
    Convert EasyOCR results from a timetable image to a list of ScheduleSlot.
    Each element of ocr_results is (bbox, text, confidence).
    bbox is [[x1,y1],[x2,y1],[x2,y2],[x1,y2]] (clockwise from top-left).
    """
    if not ocr_results:
        return []

    boxes = []
    for bbox, text, conf in ocr_results:
        cx, cy = _center(bbox)
        day = _detect_day(text)
        times = _extract_times(text)
        boxes.append({
            'bbox': bbox,
            'text': text.strip(),
            'conf': float(conf),
            'cx': cx,
            'cy': cy,
            'day': day,
            'times': times,
        })

    day_boxes = [b for b in boxes if b['day']]
    time_boxes = [b for b in boxes if b['times']]

    if not day_boxes or not time_boxes:
        return []

    # Determine layout by how day labels are arranged spatially
    day_cx = [b['cx'] for b in day_boxes]
    day_cy = [b['cy'] for b in day_boxes]
    cx_spread = max(day_cx) - min(day_cx)
    cy_spread = max(day_cy) - min(day_cy)

    if cx_spread >= cy_spread:
        # Days spread horizontally → they are column headers
        return _parse_column_days(boxes, day_boxes, time_boxes)
    # Days spread vertically → they are row headers. Cells that print their own
    # start and end time are read first; the header grid is only a fallback.
    ranged = _parse_time_ranges(day_boxes, time_boxes)
    if ranged:
        return ranged
    return _parse_row_days(boxes, day_boxes, time_boxes)


def _parse_time_ranges(day_boxes, time_boxes) -> List[ScheduleSlot]:
    """Row-day layout where each cell prints its own "start" and "end" time.

    A row's label sits about a quarter of the way down its band, so a row covers
    [label - spacing/4, next label - spacing/4). Time labels above the first row
    are the column header and are skipped.
    """
    headers = sorted(day_boxes, key=lambda b: b['cy'])
    if len(headers) < 2:
        return []
    gaps = sorted(b['cy'] - a['cy'] for a, b in zip(headers, headers[1:]))
    spacing = gaps[len(gaps) // 2]
    row_tops = [h['cy'] - spacing / 4 for h in headers]

    def row_for(y: float) -> Optional[int]:
        for i, top in enumerate(row_tops):
            bottom = row_tops[i + 1] if i + 1 < len(row_tops) else float('inf')
            if top <= y < bottom:
                return i
        return None

    # Group boxes into text lines first: a start and end time on one line can sit a
    # pixel apart vertically, so ordering by raw cy would put the end before the start.
    line_height = spacing / 8
    body = sorted(
        (b for b in time_boxes if b['cy'] >= row_tops[0]),
        key=lambda b: (round(b['cy'] / line_height), b['cx']),
    )

    slots: List[ScheduleSlot] = []
    used: set = set()
    for i, first in enumerate(body):
        if i in used:
            continue
        row = row_for(first['cy'])
        if row is None:
            continue
        times = first['times']
        if len(times) >= 2:
            start, end = times[0], times[1]
        elif len(times) == 1:
            partner = next(
                (j for j in range(i + 1, len(body))
                 if j not in used
                 and abs(body[j]['cy'] - first['cy']) <= spacing / 8
                 and 0 < body[j]['cx'] - first['cx'] <= spacing * 1.5
                 and len(body[j]['times']) == 1),
                None,
            )
            if partner is None:
                continue
            used.add(partner)
            start, end = times[0], body[partner]['times'][0]
        else:
            continue
        if start >= end:
            continue
        slots.append(ScheduleSlot(day=headers[row]['day'], start_time=start, end_time=end))

    return sorted(slots, key=lambda s: (_DAY_ORDER.index(s.day) if s.day in _DAY_ORDER else 99, s.start_time))


# ─── Column-days layout (landscape) ──────────────────────────────────────────

def _parse_column_days(boxes, day_boxes, time_boxes) -> List[ScheduleSlot]:
    """Day names along the top row; time labels down the left column."""
    # Sort day headers left→right; build column boundary midpoints
    headers = sorted(day_boxes, key=lambda b: b['cx'])
    col_cx = [d['cx'] for d in headers]
    col_names = [d['day'] for d in headers]
    col_bounds = _midpoint_bounds(col_cx)

    def col_for(x: float) -> Optional[int]:
        for i in range(len(col_bounds) - 1):
            if col_bounds[i] <= x < col_bounds[i + 1]:
                return i
        return None

    # Build time rows from the time-label column (leftmost boxes with times)
    time_rows = _build_time_rows_vertical(time_boxes)
    if not time_rows:
        return []

    row_cy = [r[2] for r in time_rows]
    row_bounds = _midpoint_bounds(row_cy)

    def row_for(y: float) -> Optional[int]:
        for i in range(len(row_bounds) - 1):
            if row_bounds[i] <= y < row_bounds[i + 1]:
                return i
        return None

    header_y_max = max(b['cy'] for b in day_boxes) + 5

    seen: set = set()
    slots: List[ScheduleSlot] = []
    for b in boxes:
        if b['cy'] <= header_y_max or b['times']:
            continue
        col = col_for(b['cx'])
        row = row_for(b['cy'])
        if col is None or row is None or col >= len(col_names) or row >= len(time_rows):
            continue
        day = col_names[col]
        start, end, _ = time_rows[row]
        key = (day, start, end)
        if key not in seen:
            seen.add(key)
            slots.append(ScheduleSlot(day=day, start_time=start, end_time=end))

    return sorted(slots, key=lambda s: (_DAY_ORDER.index(s.day) if s.day in _DAY_ORDER else 99, s.start_time))


# ─── Row-days layout (portrait) ───────────────────────────────────────────────

def _parse_row_days(boxes, day_boxes, time_boxes) -> List[ScheduleSlot]:
    """Day names down the left column; time labels across the top row."""
    headers = sorted(day_boxes, key=lambda b: b['cy'])
    row_cy = [d['cy'] for d in headers]
    row_names = [d['day'] for d in headers]
    row_bounds = _midpoint_bounds(row_cy)

    def row_for(y: float) -> Optional[int]:
        for i in range(len(row_bounds) - 1):
            if row_bounds[i] <= y < row_bounds[i + 1]:
                return i
        return None

    time_cols = _build_time_rows_horizontal(time_boxes)
    if not time_cols:
        return []

    col_cx = [c[2] for c in time_cols]
    col_bounds = _midpoint_bounds(col_cx)

    def col_for(x: float) -> Optional[int]:
        for i in range(len(col_bounds) - 1):
            if col_bounds[i] <= x < col_bounds[i + 1]:
                return i
        return None

    header_x_max = max(b['cx'] for b in day_boxes) + 5

    seen: set = set()
    slots: List[ScheduleSlot] = []
    for b in boxes:
        if b['cx'] <= header_x_max or b['times']:
            continue
        col = col_for(b['cx'])
        row = row_for(b['cy'])
        if col is None or row is None or row >= len(row_names) or col >= len(time_cols):
            continue
        day = row_names[row]
        start, end, _ = time_cols[col]
        key = (day, start, end)
        if key not in seen:
            seen.add(key)
            slots.append(ScheduleSlot(day=day, start_time=start, end_time=end))

    return sorted(slots, key=lambda s: (_DAY_ORDER.index(s.day) if s.day in _DAY_ORDER else 99, s.start_time))


# ─── Shared helpers ───────────────────────────────────────────────────────────

def _midpoint_bounds(centers: List[float]) -> List[float]:
    """Return N+1 boundary values from N center positions (with ±∞ at edges)."""
    bounds = [0.0]
    for i in range(len(centers) - 1):
        bounds.append((centers[i] + centers[i + 1]) / 2)
    bounds.append(float('inf'))
    return bounds


def _build_time_rows_vertical(time_boxes) -> List[Tuple[str, str, float]]:
    """Build (start, end, cy) tuples from time-label boxes sorted top→bottom."""
    sorted_boxes = sorted(time_boxes, key=lambda b: b['cy'])
    rows: List[Tuple[str, str, float]] = []
    for i, tb in enumerate(sorted_boxes):
        times = tb['times']
        if len(times) >= 2:
            rows.append((times[0], times[1], tb['cy']))
        elif len(times) == 1:
            if i + 1 < len(sorted_boxes):
                nxt = sorted_boxes[i + 1]['times']
                end = nxt[0] if nxt else _add_minutes(times[0], 50)
            else:
                end = _add_minutes(times[0], 50)
            rows.append((times[0], end, tb['cy']))
    return rows


def _header_line(boxes, key: str, tolerance: float = 40) -> list:
    """Keep the boxes on the most crowded line along `key`.

    A timetable can repeat its time labels further down the page; mixing those
    in would add phantom columns, so only the header line is used.
    """
    best: list = []
    for b in boxes:
        line = [o for o in boxes if abs(o[key] - b[key]) <= tolerance]
        if len(line) > len(best):
            best = line
    return best


def _build_time_rows_horizontal(time_boxes) -> List[Tuple[str, str, float]]:
    """Build (start, end, cx) tuples from time-label boxes sorted left→right."""
    sorted_boxes = sorted(_header_line(time_boxes, 'cy'), key=lambda b: b['cx'])
    cols: List[Tuple[str, str, float]] = []
    for i, tb in enumerate(sorted_boxes):
        times = tb['times']
        if len(times) >= 2:
            cols.append((times[0], times[1], tb['cx']))
        elif len(times) == 1:
            if i + 1 < len(sorted_boxes):
                nxt = sorted_boxes[i + 1]['times']
                end = nxt[0] if nxt else _add_minutes(times[0], 50)
            else:
                end = _add_minutes(times[0], 50)
            cols.append((times[0], end, tb['cx']))
    return cols

"""Run from labassist-ocr/: python tests/test_calendar_parser.py

The PDF round-trip test needs a Thai TrueType font; point THAI_FONT at one
(e.g. tahoma.ttf) or it is skipped.
"""

import os
import sys
import unittest
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.calendar_parser import (  # noqa: E402
    Token, classify, detect_academic_year, find_dates, parse_calendar, tokens_from_pdf,
)

AY = 2569


def tok(text, x, y, w=None, h=12, page=0):
    w = w if w is not None else 6 * len(text)
    return Token(text, x, y, x + w, y + h, page)


# Column centres: label 40-260, ภาคต้น ~330, ภาคปลาย ~450, ฤดูร้อน ~560.
def table_row(y, label, first=None, second=None, summer=None):
    row = [tok(label, 40, y, w=220)]
    for x, text in ((290, first), (410, second), (520, summer)):
        if text:
            row.append(tok(text, x, y, w=80))
    return row


TABLE = [
    tok("ปฏิทินการศึกษา ระดับปริญญาตรี ปีการศึกษา 2569", 120, 20, w=300),
    tok("รายการ", 40, 60, w=60), tok("ภาคการศึกษาต้น", 290, 60, w=80),
    tok("ภาคการศึกษาปลาย", 410, 60, w=80), tok("ภาคฤดูร้อน", 520, 60, w=80),
    *table_row(80, "ลงทะเบียนเรียน", "15 - 19 มิ.ย. 2569", "2 - 6 พ.ย. 2569", "6 - 8 เม.ย. 2570"),
    *table_row(100, "วันเปิดภาคการศึกษา", "22 มิ.ย. 2569", "9 พ.ย. 2569", "20 เม.ย. 2570"),
    *table_row(120, "สอบกลางภาค", "17 - 21 ส.ค. 2569", "4 - 8 ม.ค. 2570"),
    *table_row(140, "สอบปลายภาค", "12 - 23 ต.ค. 2569", "1 - 12 มี.ค. 2570", "1 - 3 มิ.ย. 2570"),
    *table_row(160, "วันหยุดมหาวิทยาลัย (วันศิลป์ พีระศรี)", "15 ก.ย. 2569"),
    *table_row(180, "ปิดภาคการศึกษา", "30 ต.ค. 2569", "30 ธ.ค. 69 - 2 ม.ค. 70"),
    # A label wrapped over two lines, with the dates on the second.
    tok("งดการเรียนการสอนเพื่อ", 40, 200, w=220),
    *table_row(214, "กิจกรรมกีฬามหาวิทยาลัย", None, "๑๕ ม.ค. ๒๕๗๐"),
    # Holiday list printed under the table (one prose line each).
    tok("วันหยุดราชการ", 40, 260, w=100),
    tok("วันศุกร์ที่ 23 ตุลาคม 2569 วันปิยมหาราช", 40, 280, w=300),
    tok("วันเสาร์ที่ 5 ธันวาคม 2569 วันพ่อแห่งชาติ", 40, 300, w=300),
]


class FindDatesTest(unittest.TestCase):
    def test_unicode_hyphens(self):
        for dash in ("­", "‐", "−", "–"):
            m = find_dates(f"17 {dash} 21 ส.ค. 2569", AY)
            self.assertEqual([(x.start, x.end) for x in m], [(date(2026, 8, 17), date(2026, 8, 21))], repr(dash))

    def test_date_left_aligned_under_header_is_not_label(self):
        tokens = [
            tok("รายการ", 40, 60, w=60), tok("ภาคการศึกษาต้น", 290, 60, w=62),
            tok("ภาคการศึกษาปลาย", 410, 60, w=72),
            tok("วันเปิดภาคการศึกษา", 40, 80, w=75), tok("22 มิ.ย. 2569", 290, 80, w=51),
            tok("9 พ.ย. 2569", 410, 80, w=47),
        ]
        got = [(e.name, e.semester, e.start_date) for e in parse_calendar(tokens, AY)]
        self.assertEqual(got, [("วันเปิดภาคการศึกษา", "1", date(2026, 6, 22)),
                               ("วันเปิดภาคการศึกษา", "2", date(2026, 11, 9))])

    def test_single_and_ranges(self):
        self.assertEqual([(m.start, m.end) for m in find_dates("22 มิ.ย. 2569", AY)],
                         [(date(2026, 6, 22), date(2026, 6, 22))])
        self.assertEqual([(m.start, m.end) for m in find_dates("15 - 19 มิ.ย. 2569", AY)],
                         [(date(2026, 6, 15), date(2026, 6, 19))])
        self.assertEqual([(m.start, m.end) for m in find_dates("29 มิ.ย. – 3 ก.ค. 2569", AY)],
                         [(date(2026, 6, 29), date(2026, 7, 3))])

    def test_year_rollover_and_short_years(self):
        m = find_dates("30 ธ.ค. 69 - 2 ม.ค. 70", AY)[0]
        self.assertEqual((m.start, m.end), (date(2026, 12, 30), date(2027, 1, 2)))
        m = find_dates("30 ธ.ค. - 2 ม.ค. 2570", AY)[0]
        self.assertEqual(m.start, date(2026, 12, 30))

    def test_missing_year_uses_academic_year(self):
        self.assertEqual(find_dates("10 ส.ค.", AY)[0].start, date(2026, 8, 10))
        self.assertEqual(find_dates("10 ก.พ.", AY)[0].start, date(2027, 2, 10))
        self.assertEqual(find_dates("1 มิ.ย.", AY, "S")[0].start, date(2027, 6, 1))

    def test_thai_digits_full_month_and_ce(self):
        self.assertEqual(find_dates("๑๕ มกราคม ๒๕๗๐", AY)[0].start, date(2027, 1, 15))
        self.assertEqual(find_dates("5 December 2026 5 ธ.ค. 2026", AY)[0].start, date(2026, 12, 5))

    def test_year_digits_are_not_days(self):
        m = find_dates("2569 - 3 ก.ค. 2569", AY)
        self.assertEqual([(x.start, x.end) for x in m], [(date(2026, 7, 3), date(2026, 7, 3))])

    def test_invalid_date_ignored(self):
        self.assertEqual(find_dates("31 ก.พ. 2570", AY), [])


class ClassifyTest(unittest.TestCase):
    def test_types(self):
        self.assertEqual(classify("สอบกลางภาค"), ("no_class", True))
        self.assertEqual(classify("งดการเรียนการสอน"), ("no_class", True))
        self.assertEqual(classify("วันหยุดมหาวิทยาลัย (วันศิลป์ พีระศรี)"), ("university_holiday", True))
        self.assertEqual(classify("วันปิยมหาราช"), ("public_holiday", True))
        self.assertEqual(classify("ลงทะเบียนเรียน"), (None, False))

    def test_false_positives(self):
        # A makeup teaching day is a working day, even when it names the holiday.
        self.assertEqual(classify("วันสอนชดเชย เนื่องจากหยุดวันแม่แห่งชาติ"), (None, False))
        self.assertEqual(classify("วันสอนชดเชย เนื่องจากหยุดวันสอบกลางภาค"), (None, False))
        self.assertEqual(classify("ประกาศผลสอบประจำภาค"), (None, False))
        self.assertEqual(classify("มีค่าปรับวันละ 50 บาท รวมวันหยุด"), (None, False))
        self.assertEqual(classify("หยุดชดเชยวันมาฆบูชา"), ("public_holiday", True))


class ParseCalendarTest(unittest.TestCase):
    def setUp(self):
        self.entries = parse_calendar(TABLE, AY)

    def find(self, name, semester):
        hits = [e for e in self.entries if e.name == name and e.semester == semester]
        self.assertEqual(len(hits), 1, f"{name}/{semester}: {[(e.name, e.semester) for e in self.entries]}")
        return hits[0]

    def test_columns_assign_semesters(self):
        self.assertEqual(self.find("ลงทะเบียนเรียน", "1").start_date, date(2026, 6, 15))
        self.assertEqual(self.find("ลงทะเบียนเรียน", "2").start_date, date(2026, 11, 2))
        self.assertEqual(self.find("ลงทะเบียนเรียน", "S").end_date, date(2027, 4, 8))
        final_s = self.find("สอบปลายภาค", "S")
        self.assertEqual((final_s.start_date, final_s.end_date), (date(2027, 6, 1), date(2027, 6, 3)))
        self.assertEqual(final_s.date_type, "no_class")

    def test_activities_not_included(self):
        e = self.find("วันเปิดภาคการศึกษา", "1")
        self.assertIsNone(e.date_type)
        self.assertFalse(e.include)

    def test_wrapped_label(self):
        e = self.find("งดการเรียนการสอนเพื่อ กิจกรรมกีฬามหาวิทยาลัย", "2")
        self.assertEqual(e.start_date, date(2027, 1, 15))
        self.assertEqual(e.date_type, "no_class")

    def test_cross_year_range_in_column(self):
        e = self.find("ปิดภาคการศึกษา", "2")
        self.assertEqual((e.start_date, e.end_date), (date(2026, 12, 30), date(2027, 1, 2)))

    def test_prose_holiday_list(self):
        e = self.find("วันปิยมหาราช", "1")
        self.assertEqual((e.start_date, e.date_type, e.include), (date(2026, 10, 23), "public_holiday", True))
        e = self.find("วันพ่อแห่งชาติ", "2")
        self.assertEqual(e.start_date, date(2026, 12, 5))

    def test_detect_year(self):
        self.assertEqual(detect_academic_year(TABLE), 2569)

    def test_date_column_layout_with_sections(self):
        # Date on the left, activity on the right, a heading per semester,
        # wrapped lines under an entry, a month divider and a notes paragraph.
        lines = [
            tok("ประกาศ ปฏิทินการศึกษา ปีการศึกษา 2569", 200, 10, w=260),
            tok("ภาคการศึกษาต้น", 60, 40, w=90),
            tok("สิงหาคม 2569", 60, 60, w=70),
            tok("จ.3 ส.ค. 2569", 60, 80, w=80), tok("วันเปิดภาคการศึกษา", 200, 80, w=200),
            tok("จ.28 ก.ย. - ศ.2 ต.ค. 2569", 60, 100, w=120), tok("สอบกลางภาค", 200, 100, w=200),
            tok("(ทุกชั้นปี)", 200, 114, w=80),
            tok("ภาคการศึกษาปลาย", 60, 140, w=90),
            tok("พ.3 มี.ค. 2570", 60, 160, w=80), tok("งดการเรียนการสอน", 200, 160, w=200),
            tok("หมายเหตุ ปฏิทินนี้อาจเปลี่ยนแปลงได้", 60, 190, w=300),
            tok("ตามประกาศของมหาวิทยาลัย", 60, 204, w=200),
            tok("ลำดับ กำหนด ชื่อวันหยุด", 60, 240, w=200),
            tok("ศ.23 ต.ค. 2569", 60, 260, w=80), tok("วันปิยมหาราช", 200, 260, w=200),
            tok("ศ.1 ต.ค. 2570", 60, 280, w=80), tok("วันลงทะเบียน ปีการศึกษา 2570", 200, 280, w=200),
        ]
        got = [(e.name, e.semester, e.start_date, e.end_date) for e in parse_calendar(lines, AY)]
        self.assertEqual(got, [
            ("วันเปิดภาคการศึกษา", "1", date(2026, 8, 3), date(2026, 8, 3)),
            ("สอบกลางภาค (ทุกชั้นปี)", "1", date(2026, 9, 28), date(2026, 10, 2)),
            ("วันปิยมหาราช", "1", date(2026, 10, 23), date(2026, 10, 23)),
            ("งดการเรียนการสอน", "2", date(2027, 3, 3), date(2027, 3, 3)),
        ])

    def test_no_header_falls_back_to_month(self):
        entries = parse_calendar([tok("13 ต.ค. 2569 วันนวมินทรมหาราช", 40, 40, w=300),
                                  tok("6 เม.ย. 2570 วันจักรี", 40, 60, w=300),
                                  tok("13 พ.ค. 2570 วันพืชมงคล", 40, 80, w=300)], AY)
        self.assertEqual([(e.name, e.semester) for e in entries],
                         [("วันนวมินทรมหาราช", "1"), ("วันจักรี", "2"), ("วันพืชมงคล", "S")])


def ocr_cell(text, xc, y, w):
    """An OCR box centred on xc, like EasyOCR returns for centred table cells."""
    return tok(text, xc - w / 2, y, w=w, h=30)


class ScannedSilpakornCalendarTest(unittest.TestCase):
    """Token layout EasyOCR produced for the scanned Silpakorn ปฏิทินการศึกษา 2569
    (ภาคต้น / ภาคปลาย / ภาคพิเศษฤดูร้อน columns centred at ~816/1099/1367)."""

    TOKENS = [
        ocr_cell("ภาคต้น", 816, 100, 80), ocr_cell("ภาคปลาย", 1099, 100, 95),
        ocr_cell("ภาคพิเศษฤดูร้อน", 1367, 100, 190),
        # A cell that mentions terms must not be read as a new header row.
        ocr_cell("ที่ไม่สมบูรณ์ (|) ของนักศึกษา", 356, 160, 300), ocr_cell("(แก้ xภาคการศึกษาปลาย", 804, 160, 230),
        ocr_cell("ภาคการศึกษาต้น", 1120, 160, 170), ocr_cell("ต้น ปีการศึกษา 2570", 1357, 160, 220),
        ocr_cell("15.", 184, 220, 30), ocr_cell("วันศิลป์ พีระศรี", 301, 220, 170),
        ocr_cell("อังคาร 15 ก.ย. 69", 814, 220, 200),
        ocr_cell("16.", 185, 260, 30), ocr_cell("วันสถาปนามหาวิทยาลัยศิลปากร", 386, 260, 340),
        ocr_cell("จันทร์ 12 ต.ค. 69", 814, 260, 200),
        ocr_cell("17.", 185, 300, 30), ocr_cell("วันหม่อมหลวงปืน ฺมาลากุล", 350, 300, 280),
        ocr_cell("เสาร์ 24 ต.ค. 69", 814, 300, 200),
        ocr_cell("19.", 186, 340, 30), ocr_cell("วันเริมสอบประจำภาค", 337, 340, 230),
        ocr_cell("จันทร์ 26 ต.ค. 69", 815, 340, 200), ocr_cell("จันทร์ 22 มี.ค.70", 1101, 340, 200),
        ocr_cell("จันทร์ 14 มึ.ย.70", 1368, 340, 200),
        # One cell split in two by OCR.
        ocr_cell("20.", 175, 380, 30), ocr_cell("วันสุดท้ายของการสอบ", 330, 380, 260),
        ocr_cell("เสาร์ 7", 757, 380, 80), ocr_cell("พ.ย. 69", 847, 380, 80),
        ocr_cell("22.", 173, 420, 30), ocr_cell("วันมหาธีรราชเจ้า", 302, 420, 190),
        ocr_cell("พธ 25 พ.ย. 69", 806, 420, 230),
    ]

    def setUp(self):
        self.entries = parse_calendar(self.TOKENS, AY)

    def test_holidays_land_in_the_first_semester(self):
        got = [(e.name, e.semester, e.start_date, e.date_type, e.include) for e in self.entries
               if e.date_type in ("public_holiday", "university_holiday")]
        self.assertEqual(got, [
            ("วันศิลป์ พีระศรี", "1", date(2026, 9, 15), "university_holiday", True),
            ("วันสถาปนามหาวิทยาลัยศิลปากร", "1", date(2026, 10, 12), "university_holiday", True),
            # Named days that do not say teaching stops are offered unticked.
            ("วันหม่อมหลวงปืน มาลากุล", "1", date(2026, 10, 24), "university_holiday", False),
            ("วันมหาธีรราชเจ้า", "1", date(2026, 11, 25), "university_holiday", False),
        ])

    def test_ocr_misreads_and_split_cells(self):
        exam = {e.semester: e.start_date for e in self.entries if e.name == "วันเริมสอบประจำภาค"}
        self.assertEqual(exam, {"1": date(2026, 10, 26), "2": date(2027, 3, 22), "S": date(2027, 6, 14)})
        last = [(e.semester, e.start_date) for e in self.entries if e.name == "วันสุดท้ายของการสอบ"]
        self.assertEqual(last, [("1", date(2026, 11, 7))])

    def test_named_day_rule_skips_activities(self):
        self.assertEqual(classify("วันเปิดเรียน"), (None, False))
        self.assertEqual(classify("วันสุดท้ายของการยื่นคำร้อง"), (None, False))
        self.assertEqual(classify("วันมหิดล (วันพิธีการ)"), ("university_holiday", False))


@unittest.skipUnless(os.environ.get("THAI_FONT"), "set THAI_FONT to a Thai .ttf to run")
class PdfRoundTripTest(unittest.TestCase):
    def test_text_layer(self):
        import fitz

        doc = fitz.open()
        page = doc.new_page(width=640, height=400)
        page.insert_font(fontname="th", fontfile=os.environ["THAI_FONT"])
        for t in TABLE:
            page.insert_text((t.x0, t.y1), t.text, fontname="th", fontsize=9)
        pdf = doc.tobytes()

        tokens = tokens_from_pdf(pdf)
        self.assertEqual(detect_academic_year(tokens), 2569)
        # The PDF text layer must give exactly what the positioned tokens give:
        # same names, semesters and full ranges (the hyphen comes back as a
        # soft hyphen, and short dates sit left-aligned under wide headers).
        from_pdf = [(e.name, e.semester, e.start_date, e.end_date) for e in parse_calendar(tokens, AY)]
        from_tokens = [(e.name, e.semester, e.start_date, e.end_date) for e in parse_calendar(TABLE, AY)]
        self.assertEqual(from_pdf, from_tokens)
        self.assertIn(("สอบกลางภาค", "1", date(2026, 8, 17), date(2026, 8, 21)), from_pdf)
        self.assertIn(("วันเปิดภาคการศึกษา", "1", date(2026, 6, 22), date(2026, 6, 22)), from_pdf)


if __name__ == "__main__":
    unittest.main()

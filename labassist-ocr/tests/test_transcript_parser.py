"""Run from labassist-ocr/: python tests/test_transcript_parser.py"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.processor import clean_code_text, normalize_grade, parse_transcript  # noqa: E402


def tok(text, x, y, w=None, h=40, conf=0.9):
    """An EasyOCR-style (box, text, confidence) tuple; width defaults to ~22px per char."""
    w = w if w is not None else max(30, 22 * len(text))
    return ([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], text, conf)


HEADER = [tok('รหัสวิชา', 100, 50), tok('ชื่อวิชา', 400, 50), tok('หน่วยกิต', 1800, 50), tok('เกรด', 2200, 50, w=80)]


def reader(cells):
    """A fake read_region: returns cells[row_y] for the row whose vertical centre falls inside the region."""
    def read(region, allowlist):
        _x_min, _x_max, y_min, y_max = region
        for row_y, result in cells.items():
            if y_min <= row_y + 20 <= y_max:
                return result
        return '', 0.0, 0.0
    return read


class NormalizeTest(unittest.TestCase):
    def test_trailing_dot_is_cell_noise_not_plus(self):
        # A plain "D" is read as "d." — it used to be turned into "D+"
        self.assertEqual(normalize_grade('d.'), 'D')
        self.assertEqual(normalize_grade(' c+ '), 'C+')

    def test_digits_are_not_guessed_as_grades(self):
        # "0" in the credits column and "8" in the grade points column are not grades
        self.assertEqual(normalize_grade('o'), 'O')
        self.assertEqual(normalize_grade('8'), '8')

    def test_code_cleanup(self):
        self.assertEqual(clean_code_text('su101'), 'SU101')
        self.assertEqual(clean_code_text('SU102-162'), 'SU102')
        self.assertEqual(clean_code_text('520321-165'), '520321')
        self.assertEqual(clean_code_text('SU4O1'), 'SU401')
        self.assertEqual(clean_code_text('|515105'), '515105')


class ParseTranscriptTest(unittest.TestCase):
    def test_detector_only(self):
        page = HEADER + [
            tok('su101', 100, 200), tok('ศิลปะศิลปากร', 400, 200), tok('3', 1820, 200), tok('a', 2230, 200),
            tok('517121', 100, 300), tok('ทักษะการเขียนโปรแกรม', 400, 300), tok(' o', 1820, 300), tok('w.', 2230, 300),
            tok('520361', 100, 400), tok('การวิเคราะห์', 400, 400), tok('3', 1820, 400), tok('d.', 2230, 400),
        ]
        grades, _confidence = parse_transcript(page, {'SU101', '517121', '520361'})
        # 517121 was withdrawn (W): its "0" credits must not become a "D"
        self.assertEqual(grades, {'SU101': 'A', '520361': 'D'})

    def test_second_pass_reads_grades_the_detector_missed(self):
        page = HEADER + [
            tok('517122', 100, 200), tok('ทักษะการเขียนโปรแกรม 2', 400, 200), tok('4', 1820, 200),
            tok('520343', 100, 300), tok('เว็บเซอร์วิส', 400, 300), tok('2', 1820, 300),
        ]
        read = reader({200: ('C', 0.95, 0.8), 300: ('B', 0.99, 1.2)})
        grades, _confidence = parse_transcript(page, {'517122', '520343'}, read)
        # 520343's ink is too wide for a lone "B": the "+" was too small to read
        self.assertEqual(grades, {'517122': 'C', '520343': 'B+'})

    def test_inferred_plus_lowers_confidence(self):
        page = HEADER + [tok('520343', 100, 300), tok('เว็บเซอร์วิส', 400, 300)]
        _grades, confidence = parse_transcript(page, {'520343'}, reader({300: ('B', 0.99, 1.2)}))
        self.assertLessEqual(confidence, 0.6)

    def test_each_table_uses_its_own_grade_header(self):
        # Two semesters in one screenshot whose grade columns don't line up
        page = [
            tok('เกรด', 2600, 50, w=80), tok('520251', 100, 200),
            tok('เกรด', 2400, 500, w=80), tok('520231', 100, 650),
        ]
        regions = []

        def read(region, allowlist):
            regions.append(region)
            return 'D', 0.99, 0.8

        parse_transcript(page, {'520251', '520231'}, read)
        centres = [(r[0] + r[1]) / 2 for r in regions]
        self.assertEqual(centres, [2640, 2440])


if __name__ == '__main__':
    unittest.main()

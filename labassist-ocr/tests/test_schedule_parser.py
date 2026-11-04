"""Run from labassist-ocr/: python tests/test_schedule_parser.py

Boxes are built by hand (the OCR engine is not needed): each entry is
(bbox, text, confidence) with bbox the four corners, clockwise from top-left.
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.schedule_parser import _detect_day, parse_schedule  # noqa: E402


def box(cx: float, cy: float, text: str):
    half_w, half_h = 20, 8
    corners = [
        [cx - half_w, cy - half_h], [cx + half_w, cy - half_h],
        [cx + half_w, cy + half_h], [cx - half_w, cy + half_h],
    ]
    return (corners, text, 0.9)


class DetectDayTest(unittest.TestCase):
    def test_single_letter_inside_course_name_is_not_a_day(self):
        self.assertIsNone(_detect_day('วิทย์1 ไววิทย์พทธารี'))

    def test_whole_cell_day_names_are_detected(self):
        self.assertEqual(_detect_day('พุธ'), 'WED')
        self.assertEqual(_detect_day(' อาทิตย์'), 'SUN')
        self.assertEqual(_detect_day('Monday'), 'MON')

    def test_short_word_inside_other_text_is_not_a_day(self):
        self.assertIsNone(_detect_day('ตึกอาคาร'))


class RowDayLayoutTest(unittest.TestCase):
    def test_cells_with_their_own_start_and_end_times(self):
        ocr = [
            # Row labels down the left: MON, TUE, WED.
            box(138, 332, 'จันทร์'),
            box(146, 496, 'อังคาร'),
            box(122, 668, 'พุธ'),
            # Header row of start times and the row below it of end times.
            box(588, 197, '8:30'),
            box(704, 245, '12:05'),
            # Cell on MON: 08:30 - 12:05, printed as two labels on one line.
            box(588, 418, '08:30'),
            box(704, 417, '12:05'),
            # Cell on WED: 13:00 - 15:40.
            box(1554, 748, '13:00'),
            box(1666, 748, '15:40'),
        ]
        slots = parse_schedule(ocr)
        self.assertEqual(
            [(s.day, s.start_time, s.end_time) for s in slots],
            [('MON', '08:30', '12:05'), ('WED', '13:00', '15:40')],
        )

    def test_course_text_with_a_letter_does_not_hide_the_grid(self):
        ocr = [
            box(138, 332, 'จันทร์'),
            box(146, 496, 'อังคาร'),
            box(2377, 712, 'วิทย์1 ไววิทย์พทธารี'),
            box(588, 418, '08:30'),
            box(704, 417, '12:05'),
        ]
        slots = parse_schedule(ocr)
        self.assertEqual([(s.day, s.start_time, s.end_time) for s in slots], [('MON', '08:30', '12:05')])


if __name__ == '__main__':
    unittest.main()

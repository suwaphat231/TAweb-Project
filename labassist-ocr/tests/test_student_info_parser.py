"""Run from labassist-ocr/: python tests/test_student_info_parser.py"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.student_info_parser import extract_student_info  # noqa: E402


def tok(text, x, y, w=None, h=40, conf=0.9):
    """An EasyOCR-style (box, text, confidence) tuple; width defaults to ~22px per char."""
    w = w if w is not None else max(30, 22 * len(text))
    return ([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], text, conf)


# Token positions as EasyOCR returned them for a real REG "ข้อมูลส่วนตัว"
# screenshot: two label/value columns per row, and "ชื่อ" read as "ชือ".
PERSONAL_PAGE = [
    tok('ข้อมูลส่วนตัว (personal information)', 26, 55),
    tok('ชือ', 274, 224, w=50), tok('สกุล (ไทย):', 365, 230, w=180),
    tok('นายสุวพัชร วัฒกีเจริญ', 697, 221, w=300),
    tok('ชื่อ', 1370, 224, w=50), tok(' สกุล (อังกฤษ):', 1461, 226, w=230),
    tok(' mr.suwaphat watthakicharoen', 1823, 225, w=420),
    tok('วัน/เดือน/ปเกิด:', 274, 377), tok('23 ธันวาคม 2547', 699, 375),
    tok('สัญชาติ:', 1370, 379), tok('ไทย', 1823, 378),
    tok('ศาสนา:', 276, 669), tok('พุทธ', 700, 668),
    tok('เบอร์โทรศัพท์:', 1371, 662), tok('0644535827', 1826, 662),
    tok('ทีอยู่ (ทะเบียนบ้าน):', 274, 943), tok('65 หม่ 5 สุราษฎร์ธานี 84160', 697, 937),
    tok(' เกรดเฉลี่ย:', 274, 1373), tok('2.34', 700, 1383),
]

STUDENT_PAGE = [
    tok('ข้อมูลนักศึกษา (Student Information)', 26, 55),
    tok('รหัสนักศึกษา:', 274, 220), tok('66O710260', 697, 220),
    tok('ระดับการศึกษา:', 1370, 220), tok('ปริญญาตรี', 1823, 220),
    tok('คณะ:', 274, 320), tok('วิทยาศาสตร์', 697, 320),
    tok('ภาควิชา:', 1370, 320), tok('คอมพิวเตอร์', 1823, 320),
    tok('หลักสูตร:', 274, 420), tok('วท.บ. เทคโนโลยีสารสนเทศ', 697, 420),
    tok('วิทยาเขต:', 1370, 420), tok('พระราชวังสนามจันทร์', 1823, 420),
    tok('สถานภาพ: ปกติ', 274, 520),
    tok('อาจารย์ที่ปรึกษา:', 1370, 520), tok('ผศ.ดร.สมชาย ใจดี', 1823, 520),
]

# Token positions as EasyOCR returned them for a real REG "ข้อมูลนักศึกษา"
# screenshot: the header line also says "แก้ไขข้อมูลส่วนตัว", there is no
# ภาควิชา row, and "ชื่อปริญญา" is not a person's name.
REAL_STUDENT_PAGE = [
    tok('ข้อมูลนักศึกษา (student information)', 37, 50, w=700),
    tok('แก้ไขข้อมูลส่วนตัว ล่าสุดวันที่ 2 กรกฎาคม 2569', 3342, 52, w=900),
    tok('รหัสนักศึกษา:', 339, 254), tok('660710260', 927, 259),
    tok('วิธีรับเข้า:', 2673, 259), tok(' โควตา', 3334, 254),
    tok(' หลักสูตร:', 337, 429), tok('107090000650 เทคโนโลยีสารสนเทศ (โครงการวิจัย)', 925, 424, w=900),
    tok(' สถานภาพนักศึกษา:', 2667, 424), tok('นักศึกษาปจจุบัน สถานะปกติ', 3332, 420),
    tok('วิชาโท:', 340, 604), tok('ปการศึกษาทีเข้า:', 2669, 599), tok('2566/1', 3335, 604),
    tok('คณะ:', 341, 786), tok('วิทยาศาสตร์', 926, 773),
    tok('วันที่เริ่มศึกษา:', 2671, 765), tok('13 มิถุนายน 2566', 3333, 771),
    tok('วิทยาเขต:', 340, 949), tok('พระราชวังสนามจันทร์', 926, 944),
    tok('ระดับการศึกษา:', 339, 1118), tok(' ปริญญาตรี', 925, 1113),
    tok(' อาจารย์ที่ปรึกษา:', 339, 1285), tok('รองศาสตราจารย์ ดร.ปานใจ ธารทัศนวงศ์', 923, 1289, w=700),
    tok('ชื่อปริญญา:', 335, 1452), tok('วิทยาศาสตรบัณฑิต(เทคโนโลยีสารสนเทศ)', 925, 1456, w=700),
]


class RealStudentPageTest(unittest.TestCase):
    def setUp(self):
        self.fields, _, self.kind = extract_student_info(REAL_STUDENT_PAGE)

    def test_page_kind_ignores_edit_note(self):
        self.assertEqual(self.kind, 'student')

    def test_fields(self):
        self.assertEqual(self.fields['student_id'], '660710260')
        self.assertEqual(self.fields['student_status'], 'นักศึกษาปจจุบัน สถานะปกติ')
        self.assertEqual(self.fields['campus'], 'พระราชวังสนามจันทร์')
        self.assertEqual(self.fields['education_level'], 'ปริญญาตรี')

    def test_programme_comes_from_curriculum_not_faculty(self):
        self.assertEqual(self.fields['faculty'], 'เทคโนโลยีสารสนเทศ')

    def test_degree_name_is_not_a_person(self):
        self.assertIsNone(self.fields['full_name_th'])


class PersonalPageTest(unittest.TestCase):
    def setUp(self):
        self.fields, _, self.kind = extract_student_info(PERSONAL_PAGE)

    def test_names_stay_in_their_own_column(self):
        self.assertEqual(self.fields['full_name_th'], 'นายสุวพัชร วัฒกีเจริญ')
        self.assertEqual(self.fields['full_name_en'], 'Mr.Suwaphat Watthakicharoen')

    def test_page_kind(self):
        self.assertEqual(self.kind, 'personal')

    def test_sensitive_values_not_returned(self):
        values = ' '.join(v for v in self.fields.values() if v)
        for secret in ('0644535827', '2547', 'พุทธ', '84160', '2.34'):
            self.assertNotIn(secret, values)
        self.assertIsNone(self.fields['student_id'])


class StudentPageTest(unittest.TestCase):
    def setUp(self):
        self.fields, _, self.kind = extract_student_info(STUDENT_PAGE)

    def test_fields(self):
        self.assertEqual(self.fields['student_id'], '660710260')
        self.assertEqual(self.fields['education_level'], 'ปริญญาตรี')
        self.assertEqual(self.fields['faculty'], 'คอมพิวเตอร์')  # ภาควิชา beats คณะ
        self.assertEqual(self.fields['curriculum'], 'วท.บ. เทคโนโลยีสารสนเทศ')
        self.assertEqual(self.fields['campus'], 'พระราชวังสนามจันทร์')
        self.assertEqual(self.fields['student_status'], 'ปกติ')

    def test_advisor_is_not_the_student(self):
        self.assertIsNone(self.fields['full_name_th'])

    def test_page_kind(self):
        self.assertEqual(self.kind, 'student')


if __name__ == '__main__':
    unittest.main()

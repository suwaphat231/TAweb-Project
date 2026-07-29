import re

SUBJECT_CODE_PATTERN = re.compile(r'^(\d{6,8}|[A-Za-z]{2,4}\d{3,4})$')

def is_subject_code(text: str) -> bool:
    """
    ตรวจสอบว่าข้อความตรงกับรูปแบบรหัสวิชาหรือไม่
    รองรับทั้งรหัสตัวเลขล้วน (6-8 หลัก) และรหัสที่มีตัวอักษรนำหน้า เช่น SU201 (วิชาศึกษาทั่วไป)
    รองรับ noise จาก OCR เช่น จุด ขีด ช่องว่าง ที่ติดมา
    """
    cleaned = re.sub(r'[\s\-\.\,\/]', '', text)
    return bool(SUBJECT_CODE_PATTERN.match(cleaned))

def is_same_line(box1: list, box2: list, y_tolerance: int = 15) -> bool:
    """
    ตรวจสอบว่า Bounding box 2 อันอยู่ในบรรทัดเดียวกันหรือไม่ (แกน Y ใกล้เคียงกัน)
    
    รูปแบบ box ของ EasyOCR: [[x_top_left, y_top_left], [x_top_right, y_top_right], 
                            [x_bottom_right, y_bottom_right], [x_bottom_left, y_bottom_left]]
    """
    # คำนวณหาจุดกึ่งกลางแกน Y ของแต่ละกล่องข้อความ
    y1_center = (box1[0][1] + box1[2][1]) / 2
    y2_center = (box2[0][1] + box2[2][1]) / 2
    
    # ถ้าระยะห่างของจุดกึ่งกลางน้อยกว่าค่า y_tolerance ให้ถือว่าอยู่บรรทัดเดียวกัน
    return abs(y1_center - y2_center) <= y_tolerance

def sort_by_x_axis(line_items: list) -> list:
    """
    เรียงลำดับรายการข้อความในบรรทัดเดียวกัน จากซ้ายไปขวา (ตามแกน X)
    line_items คือ list ของผลลัพธ์จาก EasyOCR: (box, text, confidence)
    """
    # เรียงตามพิกัด X ของจุดบนซ้าย (box[0][0])
    return sorted(line_items, key=lambda item: item[0][0][0])

def group_into_lines(ocr_results: list, y_tolerance: int = 20) -> list:
    """
    จัดกลุ่มผลลัพธ์ EasyOCR ทั้งหน้าให้เป็น "บรรทัด" ตามตำแหน่งแกน Y
    เทียบกับ box แรกของแต่ละบรรทัดที่มีอยู่ (ไม่ใช่ item ก่อนหน้าตัวเดียว)
    เพื่อกันบรรทัดเลื่อนสะสมทีละนิดจนข้ามไปรวมกับบรรทัดถัดไป
    คืนค่าเป็น list ของบรรทัด โดยแต่ละบรรทัดเรียงจากซ้ายไปขวาแล้ว
    """
    lines = []  # each item: list of (box, text, confidence)

    for result in ocr_results:
        box = result[0]
        matched_line = None
        for line in lines:
            if is_same_line(box, line[0][0], y_tolerance):
                matched_line = line
                break
        if matched_line is None:
            lines.append([result])
        else:
            matched_line.append(result)

    # เรียงบรรทัดจากบนลงล่าง แล้วเรียงข้อความในแต่ละบรรทัดจากซ้ายไปขวา
    lines.sort(key=lambda line: line[0][0][0][1])
    return [sort_by_x_axis(line) for line in lines]
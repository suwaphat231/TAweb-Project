import cv2
import easyocr
import numpy as np

# โหลด Model ภาษาไทยและอังกฤษ รอไว้เลย
print("Loading EasyOCR Models...")
reader = easyocr.Reader(['en', 'th'])
# โมเดลภาษาไทยของ EasyOCR รู้จักอักษรอังกฤษแค่ตัวพิมพ์เล็ก ("SU102" ถูกอ่านเป็น
# "su102" หรือ "sū102") จึงใช้โมเดลอังกฤษล้วนอ่านช่องที่เป็นรหัสวิชา/เกรดซ้ำอีกรอบ
latin_reader = easyocr.Reader(['en'])
print("EasyOCR Models Loaded.")

def extract_text(processed_image):
    # คืนค่าเป็น List ของ Tuple: (bounding_box, text, confidence)
    results = reader.readtext(processed_image)
    return results

# ภาพ screenshot ที่ย่อทั้งหน้ามีตัวอักษรเล็กมาก (สูง ~13px) แม้ preprocessor ขยายแล้วก็ยังเล็ก
# เกินกว่าจะอ่านแม่น — ถ้าความสูงข้อความโดยเฉลี่ยต่ำกว่าค่านี้ ขยายภาพแล้วอ่านใหม่อีกรอบ
MIN_TEXT_HEIGHT = 36
TARGET_TEXT_HEIGHT = 50
MAX_RESCALE = 3.0

def text_rescale_factor(ocr_results) -> float:
    """อัตราขยายที่ทำให้ข้อความสูงประมาณ TARGET_TEXT_HEIGHT หรือ 1.0 ถ้าใหญ่พออยู่แล้ว"""
    heights = sorted(box[2][1] - box[0][1] for box, _text, _conf in ocr_results)
    if not heights:
        return 1.0
    median = heights[len(heights) // 2]
    if median <= 0 or median >= MIN_TEXT_HEIGHT:
        return 1.0
    return min(TARGET_TEXT_HEIGHT / median, MAX_RESCALE)

def rescale(processed_image, factor):
    if factor == 1.0:
        return processed_image
    return cv2.resize(processed_image, None, fx=factor, fy=factor, interpolation=cv2.INTER_CUBIC)

def extract_text_scaled(processed_image):
    """เหมือน extract_text แต่ขยายภาพแล้วอ่านใหม่ถ้าตัวอักษรเล็กเกินไป
    คืน (ภาพที่ใช้อ่านจริง, ผล OCR) — พิกัดในผล OCR อ้างอิงภาพที่คืนไป"""
    results = extract_text(processed_image)
    factor = text_rescale_factor(results)
    if factor == 1.0:
        return processed_image, results
    scaled = rescale(processed_image, factor)
    return scaled, extract_text(scaled)

def _ink_span(gray_crop):
    """หาช่วงแกน X ของกลุ่มตัวอักษรที่อยู่ใกล้กลางกรอบที่สุด คืน (x_start, x_end, ความสูงหมึก) หรือ None

    กรอบที่กว้างเกินจะติดตัวเลขของคอลัมน์ข้าง ๆ (อ่าน "D" เป็น "CD") ส่วนกรอบที่แคบเกิน
    จะตัด "+" ทิ้ง — จึงตัดให้พอดีกับหมึกจริงแทนการเดาความกว้าง
    """
    _, ink = cv2.threshold(gray_crop, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    # ถ้าหมึกกินพื้นที่เกินครึ่ง แปลว่าเป็นพื้นเข้ม/ตัวอักษรขาว ไม่ใช่หมึก
    if ink.mean() > 127:
        ink = 255 - ink
    columns = np.flatnonzero(ink.sum(axis=0) > 0)
    if columns.size == 0:
        return None
    # ช่องว่างที่กว้างกว่าครึ่งความสูงกรอบถือว่าแยกเป็นคนละกลุ่ม ("C" กับ "+" ห่างกันน้อยกว่านั้น)
    max_gap = gray_crop.shape[0] * 0.5
    spans = []
    start = prev = columns[0]
    for x in columns[1:]:
        if x - prev > max_gap:
            spans.append((start, prev + 1))
            start = x
        prev = x
    spans.append((start, prev + 1))
    center = gray_crop.shape[1] / 2
    start, end = min(spans, key=lambda s: 0 if s[0] <= center <= s[1] else min(abs(s[0] - center), abs(s[1] - center)))
    rows = np.flatnonzero(ink[:, start:end].sum(axis=1) > 0)
    return start, end, rows[-1] - rows[0] + 1


def read_latin(processed_image, region, allowlist):
    """อ่านข้อความในกรอบ region = (x_min, x_max, y_min, y_max) ด้วยโมเดลอังกฤษ
    โดยไม่ผ่าน detector — detector มักมองไม่เห็นเกรดที่เป็นตัวอักษรตัวเดียว เช่น "C"

    คืนค่า (text, confidence, ink_aspect) — ink_aspect คืออัตรากว้าง/สูงของหมึกที่อ่าน
    ใช้แยก "B" กับ "B+" ในภาพตัวเล็กที่โมเดลมองไม่เห็น "+" — หรือ ("", 0.0, 0.0) ถ้าอ่านไม่ได้
    """
    height, width = processed_image.shape[:2]
    x_min, x_max, y_min, y_max = region
    box = [max(0, int(x_min)), min(width, int(x_max)), max(0, int(y_min)), min(height, int(y_max))]
    if box[0] >= box[1] or box[2] >= box[3]:
        return "", 0.0, 0.0
    span = _ink_span(processed_image[box[2]:box[3], box[0]:box[1]])
    if span is None:
        return "", 0.0, 0.0
    ink_aspect = (span[1] - span[0]) / span[2]
    pad = (box[3] - box[2]) * 0.3
    box[0], box[1] = max(0, int(box[0] + span[0] - pad)), min(width, int(box[0] + span[1] + pad))
    results = latin_reader.recognize(
        processed_image, horizontal_list=[box], free_list=[], allowlist=allowlist, detail=1,
    )
    if not results:
        return "", 0.0, ink_aspect
    _box, text, confidence = results[0]
    return text.strip(), float(confidence), ink_aspect

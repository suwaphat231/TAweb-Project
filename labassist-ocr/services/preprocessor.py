import cv2
import fitz  # PyMuPDF
import numpy as np

PDF_MAGIC = b"%PDF"
MAX_PDF_PAGES = 20  # กันไฟล์ PDF ที่มีจำนวนหน้ามากผิดปกติทำให้ OCR ใช้เวลานานเกินไป

def _pdf_to_page_png_bytes(pdf_bytes: bytes, zoom: float = 2.0) -> list[bytes]:
    """แปลงทุกหน้า (สูงสุด MAX_PDF_PAGES หน้า) ของไฟล์ PDF เป็นรูปภาพ PNG (bytes) ที่ความละเอียดสูงพอสำหรับ OCR"""
    with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
        matrix = fitz.Matrix(zoom, zoom)
        return [page.get_pixmap(matrix=matrix).tobytes("png") for page in doc[:MAX_PDF_PAGES]]

def _bytes_to_processed_array(image_bytes: bytes) -> np.ndarray:
    # 1. แปลง bytes จากไฟล์อัปโหลดให้เป็น Numpy Array สำหรับ OpenCV
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None:
        raise ValueError("ไม่สามารถอ่านไฟล์เป็นรูปภาพได้ กรุณาตรวจสอบว่าไฟล์ที่อัปโหลดเป็นรูปภาพหรือ PDF ที่ถูกต้อง")

    # 2. แปลงเป็นขาวดำ (Grayscale)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # 3. ลด Noise ด้วย Gaussian Blur
    blur = cv2.GaussianBlur(gray, (5, 5), 0)

    # (Optional) หากภาพพื้นหลังเข้มไป สามารถปรับ Threshold เพิ่มได้
    # _, thresh = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    return blur

def preprocess_image(file_bytes: bytes) -> np.ndarray:
    """ประมวลผลไฟล์เป็นภาพเดียว ใช้สำหรับรูปภาพ หรือ PDF หน้าแรก (เช่น /debug-ocr)"""
    if file_bytes.lstrip()[:4] == PDF_MAGIC:
        file_bytes = _pdf_to_page_png_bytes(file_bytes)[0]
    return _bytes_to_processed_array(file_bytes)

def preprocess_pages(file_bytes: bytes) -> list[np.ndarray]:
    """ประมวลผลไฟล์เป็น list ของภาพต่อหน้า รองรับ PDF หลายหน้า (ทรานสคริปต์จริงมักมีหลายหน้า) และรูปภาพหน้าเดียว"""
    if file_bytes.lstrip()[:4] == PDF_MAGIC:
        return [_bytes_to_processed_array(page_bytes) for page_bytes in _pdf_to_page_png_bytes(file_bytes)]
    return [_bytes_to_processed_array(file_bytes)]

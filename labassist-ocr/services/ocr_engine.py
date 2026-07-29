import easyocr

# โหลด Model ภาษาไทยและอังกฤษ รอไว้เลย
print("Loading EasyOCR Models...")
reader = easyocr.Reader(['en', 'th'])
print("EasyOCR Models Loaded.")

def extract_text(processed_image):
    # คืนค่าเป็น List ของ Tuple: (bounding_box, text, confidence)
    results = reader.readtext(processed_image)
    return results
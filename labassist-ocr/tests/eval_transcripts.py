"""วัดความแม่นยำของการอ่านเกรดจากใบเกรดตัวอย่างเทียบกับเฉลย

รันใน container OCR (โค้ดถูก mount ไว้ที่ /app):
    docker exec -w /app labassist-ocr python -m tests.eval_transcripts
    docker exec -w /app labassist-ocr python -m tests.eval_transcripts --cached   # ใช้ผล OCR ดิบที่เก็บไว้ ทดสอบเฉพาะ parser

ผล OCR ดิบของแต่ละไฟล์ถูกเก็บไว้ใน test-ocr-grade/.ocr-cache/ เพราะ EasyOCR ช้า
แก้แค่ parser แล้วรันด้วย --cached จะข้ามขั้น detect ทั้งหน้า (ต้องรันใหม่ถ้าแก้ preprocessor)
"""
import argparse
import json
import time
from functools import partial
from pathlib import Path

from services.ocr_engine import extract_text_scaled, read_latin, rescale
from services.preprocessor import preprocess_pages
from services.processor import parse_transcript

SAMPLES_DIR = Path(__file__).resolve().parent.parent / "test-ocr-grade"
CACHE_DIR = SAMPLES_DIR / ".ocr-cache"


def ocr_pages(sample: Path, use_cache: bool) -> list:
    """คืน [(ภาพที่ preprocess แล้ว, ผล OCR ดิบ [(box, text, confidence), ...]), ...] รายหน้า"""
    images = preprocess_pages(sample.read_bytes(), denoise=False)
    cache_file = CACHE_DIR / (sample.name + ".json")
    if use_cache and cache_file.exists():
        cached = json.loads(cache_file.read_text(encoding="utf-8"))
        return [(rescale(img, page["scale"]), page["results"]) for img, page in zip(images, cached)]

    pages, cached = [], []
    for img in images:
        scaled, results = extract_text_scaled(img)
        results = [([[float(x), float(y)] for x, y in box], text, float(conf)) for box, text, conf in results]
        pages.append((scaled, results))
        cached.append({"scale": scaled.shape[1] / img.shape[1], "results": results})
    CACHE_DIR.mkdir(exist_ok=True)
    cache_file.write_text(json.dumps(cached, ensure_ascii=False), encoding="utf-8")
    return pages


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cached", action="store_true", help="ใช้ผล OCR ดิบที่เก็บไว้แทนการรัน OCR ใหม่")
    parser.add_argument("--no-known-codes", action="store_true", help="ไม่กรองรหัสวิชาด้วยรายชื่อวิชาที่รู้จัก")
    parser.add_argument("--no-second-pass", action="store_true", help="ไม่อ่านช่องรหัสวิชา/เกรดซ้ำด้วยโมเดลอังกฤษ")
    args = parser.parse_args()

    labels = json.loads((SAMPLES_DIR / "labels.json").read_text(encoding="utf-8"))
    labels.pop("_note", None)
    # จำลองรายชื่อวิชาที่ backend ส่งมา: ทุกวิชาที่มีในเฉลย
    known_codes = None if args.no_known_codes else {code for expected in labels.values() for code in expected}

    total = correct = wrong = missing = extra = 0
    for name, expected in labels.items():
        started = time.time()
        grades = {}
        for image, page in ocr_pages(SAMPLES_DIR / name, args.cached):
            read_region = None if args.no_second_pass else partial(read_latin, image)
            page_grades, _confidence = parse_transcript(page, known_codes, read_region)
            grades.update(page_grades)
        elapsed = time.time() - started

        file_correct = sum(1 for code, grade in expected.items() if grades.get(code) == grade)
        file_wrong = {code: (grade, grades[code]) for code, grade in expected.items() if code in grades and grades[code] != grade}
        file_missing = [code for code in expected if code not in grades]
        file_extra = {code: grade for code, grade in grades.items() if code not in expected}

        total += len(expected)
        correct += file_correct
        wrong += len(file_wrong)
        missing += len(file_missing)
        extra += len(file_extra)

        print(f"{name}: {file_correct}/{len(expected)} ({elapsed:.1f}s)")
        for code, (want, got) in file_wrong.items():
            print(f"    ผิด  {code}: เฉลย {want} อ่านได้ {got}")
        if file_missing:
            print(f"    หาย  {', '.join(file_missing)}")
        if file_extra:
            print(f"    เกิน {file_extra}")

    print()
    print(f"ถูก {correct}/{total} = {correct / total:.1%}  |  ผิด {wrong}  หาย {missing}  เกิน {extra}")


if __name__ == "__main__":
    main()

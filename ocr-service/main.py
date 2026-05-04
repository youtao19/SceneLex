"""
SceneLex OCR service.

Receives images from the Node backend, runs PaddleOCR once per request, and
returns plain text plus per-line confidence scores.
"""

from __future__ import annotations

import os
import uuid
from asyncio import to_thread
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from paddleocr import PaddleOCR

app = FastAPI(title="SceneLex OCR Service")

UPLOAD_DIR = Path(os.getenv("OCR_UPLOAD_DIR", "uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def create_ocr_model() -> PaddleOCR:
    """
    Create the OCR model once at process startup because model loading is slow.
    """
    return PaddleOCR(
        text_detection_model_name=os.getenv("PADDLE_OCR_DET_MODEL", "PP-OCRv5_mobile_det"),
        text_recognition_model_name=os.getenv("PADDLE_OCR_REC_MODEL", "PP-OCRv5_mobile_rec"),
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
    )


ocr = create_ocr_model()


def as_list(value: Any) -> list[Any]:
    """
    Normalize PaddleOCR fields that may be Python lists or numpy arrays.
    """
    if value is None:
        return []

    if hasattr(value, "tolist"):
        return value.tolist()

    if isinstance(value, list):
        return value

    return list(value)


def read_page_result(page: Any) -> dict[str, Any]:
    """
    PaddleOCR 3.x returns result objects; older/debug paths may expose dicts.
    """
    if isinstance(page, dict):
        value = page.get("res", page)
        return value if isinstance(value, dict) else {}

    value = getattr(page, "res", None)
    if isinstance(value, dict):
        return value

    return {}


def extract_items(result: Any) -> list[dict[str, Any]]:
    """
    Convert PaddleOCR page results into the compact contract used by Node.
    """
    items: list[dict[str, Any]] = []

    for page in result:
        page_result = read_page_result(page)
        texts = as_list(page_result.get("rec_texts"))
        scores = as_list(page_result.get("rec_scores"))

        for index, text in enumerate(texts):
            clean_text = str(text).strip()

            if not clean_text:
                continue

            score = scores[index] if index < len(scores) else None
            items.append({
                "text": clean_text,
                "score": float(score) if score is not None else None,
            })

    return items


@app.get("/health")
async def health_check() -> dict[str, str]:
    """
    Return a tiny readiness signal for Node-side troubleshooting.
    """
    return {"status": "ok"}


@app.post("/ocr")
async def recognize_image(file: UploadFile = File(...)) -> dict[str, Any]:
    """
    Accept an uploaded image and return OCR text.
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="只支持图片文件")

    extension = Path(file.filename or "").suffix or ".png"
    image_path = UPLOAD_DIR / f"{uuid.uuid4().hex}{extension}"

    try:
        image_path.write_bytes(await file.read())
        # PaddleOCR inference is CPU-heavy; running it off the event loop keeps /health responsive.
        result = await to_thread(ocr.predict, input=str(image_path))
        items = extract_items(result)
        text = "\n".join(item["text"] for item in items)

        return {
            "text": text,
            "items": items,
        }
    finally:
        image_path.unlink(missing_ok=True)

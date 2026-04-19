"""
PaddleOCR-VL worker — invoked from Node.js via stdin/stdout JSON protocol.

Usage:
    python paddle_ocr_worker.py <image_path>

Stdout (one JSON object on the last line):
    {
      "text":        "<full plain-text concatenation>",
      "markdown":    "<markdown rendering, if available>",
      "confidence":  0..100,
      "words": [
        {"text": "...", "bbox": {"x0":..,"y0":..,"x1":..,"y1":..}, "confidence": 0..100}
      ],
      "engine": "paddleocr-vl",
      "version": "v1.5"
    }

Stderr is used for human-readable progress / errors.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import traceback
from typing import Any, Dict, List

# Skip the model-host reachability probe that PaddleX runs on every import —
# it can hang for 30+ seconds on networks where the hosters are unreachable.
os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _bbox_from_polygon(poly: Any) -> Dict[str, float]:
    """Convert a 4-point polygon [[x,y],...] into an axis-aligned bbox."""
    try:
        xs = [float(p[0]) for p in poly]
        ys = [float(p[1]) for p in poly]
        return {"x0": min(xs), "y0": min(ys), "x1": max(xs), "y1": max(ys)}
    except Exception:
        return {"x0": 0.0, "y0": 0.0, "x1": 0.0, "y1": 0.0}


def _extract_words(payload: Any) -> List[Dict[str, Any]]:
    """Best-effort extraction of word/line records from a PaddleOCR-VL result dict."""
    words: List[Dict[str, Any]] = []
    if not isinstance(payload, dict):
        return words

    # PaddleOCR-VL v1.5 layout-parsing structure:
    #   parsing_res_list[i] = {
    #     block_label, block_content, block_bbox: [x0,y0,x1,y1],
    #     block_polygon_points: [[x,y], ...], block_id, ...
    #   }
    blocks = payload.get("parsing_res_list")
    layout_boxes = (payload.get("layout_det_res") or {}).get("boxes") or []
    # Build a quick id→score map from layout_det_res when available
    score_by_order: Dict[int, float] = {}
    for b in layout_boxes:
        if isinstance(b, dict) and "order" in b and "score" in b:
            try:
                score_by_order[int(b["order"])] = float(b["score"])
            except Exception:
                pass

    if isinstance(blocks, list) and blocks:
        for blk in blocks:
            if not isinstance(blk, dict):
                continue
            text = blk.get("block_content") or blk.get("text") or blk.get("content") or ""
            if not text:
                continue
            poly = blk.get("block_polygon_points") or blk.get("polygon_points") or blk.get("polygon") or blk.get("poly")
            box = blk.get("block_bbox") or blk.get("bbox") or blk.get("box")
            if poly:
                bbox = _bbox_from_polygon(poly)
            elif isinstance(box, (list, tuple)) and len(box) >= 4:
                bbox = {
                    "x0": float(box[0]), "y0": float(box[1]),
                    "x1": float(box[2]), "y1": float(box[3]),
                }
            else:
                bbox = {"x0": 0.0, "y0": 0.0, "x1": 0.0, "y1": 0.0}
            order = blk.get("block_order")
            try:
                conf = score_by_order.get(int(order), 0.9) * 100.0
            except Exception:
                conf = 90.0
            words.append({"text": str(text), "bbox": bbox, "confidence": conf})
        return words

    # Legacy / flat layout (older PaddleOCR pipelines)
    texts = payload.get("rec_texts") or payload.get("texts")
    scores = payload.get("rec_scores") or payload.get("scores") or []
    polys = payload.get("rec_polys") or payload.get("dt_polys") or payload.get("polys") or []
    boxes = payload.get("rec_boxes") or payload.get("boxes") or []

    if isinstance(texts, list) and texts:
        for i, txt in enumerate(texts):
            poly = polys[i] if i < len(polys) else None
            if poly is not None:
                bbox = _bbox_from_polygon(poly)
            elif i < len(boxes):
                b = boxes[i]
                try:
                    bbox = {"x0": float(b[0]), "y0": float(b[1]), "x1": float(b[2]), "y1": float(b[3])}
                except Exception:
                    bbox = {"x0": 0.0, "y0": 0.0, "x1": 0.0, "y1": 0.0}
            else:
                bbox = {"x0": 0.0, "y0": 0.0, "x1": 0.0, "y1": 0.0}
            conf = _safe_float(scores[i] if i < len(scores) else 0.9) * 100.0
            words.append({"text": str(txt), "bbox": bbox, "confidence": conf})
    return words


def _extract_markdown(res: Any, save_dir: str) -> str:
    """Try the official save_to_markdown path, then fall back to res.markdown."""
    try:
        if hasattr(res, "save_to_markdown"):
            res.save_to_markdown(save_path=save_dir)
            for fname in os.listdir(save_dir):
                if fname.endswith(".md"):
                    with open(os.path.join(save_dir, fname), "r", encoding="utf-8") as fh:
                        return fh.read()
    except Exception as exc:
        print(f"[paddle_ocr_worker] markdown export failed: {exc}", file=sys.stderr)

    md = getattr(res, "markdown", None)
    if isinstance(md, str):
        return md
    if isinstance(md, dict):
        return md.get("markdown_texts") or md.get("text") or ""
    return ""


def run(image_path: str) -> Dict[str, Any]:
    try:
        from paddleocr import PaddleOCRVL  # type: ignore
    except Exception as exc:
        raise RuntimeError(
            "paddleocr is not installed. Run: pip install \"paddleocr>=3.2\" \"paddlepaddle>=3.0\""
        ) from exc

    print("[paddle_ocr_worker] initializing PaddleOCRVL pipeline_version=v1.5", file=sys.stderr)
    pipeline = PaddleOCRVL(pipeline_version="v1.5")

    print(f"[paddle_ocr_worker] predicting: {image_path}", file=sys.stderr)
    output = pipeline.predict(image_path)

    text_parts: List[str] = []
    markdown_parts: List[str] = []
    words: List[Dict[str, Any]] = []
    conf_sum = 0.0
    conf_n = 0

    with tempfile.TemporaryDirectory() as tmp_md:
        for res in output:
            payload: Any = None
            if hasattr(res, "json"):
                try:
                    payload = res.json
                except Exception:
                    payload = None
            if isinstance(payload, dict) and "res" in payload and isinstance(payload["res"], dict):
                payload = payload["res"]

            page_words = _extract_words(payload if isinstance(payload, dict) else {})
            words.extend(page_words)
            for w in page_words:
                conf_sum += w["confidence"]
                conf_n += 1

            md = _extract_markdown(res, tmp_md)
            if md:
                markdown_parts.append(md)
                text_parts.append(md)
            elif page_words:
                text_parts.append("\n".join(w["text"] for w in page_words))

    full_text = "\n\n".join(p for p in text_parts if p).strip()
    avg_conf = (conf_sum / conf_n) if conf_n else 0.0

    return {
        "text": full_text,
        "markdown": "\n\n".join(markdown_parts).strip(),
        "confidence": round(avg_conf, 2),
        "words": words,
        "engine": "paddleocr-vl",
        "version": "v1.5",
    }


def main() -> int:
    if len(sys.argv) < 2:
        print(json.dumps({"error": "usage: paddle_ocr_worker.py <image_path>"}))
        return 2
    image_path = sys.argv[1]
    if not os.path.isfile(image_path):
        print(json.dumps({"error": f"file not found: {image_path}"}))
        return 2
    try:
        result = run(image_path)
        sys.stdout.write(json.dumps(result, ensure_ascii=False))
        sys.stdout.flush()
        return 0
    except Exception as exc:
        traceback.print_exc(file=sys.stderr)
        sys.stdout.write(json.dumps({"error": str(exc)}))
        return 1


if __name__ == "__main__":
    sys.exit(main())

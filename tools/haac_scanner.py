#!/usr/bin/env python3
import argparse
import json
import os
import re
import subprocess
from pathlib import Path


FLAG_PATTERNS = {
    "NUDITE": [r"nudit", r"nu\b", r"sex", r"porn"],
    "VIOLENCE": [r"tuer", r"meurtre", r"sang", r"violence", r"arme"],
    "DROGUE": [r"drogue", r"cocaine", r"cannabis", r"heroine"],
    "HAINE": [r"haine", r"ethnie", r"rac", r"insulte"],
    "POLITIQUE": [r"election", r"parti", r"president", r"benin", r"haac"],
    "RELIGION": [r"religion", r"eglise", r"mosquee", r"imam", r"pasteur"],
}


def extract_thumbnails(video: str, out_dir: str):
    thumbs = []
    try:
        os.makedirs(out_dir, exist_ok=True)
        for i, pct in enumerate(range(10, 100, 10), start=1):
            out = os.path.join(out_dir, f"thumb_{pct}.jpg")
            cmd = ["ffmpeg", "-y", "-i", video, "-vf", f"select='gt(scene,0.05)',scale=640:-1", "-frames:v", "1", out]
            subprocess.run(cmd, capture_output=True, text=True, check=False)
            thumbs.append(out)
    except Exception:
        return []
    return thumbs


def keyword_flags(text: str):
    flags = []
    source = text.lower()
    for flag_type, patterns in FLAG_PATTERNS.items():
        for p in patterns:
            if re.search(p, source):
                sev = 3
                if flag_type in {"NUDITE", "VIOLENCE", "HAINE"}:
                    sev = 4
                if flag_type in {"POLITIQUE", "RELIGION"}:
                    sev = 4
                flags.append({
                    "flag_type": flag_type,
                    "severity": sev,
                    "ai_confidence": 0.72,
                    "evidence": p,
                })
                break
    return flags


def nsfw_scan_local(images):
    # Optional local model if transformers+torch available.
    out = []
    try:
        from transformers import pipeline  # type: ignore

        clf = pipeline("image-classification", model="Falconsai/nsfw_image_detection")
        for image in images:
            try:
                result = clf(image)
                top = result[0] if result else {}
                label = str(top.get("label", "")).upper()
                score = float(top.get("score", 0.0))
                if "NSFW" in label and score >= 0.6:
                    out.append({
                        "flag_type": "NUDITE",
                        "severity": 4,
                        "ai_confidence": score,
                        "evidence": os.path.basename(image),
                    })
            except Exception:
                continue
    except Exception:
        return out
    return out


def decide_status(flags):
    if not flags:
        return "VISA_OK"

    max_sev = max(f.get("severity", 1) for f in flags)
    if max_sev >= 4:
        if any(f.get("flag_type") == "VIOLENCE" for f in flags):
            return "+18"
        return "QUARANTAINE"
    if max_sev == 3:
        return "+16"
    return "VISA_OK"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--content-id", required=True)
    parser.add_argument("--video", required=True)
    parser.add_argument("--srt", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()

    try:
        srt_text = Path(args.srt).read_text(encoding="utf-8", errors="ignore") if os.path.exists(args.srt) else ""
        thumbs = extract_thumbnails(args.video, args.output_dir)

        flags = keyword_flags(srt_text)
        flags.extend(nsfw_scan_local(thumbs))

        haac_status = decide_status(flags)
        print(json.dumps({"content_id": args.content_id, "haac_status": haac_status, "flags": flags}, ensure_ascii=True))
    except Exception as exc:
        print(json.dumps({"content_id": args.content_id, "haac_status": "QUARANTAINE", "flags": [], "error": str(exc)}, ensure_ascii=True))
        raise SystemExit(1)


if __name__ == "__main__":
    main()

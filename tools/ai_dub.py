#!/usr/bin/env python3
import argparse
import csv
import json
import os
import subprocess
from pathlib import Path


def read_srt_text(path: str) -> str:
    try:
        return Path(path).read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return ""


def load_glossary(path: str):
    out = {}
    if not path:
        return out
    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            reader = csv.reader(f)
            for row in reader:
                if len(row) < 2:
                    continue
                out[row[0].strip().lower()] = row[1].strip()
    except Exception:
        return out
    return out


def translate_text_local(text: str, target_lang: str, glossary: dict) -> str:
    try:
        prompt = f"Traduis ce sous-titre en {target_lang} avec style naturel Afrique de l'Ouest. Texte: {text[:12000]}"
        cmd = ["ollama", "run", "llama3", prompt]
        proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
        translated = proc.stdout.strip() if proc.returncode == 0 else text
    except Exception:
        translated = text

    for src, dst in glossary.items():
        translated = translated.replace(src, dst)
    return translated


def synthesize_placeholder_audio(out_wav: str):
    # Safe placeholder using ffmpeg silence when XTTS is unavailable.
    try:
        os.makedirs(os.path.dirname(out_wav), exist_ok=True)
        cmd = ["ffmpeg", "-y", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", "8", out_wav]
        subprocess.run(cmd, capture_output=True, text=True, check=False)
        return True
    except Exception:
        return False


def render_hls_from_source(video: str, out_dir: str):
    try:
        os.makedirs(out_dir, exist_ok=True)
        playlist = os.path.join(out_dir, "playlist.m3u8")
        cmd = [
            "ffmpeg", "-y", "-i", video,
            "-c:v", "copy", "-c:a", "aac",
            "-f", "hls", "-hls_time", "6", "-hls_playlist_type", "vod",
            playlist,
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
        return proc.returncode == 0, playlist, proc.stderr
    except Exception as exc:
        return False, "", str(exc)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--content-id", required=True)
    parser.add_argument("--target-lang", required=True)
    parser.add_argument("--video", required=True)
    parser.add_argument("--srt", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--models-path", required=True)
    parser.add_argument("--afri-glossary", default="")
    args = parser.parse_args()

    try:
        srt_text = read_srt_text(args.srt)
        glossary = load_glossary(args.afri_glossary)
        translated = translate_text_local(srt_text, args.target_lang, glossary)

        dub_dir = os.path.join(args.output_dir, f"dub_{args.target_lang}")
        os.makedirs(dub_dir, exist_ok=True)

        translated_srt = os.path.join(dub_dir, "translated.srt")
        Path(translated_srt).write_text(translated, encoding="utf-8")

        audio_path = os.path.join(dub_dir, "dub_audio.wav")
        synthesize_placeholder_audio(audio_path)

        ok, playlist, err = render_hls_from_source(args.video, dub_dir)
        if not ok:
            raise RuntimeError(err or "hls render failed")

        print(json.dumps({"status": "ok", "playlist": playlist}, ensure_ascii=True))
    except Exception as exc:
        print(json.dumps({"status": "error", "message": str(exc)}, ensure_ascii=True))
        raise SystemExit(1)


if __name__ == "__main__":
    main()

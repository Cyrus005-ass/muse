#!/usr/bin/env python3
import argparse
import json
import subprocess


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    try:
      cmd = ["whisper", args.video, "--model", "base", "--task", "transcribe", "--output_format", "srt", "--output_dir", "."]
      proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
      if proc.returncode != 0:
          raise RuntimeError(proc.stderr or "whisper failed")

      # whisper writes <stem>.srt in cwd; keep simple by copying if path differs
      import os
      import shutil
      stem = os.path.splitext(os.path.basename(args.video))[0]
      generated = os.path.join(".", f"{stem}.srt")
      if generated != args.output and os.path.exists(generated):
          os.makedirs(os.path.dirname(args.output), exist_ok=True)
          shutil.move(generated, args.output)

      print(json.dumps({"status": "ok", "path": args.output}, ensure_ascii=True))
    except Exception as exc:
      print(json.dumps({"status": "error", "message": str(exc)}, ensure_ascii=True))
      raise SystemExit(1)


if __name__ == "__main__":
    main()

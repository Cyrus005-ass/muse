#!/usr/bin/env python3
import argparse
import json
import subprocess


def run_ffprobe(video_path: str):
    try:
      cmd = [
          "ffprobe",
          "-v",
          "error",
          "-show_streams",
          "-show_format",
          "-print_format",
          "json",
          video_path,
      ]
      out = subprocess.check_output(cmd, stderr=subprocess.STDOUT, text=True)
      return json.loads(out)
    except Exception as exc:
      return {"error": str(exc)}


def parse_lufs(ffmpeg_stderr: str) -> float:
    try:
      marker = "I:"
      if marker not in ffmpeg_stderr:
          return -70.0
      tail = ffmpeg_stderr.split(marker)[-1].strip().split(" ")[0]
      return float(tail)
    except Exception:
      return -70.0


def detect_lufs(video_path: str) -> float:
    try:
      cmd = [
          "ffmpeg",
          "-i",
          video_path,
          "-af",
          "loudnorm=I=-23:TP=-2:LRA=7:print_format=summary",
          "-f",
          "null",
          "-",
      ]
      proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
      return parse_lufs(proc.stderr)
    except Exception:
      return -70.0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", required=True)
    args = parser.parse_args()

    result = {"status": "FAILED", "note": "QC failed"}

    try:
      info = run_ffprobe(args.video)
      if "error" in info:
          result["note"] = f"ffprobe error: {info['error']}"
          print(json.dumps(result, ensure_ascii=True))
          return

      streams = info.get("streams", [])
      format_info = info.get("format", {})

      v_stream = next((s for s in streams if s.get("codec_type") == "video"), None)
      a_stream = next((s for s in streams if s.get("codec_type") == "audio"), None)

      if not v_stream:
          result["note"] = "Video stream missing"
          print(json.dumps(result, ensure_ascii=True))
          return

      codec = (v_stream.get("codec_name") or "").lower()
      width = int(v_stream.get("width") or 0)
      height = int(v_stream.get("height") or 0)
      bitrate = int(format_info.get("bit_rate") or 0)
      duration = float(format_info.get("duration") or 0)
      ratio = (width / height) if width > 0 and height > 0 else 0
      lufs = detect_lufs(args.video) if a_stream else -70.0

      if codec != "h264":
          result["note"] = "Codec non h264"
      elif bitrate < 2_000_000:
          result["note"] = "Bitrate trop bas"
      elif duration < 60:
          result["note"] = "Duree inferieure a 1 minute"
      elif abs(ratio - (16 / 9)) > 0.2:
          result["note"] = "Ratio non conforme 16:9"
      elif lufs < -23.0:
          result["note"] = "Audio sous -23 LUFS"
      else:
          result = {"status": "PASSED", "note": "QC passed"}

      print(json.dumps(result, ensure_ascii=True))
    except Exception as exc:
      print(json.dumps({"status": "FAILED", "note": str(exc)}, ensure_ascii=True))


if __name__ == "__main__":
    main()

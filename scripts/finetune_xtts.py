#!/usr/bin/env python3
"""
Fine-tune helper for XTTS voice cloning on Fon language data.
Expected minimum: 30 minutes clean speech + aligned transcripts.
"""

import argparse
import json
import os
import subprocess
from pathlib import Path


def run(cmd, cwd=None):
    try:
        proc = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, check=False)
        return proc.returncode == 0, proc.stdout, proc.stderr
    except Exception as exc:
        return False, "", str(exc)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset-dir", required=True, help="Folder with wav + metadata.csv")
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--base-model", default="xtts_v2")
    parser.add_argument("--epochs", type=int, default=20)
    args = parser.parse_args()

    out = {"status": "error", "message": "unknown"}

    try:
        dataset = Path(args.dataset_dir)
        if not dataset.exists():
            out["message"] = "dataset-dir not found"
            print(json.dumps(out, ensure_ascii=True))
            return

        metadata = dataset / "metadata.csv"
        if not metadata.exists():
            out["message"] = "metadata.csv missing"
            print(json.dumps(out, ensure_ascii=True))
            return

        os.makedirs(args.output_dir, exist_ok=True)

        cmd = [
            "python",
            "-m",
            "TTS.bin.train_tts",
            "--config_path",
            "configs/xtts_finetune.json",
            "--coqpit.output_path",
            args.output_dir,
            "--coqpit.datasets[0].path",
            str(dataset),
            "--coqpit.model",
            args.base_model,
            "--coqpit.trainer.max_epochs",
            str(max(1, args.epochs)),
        ]

        ok, stdout, stderr = run(cmd)
        if not ok:
            out["message"] = stderr or "training failed"
            print(json.dumps(out, ensure_ascii=True))
            raise SystemExit(1)

        out = {
            "status": "ok",
            "message": "finetune complete",
            "model_hint": os.path.join(args.output_dir, "best_model.pth"),
        }
        print(json.dumps(out, ensure_ascii=True))
    except Exception as exc:
        print(json.dumps({"status": "error", "message": str(exc)}, ensure_ascii=True))
        raise SystemExit(1)


if __name__ == "__main__":
    main()

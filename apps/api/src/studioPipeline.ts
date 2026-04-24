import { mkdirSync } from "node:fs";
import { copyFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";

function runCommand(command: string, args: string[], cwd?: string): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolvePromise) => {
    try {
      const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("error", (err) => {
        resolvePromise({ ok: false, stdout, stderr: `${stderr}\n${String(err)}` });
      });

      child.on("close", (code) => {
        resolvePromise({ ok: code === 0, stdout, stderr });
      });
    } catch (error) {
      resolvePromise({ ok: false, stdout: "", stderr: String(error) });
    }
  });
}

export async function transcodeToHls(inputVideoPath: string, outputDir: string): Promise<{ ok: boolean; playlist: string; message: string }> {
  const outDir = resolve(outputDir);
  mkdirSync(outDir, { recursive: true });

  const master = resolve(outDir, "master.m3u8");
  const args = [
    "-y",
    "-i",
    inputVideoPath,
    "-filter_complex",
    "[0:v]split=3[v1][v2][v3];[v1]scale=w=640:h=360:force_original_aspect_ratio=decrease[v360];[v2]scale=w=1280:h=720:force_original_aspect_ratio=decrease[v720];[v3]scale=w=1920:h=1080:force_original_aspect_ratio=decrease[v1080]",
    "-map",
    "[v360]",
    "-map",
    "a:0?",
    "-c:v:0",
    "libx264",
    "-b:v:0",
    "900k",
    "-c:a:0",
    "aac",
    "-b:a:0",
    "96k",
    "-map",
    "[v720]",
    "-map",
    "a:0?",
    "-c:v:1",
    "libx264",
    "-b:v:1",
    "2400k",
    "-c:a:1",
    "aac",
    "-b:a:1",
    "128k",
    "-map",
    "[v1080]",
    "-map",
    "a:0?",
    "-c:v:2",
    "libx264",
    "-b:v:2",
    "5000k",
    "-c:a:2",
    "aac",
    "-b:a:2",
    "192k",
    "-f",
    "hls",
    "-hls_time",
    "6",
    "-hls_playlist_type",
    "vod",
    "-master_pl_name",
    "master.m3u8",
    "-var_stream_map",
    "v:0,a:0,name:360p v:1,a:1,name:720p v:2,a:2,name:1080p",
    resolve(outDir, "%v.m3u8")
  ];

  const result = await runCommand("ffmpeg", args);
  if (!result.ok) {
    return { ok: false, playlist: master, message: result.stderr || "ffmpeg failed" };
  }

  return { ok: true, playlist: master, message: "ok" };
}

export async function generateSrtIfMissing(videoPath: string, outputSrtPath: string, projectRoot: string): Promise<{ ok: boolean; message: string }> {
  try {
    const script = resolve(projectRoot, "tools", "whisper_srt.py");
    const cmd = await runCommand("python", [script, "--video", videoPath, "--output", outputSrtPath], projectRoot);
    if (!cmd.ok) {
      return { ok: false, message: cmd.stderr || "whisper generation failed" };
    }
    return { ok: true, message: "ok" };
  } catch (error) {
    return { ok: false, message: String(error) };
  }
}

export async function runQc(videoPath: string, projectRoot: string): Promise<{ ok: boolean; qcStatus: "PASSED" | "FAILED"; adminNote: string }> {
  try {
    const script = resolve(projectRoot, "tools", "qc.py");
    const cmd = await runCommand("python", [script, "--video", videoPath], projectRoot);
    if (!cmd.ok) {
      return { ok: false, qcStatus: "FAILED", adminNote: cmd.stderr || "qc execution failed" };
    }

    const payload = JSON.parse(cmd.stdout || "{}") as { status?: string; note?: string };
    if (payload.status === "PASSED") {
      return { ok: true, qcStatus: "PASSED", adminNote: payload.note ?? "QC passed" };
    }

    return { ok: true, qcStatus: "FAILED", adminNote: payload.note ?? "QC failed" };
  } catch (error) {
    return { ok: false, qcStatus: "FAILED", adminNote: String(error) };
  }
}

export async function runHaacScan(input: {
  contentId: string;
  videoPath: string;
  srtPath: string;
  outputDir: string;
  projectRoot: string;
}): Promise<{ ok: boolean; haacStatus: "VISA_OK" | "QUARANTAINE" | "+16" | "+18"; flags: Array<{ flagType: string; severity: number; aiConfidence: number; evidence?: string }> }> {
  try {
    const script = resolve(input.projectRoot, "tools", "haac_scanner.py");
    const cmd = await runCommand(
      "python",
      [
        script,
        "--content-id",
        input.contentId,
        "--video",
        input.videoPath,
        "--srt",
        input.srtPath,
        "--output-dir",
        input.outputDir
      ],
      input.projectRoot
    );

    if (!cmd.ok) {
      return { ok: false, haacStatus: "QUARANTAINE", flags: [] };
    }

    const payload = JSON.parse(cmd.stdout || "{}") as {
      haac_status?: "VISA_OK" | "QUARANTAINE" | "+16" | "+18";
      flags?: Array<{ flag_type: string; severity: number; ai_confidence: number; evidence?: string }>;
    };

    return {
      ok: true,
      haacStatus: payload.haac_status ?? "QUARANTAINE",
      flags: (payload.flags ?? []).map((flag) => ({
        flagType: flag.flag_type,
        severity: flag.severity,
        aiConfidence: flag.ai_confidence,
        evidence: flag.evidence
      }))
    };
  } catch {
    return { ok: false, haacStatus: "QUARANTAINE", flags: [] };
  }
}

export async function runAiDub(input: {
  contentId: string;
  targetLang: string;
  videoPath: string;
  srtPath: string;
  outputDir: string;
  projectRoot: string;
  modelsPath: string;
  afriGlossaryPath?: string;
}): Promise<{ ok: boolean; playlistPath: string; message: string }> {
  const playlistPath = resolve(input.outputDir, `dub_${input.targetLang}`, "playlist.m3u8");
  try {
    const script = resolve(input.projectRoot, "tools", "ai_dub.py");
    const cmd = await runCommand(
      "python",
      [
        script,
        "--content-id",
        input.contentId,
        "--target-lang",
        input.targetLang,
        "--video",
        input.videoPath,
        "--srt",
        input.srtPath,
        "--output-dir",
        input.outputDir,
        "--models-path",
        input.modelsPath,
        "--afri-glossary",
        input.afriGlossaryPath ?? ""
      ],
      input.projectRoot
    );

    if (!cmd.ok) {
      return { ok: false, playlistPath, message: cmd.stderr || "ai dub failed" };
    }

    return { ok: true, playlistPath, message: "ok" };
  } catch (error) {
    return { ok: false, playlistPath, message: String(error) };
  }
}

export async function ensurePosterFallback(inputPosterPath: string | null, outputPosterPath: string): Promise<string | null> {
  try {
    if (!inputPosterPath) return null;
    mkdirSync(dirname(outputPosterPath), { recursive: true });
    await copyFile(inputPosterPath, outputPosterPath);
    return outputPosterPath;
  } catch {
    return null;
  }
}

export async function writeSimpleContract(input: {
  contractPath: string;
  creatorName: string;
  title: string;
  territory: string[];
  revsharePct: number;
  expiryDate: string;
}) {
  try {
    mkdirSync(dirname(input.contractPath), { recursive: true });
    const body = [
      "CONTRAT DE DIFFUSION NON-EXCLUSIF - STUDIO IA AFRIQUE",
      `Createur: ${input.creatorName}`,
      `Titre: ${input.title}`,
      `Territoire: ${input.territory.join(", ")}`,
      `Revshare: ${input.revsharePct}%`,
      `Duree: jusqu'au ${input.expiryDate}`,
      "Conforme aux prescriptions HAAC Benin."
    ].join("\n");

    await writeFile(input.contractPath, body, "utf8");
    return true;
  } catch {
    return false;
  }
}

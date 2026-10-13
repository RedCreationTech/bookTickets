#!/usr/bin/env node
/**
 * 预生成第 1 集的中文配音，并产出「每一句真实时长」的时间表。
 * 录屏脚本读这张表来决定每幕停多久、每条字幕何时出现，
 * 因此旁白、字幕、画面三者天然对齐，而不是按字数估算。
 *
 *   npm run video:voice      # 生成 artifacts/video/tts/*
 * 环境变量：TTS_VOICE / TTS_RATE / TTS_GAP_MS / TTS_TAIL_MS / FFMPEG
 */
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  rmSync,
  existsSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..");
const outDir = join(root, "artifacts/video/tts");
const VOICE = process.env.TTS_VOICE || "Tingting";
const RATE = process.env.TTS_RATE || "190";
const GAP_MS = Number(process.env.TTS_GAP_MS || 320);
const TAIL_MS = Number(process.env.TTS_TAIL_MS || 900);
const FFMPEG =
  process.env.FFMPEG ||
  (existsSync(join(process.env.HOME || "", "tools/ffmpeg/ffmpeg"))
    ? join(process.env.HOME || "", "tools/ffmpeg/ffmpeg")
    : "ffmpeg");

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  if (r.status !== 0)
    throw new Error(`${cmd} 失败：${(r.stderr || r.stdout || "").slice(0, 300)}`);
  return r.stdout;
}

function aiffMs(file) {
  const out = run("afinfo", [file]);
  const m = out.match(/estimated duration:\s*([\d.]+)/);
  if (!m) throw new Error(`读不到音频时长：${file}`);
  return Math.round(Number(m[1]) * 1000);
}

const scenes = JSON.parse(
  readFileSync(join(here, "ep01-script.json"), "utf8"),
).scenes;

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const schedule = {
  voice: VOICE,
  rate: Number(RATE),
  gapMs: GAP_MS,
  tailMs: TAIL_MS,
  scenes: [],
};

for (const scene of scenes) {
  const lines = [];
  scene.narration.forEach((text, i) => {
    const aiff = join(outDir, `${scene.id}-${i}.aiff`);
    const wav = join(outDir, `${scene.id}-${i}.wav`);
    run("say", ["-v", VOICE, "-r", RATE, "-o", aiff, text]);
    const ms = aiffMs(aiff);
    run(FFMPEG, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      aiff,
      // 逐句归一化：整条时间轴只做一次响度处理会在静音段抽气，
      // 所以按句归一到 -16 LUFS，混音时只加一道限幅。
      "-af",
      "loudnorm=I=-16:TP=-1.5:LRA=11",
      "-ar",
      "48000",
      "-ac",
      "2",
      wav,
    ]);
    lines.push({ text, file: wav, ms });
    rmSync(aiff, { force: true });
  });
  const audioMs =
    lines.reduce((sum, l) => sum + l.ms, 0) + GAP_MS * (lines.length - 1);
  schedule.scenes.push({
    id: scene.id,
    title: scene.title,
    lines,
    audioMs,
    targetMs: audioMs + TAIL_MS,
  });
  console.log(
    `${scene.id.padEnd(15)} ${lines.length} 句  配音 ${(audioMs / 1000).toFixed(1)}s  本幕 ${(
      (audioMs + TAIL_MS) /
      1000
    ).toFixed(1)}s`,
  );
}

schedule.totalMs = schedule.scenes.reduce((sum, s) => sum + s.targetMs, 0);
writeFileSync(
  join(outDir, "schedule.json"),
  `${JSON.stringify(schedule, null, 2)}\n`,
);
console.log(
  `\n配音总时长 ${(schedule.totalMs / 60000).toFixed(2)} 分钟 · 声线 ${VOICE} @${RATE}wpm`,
);
console.log(`时间表：${join(outDir, "schedule.json")}`);

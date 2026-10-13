#!/usr/bin/env node
/**
 * 把「CDP 抓帧 + 真实配音时长 + 分镜时间轴」组装成成片与配套文稿：
 *   artifacts/video/ep01-hd.mp4        1920×1080 + 底部字幕带 + 中文配音
 *   docs/video/ep01-narration.md       分镜逐字稿（时间码取自真实配音）
 *   docs/video/ep01.srt / .vtt / .ass  字幕（与成片内嵌字幕同源）
 *   docs/video/ep01-chapters.tsv       章节标记
 * 没有 CDP 抓帧时退回转码 Playwright 的 800×500 webm。
 */
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..");
const videoDir = join(root, "artifacts/video");
const cuePath = join(videoDir, "ep01-cues.json");
const voPath = join(videoDir, "tts/schedule.json");
const cdpDir = join(videoDir, "cdp");
const outDir = join(root, "docs/video");
const scriptPath = join(here, "ep01-script.json");

if (!existsSync(cuePath)) {
  console.error(`缺少 ${cuePath}，请先运行 npm run video:ep01`);
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const cues = JSON.parse(readFileSync(cuePath, "utf8"));
const ops = JSON.parse(readFileSync(scriptPath, "utf8")).scenes;
const vo = existsSync(voPath)
  ? JSON.parse(readFileSync(voPath, "utf8"))
  : null;
const metaPath = join(cdpDir, "meta.json");
const hasCdp = existsSync(metaPath) && existsSync(join(cdpDir, "list.txt"));
const cdpMeta = hasCdp ? JSON.parse(readFileSync(metaPath, "utf8")) : null;

const home = process.env.HOME || "";
const pwCache = join(home, "Library/Caches/ms-playwright");
const bundled = existsSync(pwCache)
  ? readdirSync(pwCache, { withFileTypes: true })
      .filter((d) => d.name.startsWith("ffmpeg-"))
      .map((d) => join(pwCache, d.name, "ffmpeg-mac"))
      .filter((p) => existsSync(p))
  : [];
const FFMPEG = [
  process.env.FFMPEG,
  join(home, "tools/ffmpeg/ffmpeg"),
  "ffmpeg",
  "/opt/homebrew/bin/ffmpeg",
  "/usr/local/bin/ffmpeg",
  ...bundled,
].find((bin) => {
  if (!bin) return false;
  const probe = spawnSync(bin, ["-hide_banner", "-encoders"], {
    encoding: "utf8",
  });
  return probe.status === 0 && /libx264/.test(probe.stdout || "");
});
if (!FFMPEG) {
  console.error(
    "找不到可编码 H.264 的 ffmpeg。安装静态构建后重试：npm run video:build",
  );
  process.exit(1);
}

const pad = (n, w = 2) => String(n).padStart(w, "0");
const clock = (ms, comma) => {
  const t = Math.max(0, Math.round(ms));
  return `${pad(Math.floor(t / 3600000))}:${pad(Math.floor((t % 3600000) / 60000))}:${pad(
    Math.floor((t % 60000) / 1000),
  )}${comma ? "," : "."}${pad(Math.floor((t % 1000) / 10), 3)}`;
};
const assClock = (ms) => {
  const t = Math.max(0, Math.round(ms / 10));
  return `${Math.floor(t / 360000)}:${pad(Math.floor((t / 6000) % 60))}:${pad(
    Math.floor((t / 100) % 60),
  )}.${pad(t % 100)}`;
};
const stamp = (ms) => {
  const t = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(t / 60)}:${pad(t % 60)}`;
};

// 时间轴对齐：cue 以「页面就绪」为零点，CDP 帧从浏览器启动就开始。
const offset = hasCdp
  ? Math.max(0, Math.round(cdpMeta.t0EpochMs - cdpMeta.startEpochMs))
  : Number(process.env.VIDEO_OFFSET_MS || 1050);

const marks = new Map((cues.scenes || []).map((m) => [m.id, m]));
const blocks = ops
  .filter((s) => marks.has(s.id))
  .map((s) => {
    const m = marks.get(s.id);
    const voice = vo?.scenes.find((v) => v.id === s.id);
    const start = m.start + offset;
    return {
      ...s,
      start,
      end: m.end + offset,
      duration: m.end - m.start,
      lines: (voice?.lines || s.narration.map((text) => ({ text, ms: 0 }))).map(
        (l) => ({ text: l.text, ms: l.ms, file: l.file }),
      ),
      gapMs: voice?.gapMs ?? 320,
    };
  });
const skipped = ops.filter((s) => !marks.has(s.id)).map((s) => s.id);

// 字幕条目：逐句起点 = 本幕起点 + 之前句子的真实时长与间隔
const subs = [];
const chips = [];
for (const block of blocks) {
  chips.push({
    start: block.start,
    end: block.end,
    text: `${pad(blocks.indexOf(block) + 1)} / ${pad(blocks.length)} · ${block.title}`,
  });
  let cursor = block.start;
  (block.lines || []).forEach((line) => {
    const span = Math.max(1200, line.ms + block.gapMs);
    subs.push({ start: cursor, end: cursor + span - 120, text: line.text });
    cursor += span;
  });
}
const totalMs = Math.max(
  blocks.length ? blocks[blocks.length - 1].end : 0,
  subs.length ? subs[subs.length - 1].end : 0,
);

writeFileSync(
  join(outDir, "ep01.srt"),
  subs
    .map(
      (e, i) =>
        `${i + 1}\n${clock(e.start, true)} --> ${clock(e.end, true)}\n${e.text}\n`,
    )
    .join("\n"),
);
writeFileSync(
  join(outDir, "ep01.vtt"),
  `WEBVTT\n\n${subs
    .map(
      (e, i) => `${i + 1}\n${clock(e.start)} --> ${clock(e.end)}\n${e.text}\n`,
    )
    .join("\n")}`,
);
writeFileSync(
  join(outDir, "ep01-chapters.tsv"),
  `${blocks.map((b) => `${stamp(b.start)}\t${b.title}`).join("\n")}\n`,
);

// 底部字幕带：章节角标 + 最多两行字幕，全部落在补出来的黑边上，
// 因此不再遮挡应用界面。
const BAND = 120;
const ASS = [
  "[Script Info]",
  "ScriptType: v4.00+",
  "PlayResX: 1920",
  "PlayResY: 1080",
  "WrapStyle: 0",
  "ScaledBorderAndShadow: yes",
  "YCbCr Matrix: TV.709",
  "",
  "[V4+ Styles]",
  "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
  "Style: Chip,PingFang SC,21,&H00DCE6DF,&H00FFFFFF,&H00000000,&H00000000,1,0,0,0,100,100,0.5,0,1,0,0,7,44,60,968,1",
  "Style: Cap,PingFang SC,30,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0.3,0,1,0,0,2,320,320,20,1",
  "",
  "[Events]",
  "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ...chips.map(
    (c) =>
      `Dialogue: 0,${assClock(c.start)},${assClock(c.end)},Chip,,0,0,0,,${c.text}`,
  ),
  ...subs.map(
    (s) =>
      `Dialogue: 0,${assClock(s.start)},${assClock(s.end)},Cap,,0,0,0,,${s.text}`,
  ),
  "",
].join("\n");
const assPath = join(outDir, "ep01.ass");
writeFileSync(assPath, ASS);

writeFileSync(
  join(outDir, "ep01-narration.md"),
  [
    "# 第 1 集 · 总览片《一次体检，四端贯通》分镜逐字稿",
    "",
    `- 录制时间：${cues.recordedAt}`,
    `- 成片时长：${clock(totalMs)}（字幕时间轴已按真实配音时长对齐）`,
    `- 配音：${vo ? `${vo.voice} @${vo.rate}wpm` : "未生成，请先 npm run video:voice"}`,
    `- 采集：${hasCdp ? `CDP 抓帧 ${cdpMeta.width}×${cdpMeta.height}，${cdpMeta.frames} 帧` : "Playwright 录屏 800×500"}`,
    "- 画面字幕与 `ep01.srt` 同源（`ep01.ass`），均落在底部字幕带内，不遮挡界面。",
    "- 画面均为合成数据的纯前端演示，配音不得宣称真实医疗、支付、接口或硬件能力。",
    skipped.length ? `- 本次未跑的分镜：${skipped.join("、")}` : null,
    "",
    "| 时间 | 分镜 | 配音时长 |",
    "| --- | --- | --- |",
    ...blocks.map(
      (b) =>
        `| ${stamp(b.start)} | ${b.title} | ${(
          b.lines.reduce((s, l) => s + l.ms, 0) / 1000
        ).toFixed(1)}s |`,
    ),
    "",
    ...blocks.flatMap((b) => [
      `## ${stamp(b.start)} · ${b.title}`,
      "",
      ...(b.ops && b.ops.length
        ? ["**画面操作**", ...b.ops.map((o) => `- ${o}`), ""]
        : []),
      "**旁白**",
      "",
      ...b.lines.map((l) => `> ${l.text}`),
      "",
    ]),
    "",
  ]
    .filter((l) => typeof l === "string")
    .join("\n"),
);

function run(args, opts = {}) {
  const r = spawnSync(FFMPEG, args, { stdio: "inherit", ...opts });
  if (r.status !== 0) throw new Error(`ffmpeg 退出码 ${r.status}`);
}

// 配音轨：每句按绝对时间 adelay，再 amix 成一条完整解说
const audioOut = join(videoDir, "ep01-voice.m4a");
let audioOk = false;
if (vo) {
  const inputs = [];
  const filters = [];
  const mixed = [];
  let index = 0;
  for (const block of blocks) {
    let cursor = block.start;
    for (const line of block.lines) {
      if (!line.file || !existsSync(line.file)) continue;
      inputs.push("-i", line.file);
      const ms = Math.max(0, Math.round(cursor));
      filters.push(`[${index}:a]adelay=${ms}|${ms}[a${index}]`);
      mixed.push(`[a${index}]`);
      index += 1;
      cursor += line.ms + block.gapMs;
    }
  }
  if (mixed.length) {
    run([
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      ...inputs,
      "-filter_complex",
      [
        ...filters,
        `${mixed.join("")}amix=inputs=${mixed.length}:duration=longest:normalize=0,apad,aresample=48000,alimiter=limit=0.9[aout]`,
      ].join(";"),
      "-map",
      "[aout]",
      "-t",
      (totalMs / 1000).toFixed(3),
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      audioOut,
    ]);
    audioOk = true;
    console.log(`配音轨：${mixed.length} 句 → ${basename(audioOut)}`);
  }
}

const finalMp4 = join(videoDir, hasCdp ? "ep01-hd.mp4" : "ep01-raw.mp4");
if (hasCdp) {
  const frameH = cdpMeta.height + BAND;
  // 静止期浏览器不推帧，成片会比时间轴短；用 tpad 复制末帧补齐到配音结束。
  const holdSec = Math.max(0, totalMs / 1000 - (cdpMeta.spanSec || 0) - 0.2);
  const vf = [
    "fps=25",
    ...(holdSec > 0.2
      ? [`tpad=stop_mode=clone:stop_duration=${holdSec.toFixed(3)}`]
      : []),
    `pad=${cdpMeta.width}:${frameH}:0:0:color=0x0b1512`,
    `ass=${assPath.replace(/:/g, "\\:")}`,
    "format=yuv420p",
  ].join(",");
  run([
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    join(cdpDir, "list.txt"),
    ...(audioOk ? ["-i", audioOut] : []),
    "-vf",
    vf,
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "20",
    ...(audioOk ? ["-c:a", "copy", "-shortest"] : []),
    "-movflags",
    "+faststart",
    finalMp4,
  ], { cwd: cdpDir });
} else {
  const webms = [];
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (name.endsWith(".webm") && !name.includes("ep01-raw"))
        webms.push({ f: full, m: st.mtimeMs });
    }
  };
  walk(videoDir);
  webms.sort((a, b) => b.m - a.m);
  if (!webms.length) {
    console.warn("既没有 CDP 抓帧也没有 webm，跳过成片合成。");
    process.exit(0);
  }
  copyFileSync(webms[0].f, join(videoDir, "ep01-raw.webm"));
  run([
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    webms[0].f,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-crf",
    "22",
    "-movflags",
    "+faststart",
    finalMp4,
  ]);
}

const probe = spawnSync(FFMPEG, ["-hide_banner", "-i", finalMp4], {
  encoding: "utf8",
});
const dur = (probe.stderr || "").match(/Duration:\s*([\d:.]+)/)?.[1] || "?";
const res = (probe.stderr || "").match(/(\d{3,4}x\d{3,4})/)?.[1] || "?";
console.log(`\n成片：${finalMp4}`);
console.log(`时长 ${dur} · 分辨率 ${res} · 配音 ${audioOk ? "已内嵌" : "无"}`);
console.log(`字幕条目 ${subs.length} · 分镜 ${blocks.length}/${ops.length}`);
console.log(`文稿目录：${outDir}`);

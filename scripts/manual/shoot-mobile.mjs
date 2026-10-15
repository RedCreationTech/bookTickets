#!/usr/bin/env node
// 第 2 章（微信小程序端）竖版重截：在独立的窄窗口（500pt 宽，命中 @media(max-width:600px) 真实手机版式）里
// 逐个底部导航截图，并按屏滚动覆盖全部内容。命名沿用 2-N 与 2-N-b/c/…，清单标记 orientation=portrait。
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, rmSync, renameSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const PORT = Number(process.env.PORT || 1234);
const IMG = join(root, "docs/guides/images");
const SKILL = join(process.env.HOME, ".qoder/skills/chrome-tab-screenshot/scripts/chrome_shot.mjs");
const MATCH = "#/patient?shot=m";
const NAVS = ["首页", "预约", "导检", "报告", "我的"];
const MAX_SCREENS = Number(process.env.MAX_SCREENS || 6);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const j = async (u) => (await fetch(u, { signal: AbortSignal.timeout(5000) })).json();
const pages = (await j(`http://127.0.0.1:${PORT}/json/list`)).filter((t) => t.type === "page");
const tab = pages.find((t) => (t.url || "").includes("shot=m"));
if (!tab) {
  console.log("没找到 shot=m 的竖版标签页（请先跑 scripts/manual 里的建窗步骤）");
  process.exit(1);
}
const ws = new WebSocket(tab.webSocketDebuggerUrl);
let seq = 0;
const pend = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) {
    const { ok, fail } = pend.get(m.id);
    pend.delete(m.id);
    m.error ? fail(new Error(m.error.message)) : ok(m.result);
  }
};
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = () => rej(new Error("连不上竖版标签页"));
});
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++seq;
    pend.set(id, { ok: res, fail: rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
const raw = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
};

const PICK = `(() => {
  const de = document.scrollingElement || document.documentElement;
  const cands = [de, ...document.querySelectorAll(".pt-root,.pt-layout,main,.content,[class*=scroll],[class*=layout]")];
  let best = null, over = 0, view = 0, tag = "window";
  for (const e of cands) {
    if (!e) continue;
    const cs = getComputedStyle(e);
    if (e !== de && !/auto|scroll/.test(cs.overflowY)) continue;
    const o = e.scrollHeight - e.clientHeight;
    if (o > over) { over = o; view = e.clientHeight; best = e; tag = e === de ? "window" : String(e.className).slice(0, 26); }
  }
  if (!best) { best = de; view = de.clientHeight; over = Math.max(0, de.scrollHeight - de.clientHeight); }
  return JSON.stringify({ tag, over, view, total: best.scrollHeight });
})()`;

const SCROLL = (dy) => `(() => {
  const de = document.scrollingElement || document.documentElement;
  const cands = [de, ...document.querySelectorAll(".pt-root,.pt-layout,main,.content,[class*=scroll],[class*=layout]")];
  let best = null, over = 0;
  for (const e of cands) {
    if (!e) continue;
    const cs = getComputedStyle(e);
    if (e !== de && !/auto|scroll/.test(cs.overflowY)) continue;
    const o = e.scrollHeight - e.clientHeight;
    if (o > over) { over = o; best = e; }
  }
  if (!best) best = de;
  const before = best.scrollTop;
  best.scrollTop = before + ${dy};
  return JSON.stringify({ from: before, to: best.scrollTop, max: best.scrollHeight - best.clientHeight });
})()`;

const NAV = (label) => `(() => {
  const hit = [...document.querySelectorAll(".pt-bottom-nav button")].find(b => (b.innerText || "").trim() === ${JSON.stringify(label)});
  if (!hit) return "MISS:" + [...document.querySelectorAll(".pt-bottom-nav button")].map(b => b.innerText.trim()).join("/");
  hit.click();
  return "OK";
})()`;

const tmp = join(here, ".shots-m");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const grab = () => spawnSync("node", [SKILL, "--port", String(PORT), "--url", MATCH, "--page-only", "--dir", tmp], { encoding: "utf8" });

const manifestPath = join(here, "shot-manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")).filter((m) => !m.image.startsWith("2-"));
for (const f of readdirSync(IMG)) if (f.startsWith("2-")) rmSync(join(IMG, f), { force: true });

const log = [];
for (let i = 0; i < NAVS.length; i++) {
  const n = i + 1;
  const r = await raw(NAV(NAVS[i]));
  if (String(r).startsWith("MISS")) {
    console.log(`!! 导航「${NAVS[i]}」未命中：${r}`);
    continue;
  }
  await sleep(1700);
  await raw(SCROLL(-99999));
  await sleep(600);
  const m = JSON.parse(await raw(PICK));
  const screens = Math.min(MAX_SCREENS, Math.max(1, Math.ceil(m.over / Math.max(200, m.view - 90)) + 1));
  console.log(`「${NAVS[i]}」滚动容器=${m.tag} 内容高=${m.total}px 视口=${m.view}px 超出=${m.over}px → 截 ${screens} 屏`);
  for (let s = 0; s < screens; s++) {
    const suffix = s === 0 ? "" : "-" + String.fromCharCode(97 + s);
    const out = grab();
    const saved = out.stdout?.match(/SAVED (\S+)/)?.[1];
    if (!saved) {
      console.log(`   !! 2-${n}${suffix} 截图失败：${(out.stdout || "").slice(0, 90)}`);
      break;
    }
    const dst = join(IMG, `2-${n}${suffix}.png`);
    rmSync(dst, { force: true });
    renameSync(saved, dst);
    manifest.push({
      num: `2.${n}${s ? "." + (s + 1) : ""}`,
      image: `2-${n}${suffix}`,
      route: "/patient",
      label: NAVS[i],
      sectionTitle: "微信小程序端",
      file: `images/2-${n}${suffix}.png`,
      part: s ? s + 1 : undefined,
      orientation: "portrait",
      scrollPx: s === 0 ? 0 : undefined,
    });
    log.push(`2-${n}${suffix}`);
    if (s + 1 < screens) {
      const sc = JSON.parse(await raw(SCROLL(Math.max(300, m.view - 90))));
      await sleep(900);
      if (sc.to >= sc.max - 8) break;
    }
  }
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
rmSync(tmp, { recursive: true, force: true });
ws.close();
console.log(`\n第 2 章竖版共 ${log.length} 张：${log.join(" ")}`);
process.exit(0);

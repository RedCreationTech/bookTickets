#!/usr/bin/env node
// 第二轮：对第一轮里"一屏显示不开"的视图做滚动补图，并输出自评依据。
// 判定口径：实测滚动容器 scrollHeight 与 clientHeight 之差 > 0.5 屏视为超出，补截至底部（每个视图最多 3 张）。
// 命名：在原图号后追加 -b / -c / -d，清单里记 part 与 hiddenPct，供手册正文与评审使用。
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const PORT = Number(process.env.PORT || 1234);
const IMG = join(root, "docs/guides/images");
const SKILL = join(process.env.HOME, ".qoder/skills/chrome-tab-screenshot/scripts/chrome_shot.mjs");
const MAX_EXTRA = Number(process.env.MAX_EXTRA || 3);
const DATA_DATE = process.env.DATA_DATE || "2026-10-13";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const manifest = JSON.parse(readFileSync(join(here, "shot-manifest.json"), "utf8"));
const j = async (u) => (await fetch(u, { signal: AbortSignal.timeout(5000) })).json();
const ver = await j(`http://127.0.0.1:${PORT}/json/version`);
const pages = (await j(`http://127.0.0.1:${PORT}/json/list`)).filter((t) => t.type === "page");
const tab = pages.find((t) => t.url.includes("5173")) || pages[0];

const mk = async (url) => {
  const ws = new WebSocket(url);
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
    ws.onerror = () => rej(new Error("连不上 CDP"));
  });
  return {
    send: (method, params = {}) =>
      new Promise((res, rej) => {
        const id = ++seq;
        pend.set(id, { ok: res, fail: rej });
        ws.send(JSON.stringify({ id, method, params }));
      }),
    close: () => {
      try {
        ws.close();
      } catch {}
    },
  };
};
const cdp = await mk(tab.webSocketDebuggerUrl);
const bcdp = await mk(ver.webSocketDebuggerUrl);
const ev = async (expr) => {
  const r = await cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return JSON.parse(r.result.value);
};
const raw = async (expr) => {
  const r = await cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
};

// 找出真正滚动的容器（页面整体或内部面板），并报告超出比例
const MEASURE = `(() => {
  const de = document.scrollingElement || document.documentElement;
  const cands = [[de, "window"], ...[...document.querySelectorAll("main,.content,.panel,.table-wrap,.card,[class*=list],[class*=scroll],[class*=body]")].map(e => [e, e.className || e.tagName])];
  let best = null;
  for (const [e, tag] of cands) {
    if (!e) continue;
    const cs = getComputedStyle(e);
    const canScroll = /auto|scroll/.test(cs.overflowY) || tag === "window";
    const over = e.scrollHeight - e.clientHeight;
    if (canScroll && over > (best ? best.over : 0)) best = { tag: String(tag).slice(0, 30), over, total: e.scrollHeight, view: e.clientHeight };
  }
  return JSON.stringify(best || { tag: "none", over: 0, total: de.scrollHeight, view: de.clientHeight });
})()`;

const SCROLL = (dy) => `(() => {
  const de = document.scrollingElement || document.documentElement;
  const cands = [de, ...document.querySelectorAll("main,.content,.panel,.table-wrap,.card,[class*=list],[class*=scroll],[class*=body]")];
  let best = null, bestOver = 0;
  for (const e of cands) {
    if (!e) continue;
    const cs = getComputedStyle(e);
    if (!/auto|scroll/.test(cs.overflowY) && e !== de) continue;
    const over = e.scrollHeight - e.clientHeight;
    if (over > bestOver) { bestOver = over; best = e; }
  }
  if (!best) return "NONE";
  const before = best.scrollTop;
  best.scrollTop = before + ${dy};
  return JSON.stringify({ from: before, to: best.scrollTop, max: best.scrollHeight - best.clientHeight });
})()`;

const CLICK = (label) => `(() => {
  const want = ${JSON.stringify(label)};
  const els = [...document.querySelectorAll(".ops-tabbar > button, .tabs > button, .pt-bottom-nav button, .ks-mode-tabs button")];
  if (!want) return "OK";
  const hit = els.find(e => (e.innerText || "").trim() === want);
  return hit ? (hit.click(), "OK") : "MISS";
})()`;

const tmp = join(here, ".shots2");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

const grab = (route) =>
  spawnSync("node", [SKILL, "--port", String(PORT), "--url", `#${route}`, "--page-only", "--dir", tmp], { encoding: "utf8" });

// DATE=2026-10-13 时：把页面所有日期输入设为该值（演示数据落在这一天），避免续截回到空态
const SET_DATE = (val) => `(() => {
  const set = (el, v) => {
    const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    d.set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const ins = [...document.querySelectorAll('input[type="date"]')];
  ins.forEach(e => set(e, ${JSON.stringify(val)}));
  return ins.length;
})()`;
const DATE = process.env.DATE || "";

const report = [];
let cur = null;
// ONLY=5-4,5-3 时只重跑这些视图（含其续图），用于状态修正后的增量补截
const ONLY = (process.env.ONLY || "").split(",").map((s) => s.trim()).filter(Boolean);
const wanted = (image) => !ONLY.length || ONLY.some((o) => image === o || image.startsWith(o + "-"));
if (ONLY.length)
  for (let i = manifest.length - 1; i >= 0; i--)
    if (manifest[i].part && ONLY.some((o) => manifest[i].image.startsWith(o + "-"))) manifest.splice(i, 1);
for (const entry of manifest) {
  if (entry.part) continue;
  if (!wanted(entry.image)) continue;
  if (cur !== entry.route) {
    await cdp.send("Runtime.evaluate", { expression: `location.hash = "#${entry.route}"; 0` });
    await sleep(2500);
    cur = entry.route;
  }
  await raw(CLICK(entry.label));
  await sleep(1400);
  if (DATE) {
    await raw(SET_DATE(DATA_DATE));
    await sleep(1600);
  }
  await raw(SCROLL(-99999));
  await sleep(500);
  const m = await ev(MEASURE);
  const hiddenPct = m.view ? Math.round((m.over / m.view) * 100) : 0;
  if (m.over < m.view * 0.5) {
    report.push({ image: entry.image, label: entry.label, over: m.over, view: m.view, extra: 0, note: "一屏内完整" });
    continue;
  }
  let extra = 0;
  for (let i = 0; i < MAX_EXTRA; i++) {
    const step = Math.max(300, m.view - 90);
    const sRaw = await raw(SCROLL(step));
    const sc = sRaw && sRaw !== "NONE" ? JSON.parse(sRaw) : null;
    await sleep(900);
    if (!sc) break;
    const out = grab(entry.route);
    let saved = out.stdout?.match(/SAVED (\S+)/)?.[1];
    if (!saved && /原生全屏/.test(out.stdout || "")) {
      const { windowId } = await bcdp.send("Browser.getWindowForTarget", { targetId: tab.id });
      await bcdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "normal" } });
      await sleep(2500);
      saved = grab(entry.route).stdout?.match(/SAVED (\S+)/)?.[1];
    }
    if (!saved) {
      report.push({ image: entry.image, label: entry.label, over: m.over, view: m.view, extra, note: "截图失败：" + (out.stdout || "").slice(0, 60) });
      break;
    }
    const suffix = String.fromCharCode(98 + extra);
    const dst = join(IMG, `${entry.image}-${suffix}.png`);
    rmSync(dst, { force: true });
    renameSync(saved, dst);
    extra++;
    manifest.push({ ...entry, image: `${entry.image}-${suffix}`, num: entry.num + "." + (extra + 1), part: extra + 1, file: `images/${entry.image}-${suffix}.png`, atTop: sc.to, max: sc.max });
    if (sc.to >= sc.max - 8) break;
  }
  report.push({ image: entry.image, label: entry.label, over: m.over, view: m.view, hiddenPct, extra, note: `超出 ${m.over}px（约 ${(m.over / m.view).toFixed(1)} 屏），补 ${extra} 张` });
}
writeFileSync(join(here, "shot-manifest.json"), JSON.stringify(manifest, null, 1));
writeFileSync(join(here, process.env.REPORT || "scroll-review.json"), JSON.stringify(report, null, 1));
rmSync(tmp, { recursive: true, force: true });
cdp.close();
bcdp.close();

const need = report.filter((r) => r.extra > 0);
console.log(`评审：${report.length} 个视图，其中 ${need.length} 个超出一屏，共补 ${need.reduce((a, b) => a + b.extra, 0)} 张`);
for (const r of need) console.log(`  ${r.image.padEnd(9)} ${(r.label || "默认视图").padEnd(16)} 超出 ${String(r.over).padStart(5)}px / 视口 ${r.view}px → 补 ${r.extra} 张`);
process.exit(0);

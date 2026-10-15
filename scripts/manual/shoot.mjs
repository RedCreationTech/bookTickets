#!/usr/bin/env node
// 按手册章节编号为每个页面/子页签截图：
//   导航 → 点页签 → 调 chrome-tab-screenshot 技能（--page-only，不加 --size＝原始窗口模式）→ 按编号重命名
// 用法：node scripts/manual/shoot.mjs [起始编号] [张数]
//   例：node scripts/manual/shoot.mjs        全量
//       node scripts/manual/shoot.mjs 1 6    只截前 6 张（先小步验证）
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const PORT = Number(process.env.PORT || 1234);
const IMG = join(root, "docs/guides/images");
const SKILL = join(process.env.HOME, ".qoder/skills/chrome-tab-screenshot/scripts/chrome_shot.mjs");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

import { buildPlan } from "./plan.mjs";

const outline = JSON.parse(readFileSync(join(here, "manual-outline.json"), "utf8")).sections;
const tabs = JSON.parse(readFileSync(join(here, "manual-tabs.json"), "utf8"));
const plan = buildPlan(outline, tabs);

const start = Number(process.argv[2] || 1);
const count = Number(process.argv[3] || plan.length);
const todo = plan.slice(start - 1, start - 1 + count);
mkdirSync(IMG, { recursive: true });
const tmp = join(root, "scripts/manual/.shots");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

const j = async (u) => (await fetch(u, { signal: AbortSignal.timeout(5000) })).json();
const ver = await j(`http://127.0.0.1:${PORT}/json/version`);
const pages = (await j(`http://127.0.0.1:${PORT}/json/list`)).filter((t) => t.type === "page");
const tab = pages.find((t) => t.url.includes("5173")) || pages[0];

const mkClient = async (url) => {
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
    ws.onerror = () => rej(new Error("连不上 " + url.slice(0, 40)));
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
const cdp = await mkClient(tab.webSocketDebuggerUrl);
const bcdp = await mkClient(ver.webSocketDebuggerUrl);
const run = async (expr) => (await cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true })).result;

// 截图期间用户可能把窗口拖成原生全屏；退回窗口态以便继续
const restoreWindowed = async () => {
  const { windowId } = await bcdp.send("Browser.getWindowForTarget", { targetId: tab.id });
  await bcdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "normal" } });
};

const CLICK = (label) => `(() => {
  const want = ${JSON.stringify(label)};
  const els = [...document.querySelectorAll(".ops-tabbar > button, .tabs > button, .pt-bottom-nav button, .ks-mode-tabs button")];
  const hit = els.find(e => (e.innerText || "").trim() === want);
  if (!hit) return "MISS:" + els.map(e => (e.innerText||"").trim()).join("/");
  hit.click();
  return "OK";
})()`;

const manifest = [];
let cur = null;
let fail = 0;
const grab = (route, dir) =>
  spawnSync("node", [SKILL, "--port", String(PORT), "--url", `#${route}`, "--page-only", "--dir", dir], {
    encoding: "utf8",
  });
for (const p of todo) {
  if (cur !== p.route) {
    await run(`location.hash = "#${p.route}"; 0`);
    await sleep(2600);
    cur = p.route;
  }
  let clicked = "";
  if (p.label) {
    const r = await run(CLICK(p.label));
    clicked = r?.value ?? "NOVAL";
    if (String(clicked).startsWith("MISS")) {
      console.log(`!! ${p.num} ${p.image} 页签未命中：${clicked.slice(0, 90)}`);
      fail++;
      continue;
    }
    await sleep(1500);
  }
  let out = grab(p.route, tmp);
  if (/原生全屏/.test(out.stdout || "")) {
    console.log(`   （${p.num} 窗口处于全屏，切回窗口态后重试一次）`);
    await restoreWindowed();
    await sleep(2600);
    out = grab(p.route, tmp);
  }
  const saved = (out.stdout || "").match(/SAVED (\S+)/)?.[1];
  if (!saved) {
    console.log(`!! ${p.num} ${p.image} 截图失败：${(out.stdout || out.stderr || "").trim().slice(0, 120)}`);
    fail++;
    continue;
  }
  const dst = join(IMG, `${p.image}.png`);
  rmSync(dst, { force: true });
  renameSync(saved, dst);
  manifest.push({ ...p, file: `images/${p.image}.png`, tabResult: clicked });
  console.log(`✓ ${p.num.padEnd(6)} ${p.image.padEnd(9)} ${p.route.padEnd(20)} ${p.label || "（默认视图）"}`);
  await sleep(400);
}
writeFileSync(join(here, "shot-manifest.json"), JSON.stringify(manifest, null, 1));
rmSync(tmp, { recursive: true, force: true });
cdp.close();
bcdp.close();
console.log(`\n完成 ${manifest.length}/${todo.length} 张，失败 ${fail}；图片在 docs/guides/images，清单 scripts/manual/shot-manifest.json`);
process.exit(0);

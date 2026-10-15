#!/usr/bin/env node
// 第三轮：空态扫描 + 定点补拍。
//   扫描：node scripts/manual/shoot-state.mjs            → 列出所有"当前视图无数据"的截图点位
//   补拍：node scripts/manual/shoot-state.mjs fix         → 按下方 FIXES 设置业务日期/选中记录后重新截图
// 背景：演示数据落在 2026-10-13，而带日期筛选的页面默认取今天（2026-10-15），首拍容易截到空态。
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const PORT = Number(process.env.PORT || 1234);
const IMG = join(root, "docs/guides/images");
const SKILL = join(process.env.HOME, ".qoder/skills/chrome-tab-screenshot/scripts/chrome_shot.mjs");
const DATA_DATE = process.env.DATA_DATE || "2026-10-13";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 需要补拍的点位：设日期 → 可选选中首条记录 → 重截同名图片
const FIXES = [
  { image: "5-4", route: "/exam", label: "", pick: true },
  { image: "5-4-b", route: "/exam", label: "", pick: true },
  { image: "5-3", route: "/queue", label: "", pick: false },
  { image: "5-13", route: "/analytics", label: "", pick: false },
  { image: "5-1", route: "/dashboard", label: "", pick: false },
  { image: "5-2", route: "/appointments", label: "", pick: false },
  { image: "5-12", route: "/finance", label: "", pick: false },
  { image: "5-6", route: "/reports", label: "", pick: false },
];

const EMPTY = /当前无|暂无|还没有|无数据|未找到|0 位客户|0 条|空列表/;

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
const raw = async (expr) => {
  const r = await cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
};
const ev = async (expr) => JSON.parse(await raw(expr));

const CLICK = (label) => `(() => {
  if (!${JSON.stringify(label)}) return "OK";
  const els = [...document.querySelectorAll(".ops-tabbar > button, .tabs > button, .pt-bottom-nav button, .ks-mode-tabs button")];
  const hit = els.find(e => (e.innerText || "").trim() === ${JSON.stringify(label)});
  return hit ? (hit.click(), "OK") : "MISS";
})()`;

// React 受控输入必须用原生 setter + input/change 事件
const SET_DATE = (val) => `(() => {
  const set = (el, v) => {
    const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    d.set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const ins = [...document.querySelectorAll('input[type="date"]')];
  ins.forEach(e => set(e, ${JSON.stringify(val)}));
  return JSON.stringify({ found: ins.length, values: ins.map(e => e.value) });
})()`;

const PICK_FIRST = `(() => {
  const row = document.querySelector("table tbody tr, .list-row, .queue-row, [class*=row] button");
  if (!row) return "NOROW";
  const btn = row.querySelector("button") || row;
  btn.click();
  return JSON.stringify({ text: (row.innerText || "").replace(/\\s+/g, " ").slice(0, 60) });
})()`;

const SCAN = `(() => {
  const main = document.querySelector("main, .content, .ops-page") || document.body;
  const t = (main.innerText || "").replace(/\\s+/g, " ");
  const rows = main.querySelectorAll("table tbody tr").length;
  const empty = ${EMPTY.toString()};
  const hit = t.match(new RegExp(empty.source, "g")) || [];
  return JSON.stringify({ len: t.length, rows, emptyHits: [...new Set(hit)], snippet: t.slice(0, 220) });
})()`;

const grab = (route, dir) =>
  spawnSync("node", [SKILL, "--port", String(PORT), "--url", `#${route}`, "--page-only", "--dir", dir], { encoding: "utf8" });

const manifest = JSON.parse(readFileSync(join(here, "shot-manifest.json"), "utf8"));
const mode = process.argv[2] === "fix" ? "fix" : "scan";
let cur = null;

if (mode === "scan") {
  const bad = [];
  for (const e of manifest) {
    if (e.route !== cur) {
      await cdp.send("Runtime.evaluate", { expression: `location.hash = "#${e.route}"; 0` });
      await sleep(2400);
      cur = e.route;
    }
    await raw(CLICK(e.label));
    await sleep(1300);
    const s = await ev(SCAN);
    if (s.emptyHits.length || s.len < 900) bad.push({ image: e.image, route: e.route, label: e.label, ...s });
  }
  writeFileSync(join(here, "empty-scan.json"), JSON.stringify(bad, null, 1));
  console.log(`扫描 ${manifest.length} 个点位，疑似空态/信息量不足 ${bad.length} 个：`);
  for (const b of bad) console.log(`  ${b.image.padEnd(10)} ${(b.label || "默认").padEnd(14)} 表格行=${String(b.rows).padStart(3)} 空态词=${b.emptyHits.join(",") || "-"}  ${b.snippet.slice(0, 60)}`);
} else {
  const tmp = join(here, ".shots3");
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  for (const f of FIXES) {
    if (!manifest.some((m) => m.image === f.image) && !existsSync(join(IMG, `${f.image}.png`))) {
      console.log(`跳过 ${f.image}（清单中不存在）`);
      continue;
    }
    await cdp.send("Runtime.evaluate", { expression: `location.hash = "#${f.route}"; 0` });
    await sleep(2500);
    cur = f.route;
    const c = await raw(CLICK(f.label));
    await sleep(1200);
    const d = await ev(SET_DATE(DATA_DATE));
    await sleep(1800);
    const p = f.pick ? await raw(PICK_FIRST) : "-";
    await sleep(1600);
    const out = grab(f.route, tmp);
    let saved = out.stdout?.match(/SAVED (\S+)/)?.[1];
    if (!saved && /原生全屏/.test(out.stdout || "")) {
      const { windowId } = await bcdp.send("Browser.getWindowForTarget", { targetId: tab.id });
      await bcdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "normal" } });
      await sleep(2500);
      saved = grab(f.route, tmp).stdout?.match(/SAVED (\S+)/)?.[1];
    }
    if (!saved) {
      console.log(`!! ${f.image} 失败：${(out.stdout || "").slice(0, 90)}`);
      continue;
    }
    const dst = join(IMG, `${f.image}.png`);
    rmSync(dst, { force: true });
    renameSync(saved, dst);
    const after = await ev(SCAN);
    const m = manifest.find((x) => x.image === f.image);
    if (m) {
      m.demoDate = DATA_DATE;
      m.picked = p;
    }
    console.log(
      `✓ ${f.image.padEnd(9)} ${f.route.padEnd(14)} 日期输入${d.found}个 选中=${String(p).slice(0, 40)} 行数=${after.rows} 空态=${after.emptyHits.join(",") || "无"}`,
    );
    await sleep(400);
  }
  writeFileSync(join(here, "shot-manifest.json"), JSON.stringify(manifest, null, 1));
  rmSync(tmp, { recursive: true, force: true });
}
cdp.close();
bcdp.close();
process.exit(0);

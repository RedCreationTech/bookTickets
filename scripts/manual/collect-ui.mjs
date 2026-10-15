#!/usr/bin/env node
// 逐个路由抓取真实界面骨架（标题、子导航、按钮、表头、下拉选项、站内链接），
// 作为用户手册操作说明与截图点位的依据。只读 DOM，不点任何提交类按钮。
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] || 1234);
const routes = (process.argv[3] || "").split(",").filter(Boolean);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const j = async (u) => (await fetch(u, { signal: AbortSignal.timeout(5000) })).json();
const ver = await j(`http://127.0.0.1:${PORT}/json/version`);
let pages = (await j(`http://127.0.0.1:${PORT}/json/list`)).filter((t) => t.type === "page");
const tab = pages.find((t) => t.url.includes("5173")) || pages[0];
if (!tab) {
  console.log("没找到指向 5173 的标签页");
  process.exit(1);
}
const ws = new WebSocket(tab.webSocketDebuggerUrl);
let seq = 0;
const pend = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pend.has(m.id)) {
    const { ok, fail } = pend.get(m.id);
    pend.delete(m.id);
    m.error ? fail(new Error(m.error.message)) : ok(m.result);
  }
};
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = () => rej(new Error("连不上标签页 CDP"));
});
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++seq;
    pend.set(id, { ok: res, fail: rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
const ev = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return JSON.parse(r.result.value);
};

const DUMP = `(() => {
  const txt = e => (e.innerText || "").trim().replace(/\\s+/g, " ").slice(0, 70);
  const uniq = a => [...new Set(a)].filter(Boolean);
  const pick = (sel, n = 60) => uniq([...document.querySelectorAll(sel)].map(txt)).slice(0, n);
  return JSON.stringify({
    hash: location.hash,
    pageTitle: pick("h1, .page-title, [class*=PageTitle]", 4),
    sections: pick("h2, h3, fieldset legend, .card-title, [class*=card] h3, section > header", 40),
    subnav: pick("nav a, aside a, [class*=segment] button, [class*=chip] button, [class*=tabs] button, [class*=subnav] a, [class*=pill] button", 60),
    links: uniq([...document.querySelectorAll('a[href^="#"]')].map(a => a.getAttribute("href") + " | " + txt(a))).slice(0, 90),
    buttons: pick("button", 70),
    th: pick("thead th", 45),
    labels: pick("label", 45),
    selects: [...document.querySelectorAll("select")].slice(0, 14).map(s => ({
      name: (s.getAttribute("aria-label") || s.name || (s.closest("label")?.innerText || "").trim()).slice(0, 30),
      value: s.options[s.selectedIndex] ? s.options[s.selectedIndex].text : "",
      opts: [...s.options].slice(0, 10).map(o => o.text),
    })),
    scrollH: document.documentElement.scrollHeight,
    innerH: window.innerHeight,
  });
})()`;

const out = {};
const list = routes.length ? routes : ["/dashboard"];
for (const route of list) {
  await send("Runtime.evaluate", { expression: `location.hash = "#${route}"; 0` });
  await sleep(2600);
  try {
    out[route] = await ev(DUMP);
    console.log(
      `${route.padEnd(22)} 标题=${out[route].pageTitle.join("/") || "-"}  子导航=${out[route].subnav.length}  按钮=${out[route].buttons.length}  表头=${out[route].th.length}  链接=${out[route].links.length}`,
    );
  } catch (e) {
    out[route] = { error: e.message };
    console.log(`${route.padEnd(22)} 抓取失败: ${e.message}`);
  }
}
writeFileSync(join(here, "manual-ui.json"), JSON.stringify(out, null, 1));
ws.close();
console.log("已写入 scripts/manual/manual-ui.json");

#!/usr/bin/env node
// 枚举每个路由的页内子页签（.ops-tabbar）与自助/小程序端导航，用于规划截图点位。
const PORT = Number(process.argv[2] || 1234);
const j = async (u) => (await fetch(u, { signal: AbortSignal.timeout(5000) })).json();
const ver = await j(`http://127.0.0.1:${PORT}/json/version`);
const pages = (await j(`http://127.0.0.1:${PORT}/json/list`)).filter((t) => t.type === "page");
const tab = pages.find((t) => t.url.includes("5173")) || pages[0];
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
  ws.onerror = () => rej(new Error("连不上标签页"));
});
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++seq;
    pend.set(id, { ok: res, fail: rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
const ev = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return JSON.parse(r.result.value);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const routes = (process.argv[3] ||
  "/patient,/kiosk,/kiosk?mode=report,/dashboard,/appointments,/queue,/exam,/review,/reports,/health,/enterprise,/services,/commerce,/content,/finance,/analytics,/support,/quality,/settings,/controls")
  .split(",");

const ENUM = `(() => JSON.stringify({
  tabs: [...document.querySelectorAll(".ops-tabbar button")].map(b => b.innerText.trim()),
  h1: [...document.querySelectorAll("h1,.kiosk-title,.pt-title")].map(e => e.innerText.trim().slice(0,40)).slice(0,3),
  nav: [...document.querySelectorAll(".pt-nav button,.pt-tabbar button,.kiosk-nav button,.kiosk-actions button,.seg button")]
        .map(b => b.innerText.trim().slice(0,24)).slice(0,20),
  panels: [...document.querySelectorAll("[class*=panel-title],[class*=card-title] h3,h2")]
        .map(e => e.innerText.trim().slice(0,26)).slice(0,12),
  scrollH: document.documentElement.scrollHeight,
}))()`;

let total = 0;
const out = {};
for (const route of routes) {
  await send("Runtime.evaluate", { expression: `location.hash = "#${route}"; 0` });
  await sleep(2400);
  const d = await ev(ENUM);
  out[route] = d;
  const shots = Math.max(1, d.tabs.length || d.nav.length || 1);
  total += shots;
  console.log(
    `${route.padEnd(20)} 子页签=${String(d.tabs.length).padStart(2)} 端导航=${String(d.nav.length).padStart(2)} → 约${shots}张  ${d.tabs.slice(0, 10).join("、") || d.nav.slice(0, 8).join("、") || "-"}`,
  );
}
console.log("预计截图总数:", total);
const { writeFileSync } = await import("node:fs");
writeFileSync(new URL("./manual-tabs.json", import.meta.url), JSON.stringify(out, null, 1));
ws.close();
process.exit(0);

#!/usr/bin/env node
// 生成撰写素材：每个章节的条款清单、原文★项、页面真实交互说明（去重）与实现状态统计。
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const { sections } = JSON.parse(readFileSync(join(here, "manual-outline.json"), "utf8"));
const ui = JSON.parse(readFileSync(join(here, "manual-ui.json"), "utf8"));
const tg = JSON.parse(readFileSync(join(here, "manual-tabs.json"), "utf8"));

let out = "";
for (const s of sections) {
  out += `\n########## ${s.num} ${s.title}  [${s.route}]  条款${s.clauseCount} 项${s.itemCount}\n`;
  out += `页面标题：${(ui[s.route]?.pageTitle || []).join(" / ") || "-"}\n`;
  out += `区块：${(ui[s.route]?.sections || []).slice(0, 12).join(" | ") || "-"}\n`;
  out += `页签：${(tg[s.route]?.tabs || []).join(" | ") || "（无子页签）"}\n`;
  const st = {};
  for (const c of s.clauses) for (const i of c.items) st[i.status] = (st[i.status] || 0) + 1;
  out += `状态：${Object.entries(st).map(([k, v]) => `${k} ${v}`).join(" / ")}\n`;
  out += `条款：${s.clauses.map((c) => `${c.clause}${c.star ? "★" : ""} ${c.title}(${c.items.length})`).join("；")}\n`;
  const how = [...new Set(s.clauses.flatMap((c) => c.items.map((i) => i.how).filter(Boolean)))];
  out += `交互说明（去重 ${how.length} 条）：\n`;
  for (const h of how) out += `  - ${h}\n`;
  const stars = s.clauses.flatMap((c) => c.items.filter((i) => i.star).map((i) => `${c.clause}${i.sub} ${i.text}`));
  if (stars.length) {
    out += `★实质性条款（${stars.length}）：\n`;
    for (const x of stars) out += `  * ${x}\n`;
  }
}
writeFileSync(join(here, "digest.txt"), out);
console.log("写入 scripts/manual/digest.txt，共", out.split("\n").length, "行");

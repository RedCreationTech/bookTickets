#!/usr/bin/env node
// 让 shot-manifest.json 与「计划 + 磁盘上的图片」对齐：
// 补回分批运行时遗漏的条目、剔除图片已不存在的条目、按计划顺序排列，保留滚动轮追加的 part 条目。
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPlan } from "./plan.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const outline = JSON.parse(readFileSync(join(here, "manual-outline.json"), "utf8")).sections;
const tabs = JSON.parse(readFileSync(join(here, "manual-tabs.json"), "utf8"));
const old = existsSync(join(here, "shot-manifest.json"))
  ? JSON.parse(readFileSync(join(here, "shot-manifest.json"), "utf8"))
  : [];

const plan = buildPlan(outline, tabs);
const byImage = new Map(old.map((m) => [m.image, m]));
const out = [];
for (const item of plan) {
  const has = existsSync(join(here, "../../docs/guides/images", `${item.image}.png`));
  if (!has) continue;
  out.push({ ...item, ...(byImage.get(item.image) || {}), file: `images/${item.image}.png`, part: (byImage.get(item.image) || {}).part || undefined });
  byImage.delete(item.image);
}
// 追加轮次里生成的续图（5-2-1-b 之类），按前缀归位
const extras = [...byImage.values()].filter((m) => existsSync(join(here, "../../docs/guides/images", `${m.image}.png`)));
extras.sort((a, b) => a.image.localeCompare(b.image, undefined, { numeric: true }));
const merged = [];
for (const m of out) {
  merged.push(m);
  for (const x of extras.filter((e) => e.image.startsWith(m.image + "-") && !e.image.slice(m.image.length + 1).includes("-"))) merged.push(x);
}
const left = extras.filter((e) => !merged.includes(e));
writeFileSync(join(here, "shot-manifest.json"), JSON.stringify([...merged, ...left], null, 1));
console.log(`计划点位 ${plan.length}，磁盘已截 ${merged.filter((m) => !m.part).length + left.filter((m) => !m.part).length}，清单条目 ${merged.length + left.length}（含续图 ${merged.filter((m) => m.part).length + left.filter((m) => m.part).length}）`);
const missing = plan.filter((x) => !merged.some((m) => m.image === x.image) && !left.some((m) => m.image === x.image));
console.log(missing.length ? "缺图点位: " + missing.map((m) => `${m.image}(${m.route} ${m.label || "默认"})`).join(", ") : "无缺图点位");

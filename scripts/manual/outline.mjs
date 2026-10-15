#!/usr/bin/env node
// 由招标「2.2 软件技术参数」核对项（src/data/requirements.json）生成用户手册骨架：
// 章节 → 页面路由 → 条款组 → 逐条核对项，并预分配截图编号。
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import req from "../../src/data/requirements.json" with { type: "json" };

const here = dirname(fileURLToPath(import.meta.url));

// 手册章节顺序：先三个自助/客户端，再按后台导航分组列出 17 个页面
const chapters = [
  { no: 2, title: "微信小程序端（患者与健康管理师）", route: "/patient" },
  { no: 3, title: "体检自助机端（导检单打印与项目定制）", route: "/kiosk" },
  { no: 4, title: "报告自助打印端（报告打印与装订）", route: "/kiosk?mode=report" },
  {
    no: 5,
    title: "运营管理后台",
    routes: [
      "/dashboard",
      "/appointments",
      "/queue",
      "/exam",
      "/review",
      "/reports",
      "/health",
      "/enterprise",
      "/services",
      "/commerce",
      "/content",
      "/finance",
      "/analytics",
      "/support",
      "/quality",
      "/settings",
      "/controls",
    ],
  },
];

const navName = {
  "/dashboard": "运营概览",
  "/appointments": "预约与登记",
  "/queue": "智能导检",
  "/exam": "分检工作站",
  "/review": "总检审核",
  "/reports": "报告中心",
  "/health": "健康管理",
  "/enterprise": "企业健康",
  "/services": "医生与服务",
  "/commerce": "健康商城",
  "/content": "内容与消息",
  "/finance": "财务结算",
  "/analytics": "工作量统计",
  "/support": "客户服务",
  "/quality": "质控与追踪",
  "/settings": "系统配置",
  "/controls": "通知与专项质控",
  "/patient": "微信小程序端",
  "/kiosk": "体检自助机",
  "/kiosk?mode=report": "报告自助打印端",
};

const soft = req.filter((r) => r.clause.startsWith("2.2"));
const byRoute = new Map();
for (const r of soft) {
  if (!byRoute.has(r.route)) byRoute.set(r.route, []);
  byRoute.get(r.route).push(r);
}

const clauseNo = (c) => c.split(".").map(Number);
const sections = [];
for (const ch of chapters) {
  for (const route of ch.routes || [ch.route]) {
    const items = byRoute.get(route) || [];
    byRoute.delete(route);
    const groups = new Map();
    for (const it of items) {
      if (!groups.has(it.clause)) groups.set(it.clause, []);
      groups.get(it.clause).push(it);
    }
    const clauses = [...groups.entries()]
      .sort((a, b) => clauseNo(a[0]) - clauseNo(b[0]) || 0)
      .map(([clause, list]) => ({
        clause,
        title: list[0].title,
        star: list.some((x) => x.star),
        items: list.map((x) => ({
          id: x.id,
          sub: x.subitem,
          star: !!x.star,
          text: x.text,
          status: x.status,
          how: x.interaction,
        })),
      }));
    const no = ch.no === 5 ? sections.filter((s) => s.chapter === 5).length + 1 : 1;
    sections.push({
      chapter: ch.no,
      section: ch.no === 5 ? no : undefined,
      num: ch.no === 5 ? `5.${no}` : `${ch.no}`,
      title: ch.no === 5 ? `${navName[route]}（${route}）` : ch.title,
      route,
      clauses,
      itemCount: items.length,
      clauseCount: clauses.length,
      image: ch.no === 5 ? `${ch.no}-${no}` : `${ch.no}`,
    });
  }
}

const left = [...byRoute.entries()].map(([r, l]) => `${r}:${l.length}`);
writeFileSync(
  join(here, "manual-outline.json"),
  JSON.stringify({ generatedFrom: "src/data/requirements.json", softwareItems: soft.length, sections }, null, 1),
);

console.log("软件核对项:", soft.length, "条款:", new Set(soft.map((r) => r.clause)).size);
for (const s of sections)
  console.log(
    `${s.num.padEnd(5)} ${s.image.padEnd(6)} ${s.route.padEnd(20)} 条款${String(s.clauseCount).padStart(3)} 项${String(s.itemCount).padStart(4)}  ${s.title}`,
  );
console.log("未被章节覆盖的路由:", left.length ? left.join(" ") : "无");

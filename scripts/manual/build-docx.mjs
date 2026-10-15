#!/usr/bin/env node
// 生成 docs/guides/用户使用手册.docx
// 数据来源：manual-outline.json（条款→页面）、manual-tabs.json（子页签）、shot-manifest.json（截图）、
//          content.mjs（人工撰写说明）、src/data/requirements.json（原文与状态）。
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  convertMillimetersToTwip,
} from "docx";
import { chapter1, sections as prose, statusLabel } from "./content.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const OUT = join(root, "docs/guides/用户使用手册.docx");
const IMGDIR = join(root, "docs/guides/images");

const { sections } = JSON.parse(readFileSync(join(here, "manual-outline.json"), "utf8"));
const tabs = JSON.parse(readFileSync(join(here, "manual-tabs.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(here, "shot-manifest.json"), "utf8"));
const req = JSON.parse(readFileSync(join(root, "src/data/requirements.json"), "utf8"));

const FONT = { ascii: "Calibri", hAnsi: "Calibri", eastAsia: "宋体" };
const HFONT = { ascii: "Calibri", hAnsi: "Calibri", eastAsia: "黑体" };
const CONTENT_W_PX = 600; // A4 210mm − 左右各 25mm ≈ 160mm ≈ 600px@96dpi

const pngSize = (buf) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) });

// 文档内嵌用降采样副本（原图仍保留在 docs/guides/images），避免 docx 体积失控。
// 缓存键必须含 mtime 与大小，否则同名图片被重截后会命中旧缓存。
const embedCopy = (src, name) => {
  const { mtimeMs, size } = statSync(src);
  const cache = join(tmpdir(), "manual-img-cache");
  mkdirSync(cache, { recursive: true });
  const dst = join(cache, `${name.replace(/\.png$/, "")}.${Math.round(mtimeMs)}.${size}.png`);
  if (!existsSync(dst)) {
    const ff = process.env.FFMPEG || join(homedir(), "tools/ffmpeg/ffmpeg");
    const r = spawnSync(ff, ["-hide_banner", "-loglevel", "error", "-y", "-i", src, "-vf", "scale='min(iw,1400)':-2", dst], { encoding: "utf8" });
    if (r.status !== 0 || !existsSync(dst)) return src;
  }
  return dst;
};
const run = (text, o = {}) => new TextRun({ text, font: FONT, size: 21, ...o });
const p = (text, o = {}) =>
  new Paragraph({ children: [run(text, o.run || {})], spacing: { after: 120, line: 300 }, ...o.para });
const h1 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    pageBreakBefore: true,
    children: [new TextRun({ text, font: HFONT, size: 32, bold: true, color: "1F3864" })],
    spacing: { after: 200 },
  });
const h2 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text, font: HFONT, size: 26, bold: true, color: "2E5496" })],
    spacing: { before: 200, after: 120 },
  });
const h3 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_3,
    children: [new TextRun({ text, font: HFONT, size: 22, bold: true, color: "404040" })],
    spacing: { before: 140, after: 80 },
  });

const border = { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" };
const cell = (text, { w, bold = false, shade = null, size = 17, align = null } = {}) =>
  new TableCell({
    width: { size: w, type: WidthType.PERCENTAGE },
    shading: shade ? { type: ShadingType.CLEAR, fill: shade } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 50, bottom: 50, left: 80, right: 80 },
    children: [
      new Paragraph({
        alignment: align,
        spacing: { after: 0, line: 240 },
        children: [new TextRun({ text: String(text ?? ""), font: FONT, size, bold })],
      }),
    ],
  });

const table = (widths, header, rows) =>
  new Table({
    layout: TableLayoutType.FIXED,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows: [
      new TableRow({
        tableHeader: true,
        children: header.map((t, i) => cell(t, { w: widths[i], bold: true, shade: "DEEAF6", size: 18 })),
      }),
      ...rows.map((r) => new TableRow({ children: r.map((t, i) => cell(t, { w: widths[i] })) })),
    ],
  });

const image = (file, caption, portrait = false) => {
  const path = join(IMGDIR, file);
  if (!existsSync(path)) {
    return [p(`（缺少截图 ${file}）`, { run: { color: "C00000", bold: true } })];
  }
  const buf = readFileSync(embedCopy(path, file));
  const { w, h } = pngSize(buf);
  // 横版按页宽铺满；竖版（手机端）按高度限制，保持手机比例不至于占满整页
  let width, height;
  if (portrait && h > w) {
    height = 430;
    width = Math.round((w * height) / h);
  } else {
    width = CONTENT_W_PX;
    height = Math.round((CONTENT_W_PX * h) / w);
  }
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 40 },
      children: [new ImageRun({ type: "png", data: buf, transformation: { width, height } })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
      children: [new TextRun({ text: caption, font: FONT, size: 18, color: "595959" })],
    }),
  ];
};

const shotsOf = (num) => manifest.filter((m) => m.num === num || m.num.startsWith(num + "."));
const clauseTag = (c, sub) => `${c}${sub && sub !== "—" ? " " + sub : ""}`;

const body = [];

/* ---------- 封面 ---------- */
body.push(
  new Paragraph({ spacing: { before: 1600, after: 200 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: "数字化健康体检一体化管理软件", font: HFONT, size: 52, bold: true, color: "1F3864" })] }),
  new Paragraph({ spacing: { after: 900 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: "用 户 使 用 手 册", font: HFONT, size: 40, bold: true, color: "2E5496" })] }),
  new Paragraph({ spacing: { after: 120 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: "（对应招标文件第四章 2.2 软件技术参数，共 204 条款 / 778 个技术核对项）", font: FONT, size: 22 })] }),
  new Paragraph({ spacing: { after: 1200 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: "青岛市中医医院 · SDGP370200000202602001245（A 包）", font: FONT, size: 22, color: "595959" })] }),
);
body.push(
  table(
    [22, 28, 22, 28],
    ["项目", "内容", "项目", "内容"],
    [
      ["文档名称", "用户使用手册", "文档版本", "V1.0"],
      ["编制日期", new Date().toISOString().slice(0, 10), "适用对象", "使用 / 验收 / 运维人员"],
      ["需求依据", "招标文件第四章 2.2 节", "软件条款覆盖", "204 条款 / 778 核对项"],
      ["界面来源", "本机 Chrome 实际页面截图", "截图数量", `${manifest.length} 张`],
      ["数据说明", "全部为浏览器本地合成演示数据", "部署形态", "纯前端演示（未接院内系统）"],
    ],
  ),
);

/* ---------- 目录（静态） ---------- */
body.push(h1("目录"));
const tocRows = [
  ["第 1 章", "使用说明与系统概述", "1.1 – 1.6"],
  ["第 2 章", "微信小程序端（患者与健康管理师）", "2"],
  ["第 3 章", "体检自助机端（导检单打印与项目定制）", "3"],
  ["第 4 章", "报告自助打印端（报告打印与装订）", "4"],
  ["第 5 章", "运营管理后台", "5.1 – 5.17"],
  ["附录 A", "技术规格要求逐条应答对照表（945 项，含覆盖性汇总）", "A.1 – A.3"],
  ["附录 B", "技术参数条款 → 手册章节 快速索引（204 条款）", "B"],
  ["附录 C", "实现状态口径与验收注意事项", "C"],
];
for (const r of tocRows) {
  body.push(
    new Paragraph({
      spacing: { after: 60 },
      children: [
        new TextRun({ text: `${r[0]}  `, font: FONT, size: 22, bold: true }),
        new TextRun({ text: r[1], font: FONT, size: 22 }),
        new TextRun({ text: `  ······ ${r[2]}`, font: FONT, size: 22, color: "808080" }),
      ],
    }),
  );
}
body.push(p("说明：本手册按功能页面组织，每个页面小节内以表格逐条列出该页面覆盖的技术参数条款；文档末尾附录 A 为全部 945 个技术规格核对项的逐条应答对照表（含覆盖性汇总），附录 B 为条款级快速索引。", { run: { size: 19, color: "595959" } }));

/* ---------- 第 1 章 ---------- */
body.push(h1("第 1 章  使用说明与系统概述"));
for (const s of chapter1) {
  body.push(h2(s.h));
  for (const t of s.p) body.push(p(t));
}

/* ---------- 第 2–5 章 ---------- */
const chapterTitles = {
  2: "第 2 章  微信小程序端（患者与健康管理师）",
  3: "第 3 章  体检自助机端（导检单打印与项目定制）",
  4: "第 4 章  报告自助打印端（报告打印与装订）",
  5: "第 5 章  运营管理后台",
};
let openedChapter = null;
for (const s of sections) {
  const ch = String(s.chapter);
  if (ch !== openedChapter) {
    openedChapter = ch;
    body.push(h1(chapterTitles[ch]));
    if (ch === "5")
      body.push(
        p("本章按后台左侧导航顺序逐页说明，共 17 个页面。每个页面小节给出：功能定位、进入方式、界面截图（含各子页签）、操作步骤、注意事项，以及该页面覆盖的技术参数逐条对应表。"),
      );
  }
  const proseSec = prose[s.num] || {};
  // 第 2–4 章的章名即页面名，不再重复一节标题；第 5 章按 5.x 分节
  if (ch === "5") body.push(h2(`${s.num}  ${s.title}`));
  if (proseSec.purpose) body.push(p("功能定位：" + proseSec.purpose));
  if (proseSec.entry) body.push(p("进入方式：" + proseSec.entry));

  const tabList = tabs[s.route]?.tabs || [];
  const shots = shotsOf(s.num);
  if (shots.length) {
    body.push(h3("界面截图"));
    const kind = tabs[s.route]?.tabs?.length ? "子页签" : "导航";
    const base = s.title.replace(/（.*）/, "");
    for (const sh of shots) {
      const phone = sh.orientation === "portrait";
      let cap = `图 ${sh.image}  ${base}` + (sh.label ? ` — ${kind}「${sh.label}」` : "（默认视图）");
      if (phone) cap += sh.part ? `（手机竖屏 · 第 ${sh.part} 屏，接上图）` : "（手机竖屏 · 首屏）";
      else if (sh.part) cap += `（第 ${sh.part} 屏 · 上一图未显示完的部分）`;
      body.push(...image(`${sh.image}.png`, cap, phone));
    }
  }
  if (proseSec.steps?.length) {
    body.push(h3("操作步骤"));
    proseSec.steps.forEach((t, i) => body.push(p(`步骤 ${i + 1}　${t}`, { para: { indent: { left: convertMillimetersToTwip(5) } } })));
  }
  if (proseSec.notes?.length) {
    body.push(h3("注意事项"));
    for (const n of proseSec.notes) body.push(p("· " + n, { para: { indent: { left: convertMillimetersToTwip(5) } } }));
  }

  if (s.clauseCount) {
    body.push(h3(`技术参数逐条对应（${s.clauseCount} 个条款 / ${s.itemCount} 个核对项）`));
    const rows = [];
    for (const c of s.clauses)
      for (const it of c.items)
        rows.push([
          clauseTag(c.clause, it.sub),
          it.text,
          statusLabel[it.status] || it.status,
          it.how || "—",
        ]);
    body.push(table([13, 33, 10, 44], ["条款号", "需求条目（招标原文）", "状态", "系统内的实际操作"], rows));
  } else {
    body.push(p("本节对应的招标文件 2.3 节硬件参数（整机、触摸屏、打印装订机构等）不属于 2.2 软件技术参数范围，故不在此逐条列出；软件侧操作见上方步骤。", { run: { size: 19, color: "595959" } }));
  }
}

/* ---------- 附录 A 技术规格要求逐条应答对照表 ---------- */
const MODULES = [
  ["2.2.1", "检前模块"],
  ["2.2.2", "检中模块"],
  ["2.2.3", "智能导检模块"],
  ["2.2.4", "健康管理模块（含企业健康、医生服务、商城、社区、客服、系统管理）"],
  ["2.3.1", "配套硬件：体检自助机一体机"],
  ["2.3.2", "配套硬件：报告自助打印装订机"],
];
const ANS = {
  demonstrated: "满足（可现场演示）",
  partial: "部分满足（边界见备注）",
  "config-only": "满足（配置实现，效果在业务页验证）",
  "hardware-unverifiable": "依赖硬件/接口，现场联调验证",
};
const secOf = new Map();
for (const s of sections) secOf.set(s.route, s);
const figRef = (num) => {
  const imgs = manifest.filter((m) => m.num === num || m.num.startsWith(num + "."));
  const tops = [...new Set(imgs.map((m) => m.image.replace(/-[bcd]$/, "")))];
  const extra = imgs.length - tops.length;
  return tops.length ? "图 " + tops.join("、") + (extra ? `（另含 ${extra} 张续图）` : "") : "—";
};
const where = (r) => {
  const s = secOf.get(r.route);
  if (!s) return { sec: "—", fig: "—" };
  const label = s.num.startsWith("5.") ? `第 5 章 ${s.num} 节` : `第 ${s.num} 章`;
  return { sec: label, fig: figRef(s.num) };
};
const all = req.filter((r) => r.clause.startsWith("2.2") || r.clause.startsWith("2.3"));
const clauseTitle = new Map(req.map((r) => [r.clause, r.title]));

body.push(h1("附录 A  技术规格要求逐条应答对照表"));
body.push(
  p("本表把招标文件第四章 2.2 节《数字化健康体检一体化管理软件技术参数》与 2.3 节《配套硬件技术要求》的每一个核对项，逐条对应到本手册的章节与界面截图，用于证明技术规格要求已全部纳入本方案说明范围。「应答结论」依据本机演示环境的实际覆盖矩阵（src/data/requirements.json，与系统内「需求覆盖」页一致），未对本机无法验证的接口与外设作满足性声明。"),
);
body.push(h2("A.1 覆盖性汇总"));
const sumRows = MODULES.map(([pre, name]) => {
  const list = all.filter((r) => r.clause.startsWith(pre));
  const clauses = new Set(list.map((r) => r.clause)).size;
  const secs = [...new Set(list.map((r) => secOf.get(r.route)?.num).filter(Boolean))];
  const covered = list.filter((r) => secOf.has(r.route)).length;
  return [
    name,
    String(clauses),
    String(list.length),
    secs.length > 6 ? `第 ${secs[0].split(".")[0]} 章 ${secs.length} 个小节` : secs.join("、") || "—",
    `${covered}/${list.length}`,
    covered === list.length ? "全部已列示" : `未列示 ${list.length - covered}`,
  ];
});
const totalClauses = new Set(all.map((r) => r.clause)).size;
sumRows.push(["合计", String(totalClauses), String(all.length), "第 2–5 章 + 附录", `${all.filter((r) => secOf.has(r.route)).length}/${all.length}`, "全部已列示"]);
body.push(
  table([26, 7, 9, 22, 10, 16], ["需求模块", "条款数", "核对项", "对应手册章节", "已列示", "覆盖结论"], sumRows),
);
body.push(p("注：「已列示」指该核对项在手册正文对应页面小节的逐条对应表、或本附录 A.2/A.3 中占有一行，并给出界面截图编号；不代表已满足全部原文边界。", { run: { size: 18, color: "595959" } }));

body.push(h2("A.2 软件技术参数逐条对照（2.2 节，778 项）"));
body.push(
  p("「备注」仅对部分满足、仅配置实现与依赖硬件的条目给出实现边界；标注「满足（可现场演示）」的条目其更细的能力边界可在系统内「需求覆盖」页（#/coverage）与 docs/coverage-matrix.md 中按同一序号核对。", { run: { size: 18, color: "595959" } }),
);
const noteOf = (r) => {
  if (r.status === "demonstrated") return "—";
  const b = r.boundary || "";
  return b ? b.slice(0, 110) + (b.length > 110 ? "…" : "") : "—";
};
const rowsOf = (list) =>
  list.map((r) => {
    const w = where(r);
    return [
      r.id,
      r.clause + (r.star ? " ★" : "") + (r.subitem && !r.subitem.includes("★") ? " " + r.subitem : ""),
      clauseTitle.get(r.clause) || "",
      r.text,
      ANS[r.status] || r.status,
      w.sec + "\n" + w.fig,
      noteOf(r),
    ];
  });
const softList = all.filter((r) => r.clause.startsWith("2.2"));
body.push(
  table([7, 11, 11, 28, 13, 13, 17], ["序号", "条款号", "条款名称", "技术规格要求（原文）", "应答结论", "手册位置与截图", "备注（实现边界）"], rowsOf(softList)),
);
body.push(h2("A.3 配套硬件技术要求逐条对照（2.3 节，167 项）"));
body.push(p("硬件参数（整机、触摸屏、打印装订机构、读卡器、工控机等）由自助机整机供货并在现场验收，本手册第 3、4 章说明与之对应的自助机软件界面与操作流程。此处逐条列出以便整体核对。", { run: { size: 19 } }));
body.push(
  table([7, 11, 11, 28, 13, 13, 17], ["序号", "条款号", "条款名称", "技术规格要求（原文）", "应答结论", "手册位置与截图", "备注（实现边界）"], rowsOf(all.filter((r) => r.clause.startsWith("2.3")))),
);

/* ---------- 附录 B 条款级索引 ---------- */
body.push(h1("附录 B  技术参数条款 → 手册章节 快速索引"));
body.push(p("按条款号检索该条款在手册中的位置与核对项统计，★为实质性条款。逐条应答明细见附录 A。"));
const byClause = new Map();
for (const s of sections)
  for (const c of s.clauses) {
    if (!byClause.has(c.clause)) byClause.set(c.clause, { title: c.title, star: false, where: [], items: 0, st: {} });
    const e = byClause.get(c.clause);
    e.where.push(s.num);
    e.items += c.items.length;
    e.star ||= c.star;
    for (const it of c.items) e.st[it.status] = (e.st[it.status] || 0) + 1;
  }
const key = (x) => x.split(".").map(Number);
const cn = (a) =>
  [...new Set(a)]
    .sort((x, y) => {
      const [p, q] = [key(x), key(y)];
      return (p[0] - q[0]) || ((p[1] || 0) - (q[1] || 0)) || ((p[2] || 0) - (q[2] || 0));
    })
    .join("、");
const appA = [...byClause.entries()]
  .sort((a, b) => {
    const [p, q] = [key(a[0]), key(b[0])];
    return (p[0] - q[0]) || (p[1] - q[1]) || (p[2] - q[2]) || (p[3] || 0) - (q[3] || 0);
  })
  .map(([c, e]) => [
    c + (e.star ? " ★" : ""),
    e.title,
    "第 " + (e.where[0].startsWith("5.") ? "5" : e.where[0].split(".")[0]) + " 章 " + cn(e.where) + " 节",
    String(e.items),
    Object.entries(e.st).map(([k, v]) => `${statusLabel[k] || k} ${v}`).join("；"),
  ]);
body.push(table([11, 22, 22, 8, 37], ["条款号", "条款名称", "手册位置", "核对项", "实现状态统计"], appA));

/* ---------- 附录 C ---------- */
body.push(h1("附录 C  实现状态口径与验收注意事项"));
const st = {};
for (const r of req.filter((x) => x.clause.startsWith("2.2"))) st[r.status] = (st[r.status] || 0) + 1;
body.push(p("本手册「状态」列取自需求覆盖矩阵 src/data/requirements.json，与 /coverage 页面一致，口径如下："));
body.push(
  table(
    [22, 78],
    ["状态", "含义与验收提示"],
    [
      ["已演示", "页面内有可操作的完整路径，可用合成数据现场演示并核对结果。"],
      ["部分实现", "已覆盖该条的一部分，边界见覆盖矩阵 boundary 字段；验收时应逐条确认未覆盖范围是否属于本期交付。"],
      ["仅配置项", "该条体现为系统配置参数（如字典、模板、权限），其效果需到对应业务页面验证。"],
      ["依赖硬件，本机不可验证", "需连接读卡器、打印机、装订机构等外设或院内接口才能验证，见招标文件 2.3 节与接口依赖索引。"],
    ],
  ),
);
body.push(h2("C.1 软件核对项状态分布"));
body.push(
  table(
    [30, 14, 56],
    ["状态", "核对项数", "说明"],
    Object.entries(st).map(([k, v]) => [statusLabel[k] || k, String(v), "占 778 个软件核对项的 " + ((v / 778) * 100).toFixed(1) + "%"]),
  ),
);
body.push(h2("C.2 验收前准备"));
for (const t of [
  "启动演示环境：npm ci && npm run dev，浏览器访问 http://127.0.0.1:5173/。",
  "培训或验收演示前先点「重置演示」，避免上一轮数据影响统计口径。",
  "多端联动核对：同一浏览器内切换 H5、自助机与后台，数据即时共享（localStorage 键 hongchuang.health.demo.v1）。",
  "涉及接口与外设的条款需在实施阶段与院内 HIS/LIS/PACS、短信平台、支付通道联调后验证，本演示环境仅模拟流程。",
  "★实质性条款共 10 处，对应手册小节见附录 A.2 中带 ★ 的行；不满足将导致投标无效，验收时优先核对。",
])
  body.push(p("· " + t, { para: { indent: { left: convertMillimetersToTwip(5) } } }));

/* ---------- 组装 ---------- */
const doc = new Document({
  creator: "红创 HEALTH 演示项目组",
  title: "数字化健康体检一体化管理软件 用户使用手册",
  description: "对应招标文件第四章 2.2 软件技术参数逐条说明",
  styles: {
    default: {
      document: { run: { font: FONT, size: 21 }, paragraph: { spacing: { line: 300 } } },
    },
  },
  sections: [
    {
      properties: {
        page: {
          margin: {
            top: convertMillimetersToTwip(25),
            bottom: convertMillimetersToTwip(22),
            left: convertMillimetersToTwip(25),
            right: convertMillimetersToTwip(25),
          },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" } },
              children: [new TextRun({ text: "数字化健康体检一体化管理软件 · 用户使用手册", font: FONT, size: 17, color: "808080" })],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: "第 ", font: FONT, size: 17, color: "808080" }),
                new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 17, color: "808080" }),
                new TextRun({ text: " 页 / 共 ", font: FONT, size: 17, color: "808080" }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 17, color: "808080" }),
                new TextRun({ text: " 页", font: FONT, size: 17, color: "808080" }),
              ],
            }),
          ],
        }),
      },
      children: body,
    },
  ],
});

const buf = await Packer.toBuffer(doc);
writeFileSync(OUT, buf);
console.log("已生成", OUT, (buf.length / 1024 / 1024).toFixed(1) + " MB");
console.log("章节数:", sections.length, "截图:", manifest.length, "逐条表行数:", appA.length, "个条款");

import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  HeadingLevel,
  WidthType,
  AlignmentType,
  PageBreak,
} from "docx";
import type { GroupReport } from "./groupReportRules";
// Set every OOXML script slot explicitly: Heading1's default theme otherwise overrides
// document defaults in some Word-compatible renderers and can lose CJK glyphs.
const reportFont = {
  ascii: "Noto Sans CJK SC",
  hAnsi: "Noto Sans CJK SC",
  eastAsia: "Noto Sans CJK SC",
  cs: "Noto Sans CJK SC",
  hint: "eastAsia",
};
const reportLanguage = { value: "zh-CN", eastAsia: "zh-CN" };
const reportRun = { font: reportFont, language: reportLanguage };
function table(headers: string[], rows: (string | number)[][]) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headers, ...rows].map(
      (row, index) =>
        new TableRow({
          tableHeader: index === 0,
          children: row.map(
            (text) =>
              new TableCell({
                shading: index === 0 ? { fill: "E8F1EE" } : undefined,
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        ...reportRun,
                        text: String(text),
                        bold: index === 0,
                        size: 20,
                      }),
                    ],
                  }),
                ],
              }),
          ),
        }),
    ),
  });
}
export function groupReportDocument(
  report: GroupReport,
  title: string,
  snapshotId: string,
  createdAt: string,
) {
  const heading = (text: string) =>
    new Paragraph({
      children: [
        new TextRun({
          ...reportRun,
          text,
          bold: true,
          size: 28,
          color: "267968",
        }),
      ],
      heading: HeadingLevel.HEADING_1,
      keepNext: true,
      spacing: { before: 240, after: 120 },
    });
  const text = (value: string) =>
    new Paragraph({
      children: [new TextRun({ ...reportRun, text: value, size: 22 })],
      spacing: { after: 140 },
    });
  return new Document({
    creator: "红创健康体检本地演示",
    title,
    description: "基于合成人群快照的可编辑团检报告，不用于医疗诊断",
    styles: {
      default: {
        document: {
          run: { ...reportRun, size: 22 },
          paragraph: { spacing: { after: 120 } },
        },
        title: {
          run: { ...reportRun, size: 36, bold: true, color: "223E43" },
          paragraph: { spacing: { before: 180, after: 220 } },
        },
        heading1: {
          run: { ...reportRun, size: 28, bold: true, color: "267968" },
          paragraph: { keepNext: true, spacing: { before: 240, after: 120 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1100, bottom: 1100, left: 1000, right: 1000 },
          },
        },
        children: [
          new Paragraph({
            children: [
              new TextRun({
                ...reportRun,
                text: "红创 · 单位团体健康分析",
                color: "267968",
                bold: true,
                size: 34,
              }),
            ],
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            children: [
              new TextRun({
                ...reportRun,
                text: title,
                size: 36,
                bold: true,
                color: "223E43",
              }),
            ],
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
          }),
          text(
            `单位：${report.company}  |  快照：${snapshotId}  |  生成：${createdAt}`,
          ),
          text(
            "本文件为可编辑的真实 DOCX 格式。全部数据为本地合成演示，统计与阈值不用于医疗诊断或真实决策。",
          ),
          heading("一、纳入人群与统计口径"),
          text(report.boundary),
          text(
            `筛选条件：${Object.entries(report.filters)
              .map(
                ([key, value]) =>
                  `${({ company: "单位", from: "开始日期", to: "结束日期", sex: "性别", marriage: "婚姻", ageMin: "最小年龄", ageMax: "最大年龄", packageId: "套餐编号", department: "部门" } as Record<string, string>)[key]}=${value || "不限"}`,
              )
              .join("；")}`,
          ),
          text(
            `去重纳入 ${report.population.length} 人；完成体检订单 ${report.population.length} 份；勾选异常 ${report.selectedAbnormalities.join("、") || "无"}。`,
          ),
          table(
            ["性别", "人数", "占比"],
            report.sexDistribution.map((r) => [
              r.name,
              r.count,
              report.population.length
                ? `${((r.count / report.population.length) * 100).toFixed(1)}%`
                : "无分母",
            ]),
          ),
          heading("二、所选异常检出分布"),
          table(
            ["异常名称", "检出人数", "可判读分母", "检出率"],
            report.summary.map((r) => [
              r.name,
              r.count,
              r.denominator,
              r.denominator
                ? `${((r.count / r.denominator) * 100).toFixed(1)}%`
                : "未知",
            ]),
          ),
          heading(`三、男性 / 女性各前 ${report.topN} 项异常`),
          table(
            ["性别", "序号", "异常", "人数"],
            [
              ...report.maleTop.map((r, i) => ["男", i + 1, r.name, r.count]),
              ...report.femaleTop.map((r, i) => ["女", i + 1, r.name, r.count]),
            ],
          ),
          heading("四、三高合成规则分析"),
          text(
            "血糖 >6.1；血压 ≥140/90；血脂明确异常文本。三高项目均可判读人数为联合分析分母；不将缺失结果当作正常。此处按完整人群全部三高规则，不受勾选附件异常影响。",
          ),
          table(
            ["合成指标", "检出人数", "可判读人数"],
            report.threeHigh.counts.map((r) => [
              r.name,
              r.count,
              r.denominator,
            ]),
          ),
          text(
            `任一指标检出：${report.threeHigh.any} 人；三项同时检出：${report.threeHigh.allThree} 人；三项均可判读：${report.threeHigh.fullyKnown} 人。`,
          ),
          new Paragraph({ children: [new PageBreak()] }),
          heading("附件一、纳入名单与实际结论"),
          table(
            ["体检号", "姓名/性别", "日期/部门", "实际总检结论"],
            report.population.map((p) => [
              p.appointmentId,
              `${p.name}/${p.sex}`,
              `${p.date}/${p.department}`,
              p.conclusion,
            ]),
          ),
          heading("附件二、所选阳性明细"),
          table(
            ["姓名", "异常", "项目结果", "演示级别"],
            report.abnormalities.map((r) => [
              r.name,
              r.abnormality,
              `${r.item}：${r.value}`,
              r.critical ? "演示危急值" : "一般演示异常",
            ]),
          ),
          heading("附件三、医生显式重大阳性小结"),
          ...report.majorPositive.map((r) =>
            text(`${r.name}（${r.appointmentId}）：${r.level}；${r.text}`),
          ),
          text(
            "以上结论保留已记录原文。未记录结论明确显示缺失，不自动生成临床诊疗建议。",
          ),
        ],
      },
    ],
  });
}
export async function createGroupReportDocx(
  report: GroupReport,
  title: string,
  snapshotId: string,
  createdAt: string,
) {
  return Packer.toArrayBuffer(
    groupReportDocument(report, title, snapshotId, createdAt),
  );
}
export async function downloadGroupReportDocx(
  report: GroupReport,
  title: string,
  snapshotId: string,
  createdAt: string,
) {
  const buffer = await createGroupReportDocx(
    report,
    title,
    snapshotId,
    createdAt,
  );
  const url = URL.createObjectURL(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${title.replace(/[\\/:*?"<>|]/g, "_")}.docx`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

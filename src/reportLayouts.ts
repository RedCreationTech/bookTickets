import type { Appointment, DemoState } from "./model";
import { clinicalItems } from "./clinicalRules";
import { getReportTemplate } from "./modules/ReviewTools";
export const REPORT_LAYOUTS = [
  { id: "standard", name: "标准健康报告", layout: "linear" },
  { id: "employment", name: "入职体检报告", layout: "compact" },
  { id: "driver", name: "驾驶员体检报告", layout: "cards" },
  { id: "seafarer", name: "海员体检报告", layout: "cards" },
  { id: "occupational", name: "职业病体检报告", layout: "compact" },
  { id: "vip", name: "VIP体检报告", layout: "cover" },
] as const;
export type ReportLayoutId = (typeof REPORT_LAYOUTS)[number]["id"];
export interface ReportSection {
  key: string;
  heading: string;
  lines: string[];
  pageBreakBefore?: boolean;
}
export function getReportLayout(
  state: DemoState,
  order: Appointment,
  layoutId: ReportLayoutId = "standard",
) {
  const definition =
    REPORT_LAYOUTS.find((r) => r.id === layoutId) || REPORT_LAYOUTS[0];
  const patient = state.patients.find((p) => p.id === order.patientId)!;
  const template = getReportTemplate(state, order);
  const resultItems = clinicalItems(state, order);
  const customer: ReportSection = {
    key: "customer",
    heading: "体检人信息",
    lines: [
      `姓名：${patient.name}    性别：${patient.sex}    年龄：${patient.age}`,
      `体检号：${order.id}`,
      `体检日期：${order.date}    院区：${order.campus}`,
      `报告状态：${order.status === "printed" ? "已领取（演示）" : "审核通过（演示）"}`,
    ],
  };
  const results: ReportSection = {
    key: "results",
    heading: "检查结果",
    lines: resultItems.map(
      (item) => `${item}：${order.results[item] ?? "未录入"}`,
    ),
  };
  const conclusion: ReportSection = {
    key: "conclusion",
    heading: "综合结论",
    lines: [order.conclusion || "尚未填写综合结论。"],
  };
  const suggestions: ReportSection = {
    key: "suggestions",
    heading: "有序建议",
    lines: order.reviewSuggestions?.length
      ? order.reviewSuggestions.map(
          (line: string, i: number) => `${i + 1}. ${line}`,
        )
      : ["尚未编排建议。"],
  };
  const interpretation: ReportSection = {
    key: "interpretation",
    heading: "报告解读记录",
    lines: [
      `解读人员：${order.interpretedBy || "未登记"}`,
      `解读时间：${order.interpretedAt || "未登记"}`,
    ],
  };
  const sections: Record<string, ReportSection> = {
    customer,
    results,
    conclusion,
    suggestions,
    interpretation,
  };
  const category = (
    key: string,
    heading: string,
    pattern: RegExp,
  ): ReportSection => ({
    key,
    heading,
    lines: resultItems
      .filter((item) => pattern.test(item))
      .map((item) => `${item}：${order.results[item] ?? "未录入"}`),
  });
  const purpose = (text: string): ReportSection => ({
    key: "purpose",
    heading: "用途与范围说明",
    lines: [text, "仅演示报告版式，不作任职、驾驶、航海或职业健康资格认定。"],
  });
  let output = template.sections.map((key) => sections[key]);
  if (definition.id === "employment")
    output = [
      {
        ...customer,
        heading: "入职人员资料",
        lines: [...customer.lines, `申报单位：${patient.company || "未登记"}`],
      },
      purpose("入职检查摘要与检查明细排列在同一紧凑版式。"),
      { ...conclusion, heading: "检查结论摘要" },
      { ...results, heading: "入职检查明细" },
    ];
  if (definition.id === "driver")
    output = [
      customer,
      purpose("驾驶员专用检查分组展示；缺失项目明确标注，不推断适驾资格。"),
      category("sensory", "视听及辨色项目", /视|听|色/),
      category("basic", "体格与循环项目", /一般|血压|心电|外科/),
      { ...results, heading: "本次完整项目记录" },
      conclusion,
    ];
  if (definition.id === "seafarer")
    output = [
      customer,
      purpose("海员检查采用功能与辅助检查分区版式。"),
      category("function", "功能检查分区", /视|听|一般|心电|肺/),
      category("auxiliary", "检验与影像分区", /血|尿|彩超|CT|胸/),
      { ...results, heading: "本次完整项目记录" },
      conclusion,
    ];
  if (definition.id === "occupational")
    output = [
      { ...customer, heading: "职业健康资料" },
      {
        key: "exposure",
        heading: "已登记职业接触信息",
        lines: [
          `岗位：${order.occupation || "未登记"}`,
          `接触因素：${order.occupationalExposure || "未登记"}`,
        ],
      },
      purpose("仅呈现本次已登记资料与结果，不自动生成职业病诊断。"),
      { ...results, heading: "检查及检验原始记录" },
      conclusion,
      interpretation,
    ];
  if (definition.id === "vip")
    output = [
      { ...customer, heading: "专属健康档案" },
      purpose("个人健康报告封面与详细章节分开展示。"),
      { ...conclusion, heading: "健康概览", pageBreakBefore: true },
      { ...results, heading: "完整检查详情" },
      suggestions,
      interpretation,
    ];
  return {
    ...definition,
    heading:
      definition.id === "standard"
        ? template.heading
        : `红创 · ${definition.name}`,
    footer: template.footer,
    sections: output,
  };
}

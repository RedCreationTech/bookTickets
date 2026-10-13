import type { DemoState } from "./model";
import {
  analyticsDay,
  buildOrderAnalytics,
  uniqueStrings,
} from "./analyticsData";
import {
  abnormalityFacts,
  defaultQualityFilter,
  majorPositiveFacts,
} from "./qualityAnalyticsRules";
export interface GroupReportFilter {
  company: string;
  from: string;
  to: string;
  sex: string;
  marriage: string;
  ageMin: string;
  ageMax: string;
  packageId: string;
  department: string;
}
export const defaultGroupReportFilter: GroupReportFilter = {
  company: "",
  from: "",
  to: "",
  sex: "",
  marriage: "",
  ageMin: "",
  ageMax: "",
  packageId: "",
  department: "",
};
export function groupReportError(f: GroupReportFilter) {
  if (!f.company) return "请选择报告单位";
  if (
    (f.from && !analyticsDay(f.from)) ||
    (f.to && !analyticsDay(f.to)) ||
    (f.from && f.to && f.from > f.to)
  )
    return "请填写有效且顺序正确的体检日期";
  if (
    (f.ageMin && !/^\d+$/.test(f.ageMin)) ||
    (f.ageMax && !/^\d+$/.test(f.ageMax)) ||
    (f.ageMin && f.ageMax && Number(f.ageMin) > Number(f.ageMax))
  )
    return "请填写有效且顺序正确的年龄范围";
  return "";
}
export function groupReportPopulation(state: DemoState, f: GroupReportFilter) {
  if (groupReportError(f)) return [];
  const candidates = buildOrderAnalytics(state)
    .filter(
      (r) =>
        r.kind === "团检" &&
        r.company === f.company &&
        !r.cancelled &&
        r.completed &&
        r.itemCount > 0 &&
        (!f.from || r.date >= f.from) &&
        (!f.to || (!!r.date && r.date <= f.to)),
    )
    .map((r) => {
      const p = state.patients.find((p) => p.id === r.patientId);
      const department =
        r.appointment.companyDepartment ||
        p?.companyDepartment ||
        p?.department ||
        "未登记部门";
      const marriage = p?.marriage || p?.maritalStatus || "未登记婚姻";
      const packages = uniqueStrings([
        r.appointment.packageId,
        ...(r.appointment.packageIds || []),
      ]);
      return {
        appointmentId: r.id,
        patientId: r.patientId,
        name: r.name,
        sex: r.sex,
        age: r.age,
        company: r.company,
        date: r.date,
        department,
        marriage,
        packageIds: packages,
        packageNames: packages.map(
          (id) => state.packages.find((p) => p.id === id)?.name || id,
        ),
        itemCount: r.itemCount,
        completedCount: r.completedCount,
        waivedItems: r.waivedItems,
        conclusion: r.appointment.conclusion || "未记录总检结论",
      };
    })
    .filter(
      (r) =>
        (!f.sex || r.sex === f.sex) &&
        (!f.marriage || r.marriage === f.marriage) &&
        (!f.ageMin || (r.age !== null && r.age >= Number(f.ageMin))) &&
        (!f.ageMax || (r.age !== null && r.age <= Number(f.ageMax))) &&
        (!f.packageId || r.packageIds.includes(f.packageId)) &&
        (!f.department || r.department === f.department),
    );
  const seen = new Set<string>();
  return candidates
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        b.appointmentId.localeCompare(a.appointmentId),
    )
    .filter((r) => {
      if (seen.has(r.patientId)) return false;
      seen.add(r.patientId);
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}
export function buildGroupReport(
  state: DemoState,
  f: GroupReportFilter,
  selected: string[] | null = null,
  sort = "检出数降序",
  topN = 10,
) {
  const population = groupReportPopulation(state, f);
  const ids = new Set(population.map((r) => r.appointmentId));
  const facts = abnormalityFacts(state, {
    ...defaultQualityFilter,
    company: f.company,
  }).filter((r) => ids.has(r.appointmentId));
  const choices = uniqueStrings(
    facts.filter((r) => r.outcome === true).map((r) => r.abnormality),
  )
    .map((name) => {
      const rows = facts.filter((r) => r.abnormality === name);
      return {
        name,
        count: new Set(
          rows.filter((r) => r.outcome === true).map((r) => r.patientId),
        ).size,
        denominator: new Set(
          rows.filter((r) => r.denominator).map((r) => r.patientId),
        ).size,
      };
    })
    .sort((a, b) =>
      sort === "名称升序"
        ? a.name.localeCompare(b.name, "zh-CN")
        : b.count - a.count || a.name.localeCompare(b.name, "zh-CN"),
    );
  const names =
    selected === null
      ? choices.map((r) => r.name)
      : selected.filter((name) => choices.some((r) => r.name === name));
  const abnormal = facts.filter(
    (r) => r.outcome === true && names.includes(r.abnormality),
  );
  const n = Number.isInteger(topN) ? Math.max(1, Math.min(20, topN)) : 10;
  const ranks = (sex: string) =>
    choices
      .filter((r) => names.includes(r.name))
      .map((r) => ({
        ...r,
        count: new Set(
          abnormal
            .filter(
              (a) =>
                a.abnormality === r.name &&
                population.some(
                  (p) => p.patientId === a.patientId && p.sex === sex,
                ),
            )
            .map((a) => a.patientId),
        ).size,
      }))
      .filter((r) => r.count > 0)
      .sort(
        (a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN"),
      )
      .slice(0, n);
  const threeHighNames = ["血糖升高", "血压升高", "血脂异常"];
  const high = population.map((p) => ({
    patientId: p.patientId,
    name: p.name,
    conditions: threeHighNames.filter((name) =>
      facts.some(
        (r) =>
          r.patientId === p.patientId &&
          r.abnormality === name &&
          r.outcome === true,
      ),
    ),
    known: threeHighNames.filter((name) =>
      facts.some(
        (r) =>
          r.patientId === p.patientId &&
          r.abnormality === name &&
          r.denominator,
      ),
    ),
  }));
  return {
    company: f.company,
    filters: { ...f },
    population,
    choices,
    selectedAbnormalities: names,
    abnormalities: abnormal,
    summary: choices.filter((r) => names.includes(r.name)),
    maleTop: ranks("男"),
    femaleTop: ranks("女"),
    topN: n,
    sort,
    sexDistribution: uniqueStrings(population.map((r) => r.sex)).map(
      (name) => ({
        name,
        count: population.filter((r) => r.sex === name).length,
      }),
    ),
    threeHigh: {
      counts: threeHighNames.map((name) => ({
        name,
        count: high.filter((r) => r.conditions.includes(name)).length,
        denominator: high.filter((r) => r.known.includes(name)).length,
      })),
      any: high.filter((r) => r.conditions.length > 0).length,
      allThree: high.filter((r) => r.conditions.length === 3).length,
      fullyKnown: high.filter((r) => r.known.length === 3).length,
      rows: high,
    },
    majorPositive: majorPositiveFacts(state, {
      ...defaultQualityFilter,
      company: f.company,
    }).filter((r) => ids.has(r.appointmentId)),
    boundary:
      "仅所选单位的团检订单，至少1个有效项目且所有非弃检项目有结果；不等同报告审核通过。每客户仅取筛选范围内最新完成体检订单（同日按体检号倒序）。三高为合成阈值，不作疾病诊断；缺失与不可判读不视为正常。原始三高分析独立于已勾选异常附件。",
  };
}
export type GroupReport = ReturnType<typeof buildGroupReport>;
export function groupPositiveCsv(report: GroupReport) {
  return report.abnormalities.map((r) => ({
    单位: report.company,
    体检号: r.appointmentId,
    客户编号: r.patientId,
    姓名: r.name,
    性别:
      report.population.find((p) => p.patientId === r.patientId)?.sex || "未知",
    体检日期: r.date,
    异常: r.abnormality,
    检查项目: r.item,
    结果: r.value,
    危急演示: r.critical ? "是" : "否",
    结论:
      report.population.find((p) => p.patientId === r.patientId)?.conclusion ||
      "未记录总检结论",
    口径: "合成演示阈值，非诊断",
  }));
}
export function groupConclusionCsv(report: GroupReport) {
  return report.population.map((p) => ({
    单位: report.company,
    体检号: p.appointmentId,
    客户编号: p.patientId,
    姓名: p.name,
    性别: p.sex,
    年龄: p.age ?? "未知",
    体检日期: p.date,
    婚姻: p.marriage,
    部门: p.department,
    套餐: p.packageNames.join("、"),
    检出异常:
      report.abnormalities
        .filter((a) => a.patientId === p.patientId)
        .map((a) => a.abnormality)
        .join("、") || "所选异常无检出",
    总检结论: p.conclusion,
    快照口径: report.boundary,
  }));
}

import { clinicalRules, clinicalItems } from "./clinicalRules";
import type { DemoState } from "./model";
import {
  analyticsDay,
  buildOrderAnalytics,
  completeResult,
  uniqueStrings,
} from "./analyticsData";
export interface QualityFilter {
  from: string;
  to: string;
  company: string;
  patient: string;
  ageMin: string;
  ageMax: string;
  arrival: string;
  abnormality: string;
}
export const defaultQualityFilter: QualityFilter = {
  from: "",
  to: "",
  company: "",
  patient: "",
  ageMin: "",
  ageMax: "",
  arrival: "",
  abnormality: "",
};
export function qualityFilterError(f: QualityFilter) {
  return f.from && f.to && f.from > f.to
    ? "开始日期不能晚于结束日期"
    : (f.ageMin && !/^\d+$/.test(f.ageMin)) ||
        (f.ageMax && !/^\d+$/.test(f.ageMax))
      ? "年龄需为非负整数"
      : f.ageMin && f.ageMax && Number(f.ageMin) > Number(f.ageMax)
        ? "最小年龄不能大于最大年龄"
        : "";
}
export function qualityOrders(state: DemoState, f: QualityFilter) {
  if (qualityFilterError(f)) return [];
  return buildOrderAnalytics(state).filter(
    (r) =>
      !r.cancelled &&
      (!f.from || r.date >= f.from) &&
      (!f.to || (!!r.date && r.date <= f.to)) &&
      (!f.company || r.company === f.company) &&
      (!f.patient || r.name.includes(f.patient) || r.id.includes(f.patient)) &&
      (!f.ageMin || (r.age !== null && r.age >= Number(f.ageMin))) &&
      (!f.ageMax || (r.age !== null && r.age <= Number(f.ageMax))) &&
      (!f.arrival || (f.arrival === "已到检" ? r.arrived : !r.arrived)),
  );
}
function definitionsFor(state: DemoState) {
  const known = [
    {
      name: "血糖升高",
      items: ["空腹血糖", "血糖"],
      test: (v: string) =>
        Number.isFinite(Number(v)) ? Number(v) > 6.1 : null,
    },
    {
      name: "血压升高",
      items: ["血压", "一般检查"],
      test: (v: string) =>
        /^\d+\s*\/\s*\d+/.test(v)
          ? Number(v.split("/")[0]) >= 140 || Number(v.split("/")[1]) >= 90
          : null,
    },
    {
      name: "血脂异常",
      items: ["血脂四项", "血脂"],
      test: (v: string) =>
        /^(正常|未见异常)/.test(v)
          ? false
          : /异常|偏高|升高|↑/.test(v)
            ? true
            : null,
    },
  ];
  const extras = clinicalRules(state)
    .filter(
      (r) =>
        r.enabled !== false && !known.some((d) => d.items.includes(r.item)),
    )
    .map((rule) => ({
      name: `${rule.item}异常`,
      items: [rule.item],
      test: (value: string): boolean | null => {
        if (rule.kind === "number") {
          const n = Number(value);
          if (!Number.isFinite(n)) return null;
          return (
            (rule.abnormalMin !== undefined && n < rule.abnormalMin) ||
            (rule.abnormalMax !== undefined && n > rule.abnormalMax) ||
            (rule.criticalMin !== undefined && n <= rule.criticalMin) ||
            (rule.criticalMax !== undefined && n >= rule.criticalMax)
          );
        }
        if (/^(正常|未见异常)/.test(value)) return false;
        return (rule.keywords || "")
          .split(/[、,，\n]/)
          .filter(Boolean)
          .some((k) => value.includes(k))
          ? true
          : null;
      },
    }));
  return [...known, ...extras];
}
export function abnormalityFacts(
  state: DemoState,
  f: QualityFilter = defaultQualityFilter,
) {
  return qualityOrders(state, f).flatMap((r) =>
    definitionsFor(state)
      .map((def) => {
        const reportItems = clinicalItems(state, {
          ...r.appointment,
          items: r.items,
        });
        const item =
          def.items.find((item) => reportItems.includes(item)) || def.items[0];
        const value = String(r.appointment.results[item] ?? "").trim();
        const eligible = reportItems.includes(item) && completeResult(value);
        const outcome = eligible ? def.test(value) : null;
        const customRule = clinicalRules(state).find(
          (rule) => rule.item === item,
        );
        const customCritical =
          customRule?.kind === "number" &&
          Number.isFinite(Number(value)) &&
          ((customRule.criticalMin !== undefined &&
            Number(value) <= customRule.criticalMin) ||
            (customRule.criticalMax !== undefined &&
              Number(value) >= customRule.criticalMax));
        const critical =
          outcome === true &&
          !!(
            customCritical ||
            (["血糖", "空腹血糖"].includes(item) &&
              Number(value) >= Number(state.config.criticalGlucose ?? 7.8)) ||
            (["血压", "一般检查"].includes(item) &&
              Number(value.split("/")[0]) >=
                Number(state.config.criticalBp ?? 180))
          );
        return {
          id: `${r.id}:${def.name}`,
          appointmentId: r.id,
          patientId: r.patientId,
          name: r.name,
          company: r.company,
          age: r.age,
          date: r.date,
          item,
          abnormality: def.name,
          value,
          outcome,
          critical,
          denominator: outcome !== null,
          reason: !reportItems.includes(item)
            ? "未开此项目"
            : !eligible
              ? "无结果"
              : outcome === null
                ? "结果不可按演示规则判读"
                : "演示规则可判读",
        };
      })
      .filter((x) => !f.abnormality || x.abnormality === f.abnormality),
  );
}
export function abnormalitySummary(state: DemoState, f: QualityFilter) {
  const facts = abnormalityFacts(state, f);
  return uniqueStrings(facts.map((x) => x.abnormality)).map((name) => {
    const rs = facts.filter((x) => x.abnormality === name);
    const denominator = rs.filter((x) => x.denominator).length,
      numerator = rs.filter((x) => x.outcome === true).length;
    return {
      name,
      denominator,
      numerator,
      unknown: rs.filter((x) => !x.denominator).length,
      rate: denominator ? numerator / denominator : null,
      critical: rs.filter((x) => x.critical).length,
    };
  });
}
export function majorPositiveFacts(state: DemoState, f: QualityFilter) {
  return qualityOrders(state, f).flatMap((r) =>
    (r.appointment.examSummaries || [])
      .filter((s: any) => ["重大阳性", "重大异常", "危急"].includes(s.level))
      .map((s: any) => ({
        id: `${r.id}:${s.id}`,
        appointmentId: r.id,
        name: r.name,
        company: r.company,
        date: r.date,
        level: s.level,
        text: s.text,
        source: "医生显式分检小结级别",
      })),
  );
}
const timestamp = (s: any) =>
  typeof s === "string" && Number.isFinite(Date.parse(s)) ? s : "";
export function qualityTimingRows(state: DemoState, f: QualityFilter) {
  return qualityOrders(state, f).flatMap((r) => {
    const a = r.appointment;
    const meta = Array.isArray(a.stageMetadata) ? a.stageMetadata : [];
    const latest = (name: string) =>
      meta.filter((e: any) => e.stage === name).at(-1);
    const main = latest("主检"),
      final = latest("总检");
    const milestones = [
      ["体检开始", timestamp(a.checkedAt)],
      ["报告回传", timestamp(a.reportReturnedAt)],
      ["主检开始", timestamp(main?.startedAt)],
      ["主检结束", timestamp(main?.completedAt)],
      ["总检开始", timestamp(final?.startedAt)],
      ["总检结束", timestamp(final?.completedAt)],
    ];
    const segments = [
      ["体检至回传", milestones[0][1], milestones[1][1], false],
      [
        "主检",
        milestones[2][1],
        milestones[3][1],
        main?.startedAtSource === "送审代理" ||
          (!!main?.startedAt &&
            main?.startedAt === a.submittedAt &&
            !["实际开始", "节点开始"].includes(main?.startedAtSource)),
      ],
      [
        "总检",
        milestones[4][1],
        milestones[5][1],
        final?.startedAtSource === "送审代理" ||
          (!!final?.startedAt &&
            final?.startedAt === a.submittedAt &&
            !["实际开始", "节点开始"].includes(final?.startedAtSource)),
      ],
    ] as const;
    return segments.map(([stage, start, end, proxy]) => {
      const rule = (state.records.qualityStageThresholds || []).find(
        (x) => x.type === r.type && x.stage === stage,
      );
      const hours =
        start && end && !proxy && Date.parse(end) >= Date.parse(start)
          ? (Date.parse(end) - Date.parse(start)) / 3600000
          : null;
      const limit =
        typeof rule?.hours === "number" && rule.hours > 0 ? rule.hours : null;
      return {
        id: `${r.id}:${stage}`,
        appointmentId: r.id,
        name: r.name,
        type: r.type,
        stage,
        start,
        end,
        milestones,
        hours,
        limit,
        slow: hours !== null && limit !== null && hours > limit,
        source: proxy
          ? "送审时间代理，不计算阶段耗时"
          : hours === null
            ? "缺少有效实际时间"
            : "实际节点时间",
      };
    });
  });
}
export function rejectionQualityRows(
  state: DemoState,
  f: QualityFilter = defaultQualityFilter,
) {
  const allowed = new Set(
    qualityOrders(state, { ...f, from: "", to: "" }).map((r) => r.id),
  );
  const inPeriod = (value: unknown) => {
    const date = analyticsDay(value);
    return (!f.from || date >= f.from) && (!f.to || (!!date && date <= f.to));
  };
  const denominator = new Map<string, Set<string>>();
  const add = (doctor: string, stage: string, key: string) => {
    if (!doctor || doctor === "责任人未知") return;
    const group = `${doctor}\u0000${stage}`;
    const set = denominator.get(group) || new Set<string>();
    set.add(key);
    denominator.set(group, set);
  };
  for (const a of state.appointments.filter((a) => allowed.has(a.id))) {
    for (const [item, value] of Object.entries(a.results || {})) {
      const meta = a.resultMetadata?.[item];
      if (completeResult(value) && meta?.doctor && inPeriod(meta.at))
        add(meta.doctor, "分检", `${a.id}:${item}`);
    }
    for (const node of a.stageMetadata || [])
      if (
        node.stage === "主检" &&
        node.doctor &&
        ["已通过", "已完成"].includes(node.status) &&
        inPeriod(node.completedAt)
      )
        add(node.doctor, "主检", `${a.id}:主检`);
  }
  const facts: any[] = [];
  const seen = new Set<string>();
  for (const e of state.audit.filter(
    (x) => ["REJECT", "REJECT_TO_MAIN"].includes(x.action) && inPeriod(x.time),
  )) {
    if (!e.id || seen.has(e.id)) continue;
    seen.add(e.id);
    const before = e.before,
      after = e.after;
    const appointmentId =
      before?.id ||
      (typeof e.entity === "object" ? e.entity?.appointmentId : e.entity);
    if (!allowed.has(appointmentId)) continue;
    const targets =
      e.action === "REJECT_TO_MAIN"
        ? []
        : Array.isArray(after?.redoItems)
          ? after.redoItems
          : Array.isArray(e.redoItems)
            ? e.redoItems
            : [];
    const reason =
      after?.rejectReason ||
      after?.rejectionReason ||
      e.reason ||
      e.message ||
      "未记录原因";
    if (before && targets.length) {
      for (const item of new Set<string>(targets)) {
        const doctor = before.resultMetadata?.[item]?.doctor || "责任人未知";
        if (completeResult(before.results?.[item]))
          add(doctor, "分检", `${before.id}:${item}`);
        facts.push({
          id: `${e.id}:${item}`,
          eventId: e.id,
          doctor,
          stage: "分检",
          reason,
          item,
          key: `${before.id}:${item}`,
          date: analyticsDay(e.time),
        });
      }
    }
    const priorMain = (before?.stageMetadata || [])
      .filter(
        (node: any) =>
          node.stage === "主检" && ["已通过", "已完成"].includes(node.status),
      )
      .at(-1);
    if (!targets.length || priorMain) {
      const main = (before?.stageMetadata || [])
        .filter(
          (node: any) =>
            node.stage === "主检" && ["已通过", "已完成"].includes(node.status),
        )
        .at(-1);
      const doctor = main?.doctor || "责任人未知";
      if (main?.doctor) add(doctor, "主检", `${before.id}:主检`);
      facts.push({
        id: e.id,
        eventId: e.id,
        doctor,
        stage: main ? "主检" : "未指定返工项目",
        reason,
        key: main ? `${before.id}:主检` : e.id,
        date: analyticsDay(e.time),
      });
    }
  }
  return uniqueStrings(
    facts.map((x) => `${x.doctor}\u0000${x.stage}\u0000${x.reason}`),
  ).map((group) => {
    const [doctor, stage, reason] = group.split("\u0000");
    const records = facts.filter(
      (x) => x.doctor === doctor && x.stage === stage && x.reason === reason,
    );
    const rejected = new Set(records.map((x) => x.key)).size;
    const total =
      doctor === "责任人未知"
        ? null
        : denominator.get(`${doctor}\u0000${stage}`)?.size || null;
    return {
      doctor,
      stage,
      reason,
      events: new Set(records.map((x) => x.eventId)).size,
      rejected,
      total,
      rate: total ? rejected / total : null,
      records,
    };
  });
}

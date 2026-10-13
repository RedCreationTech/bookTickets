const GroupReportBuilder = lazy(() => import("./GroupReportBuilder"));
import { canUnlockOrder } from "../orderProgressRules";
const OrderSearchDesk = lazy(() =>
  import("./OrderProgress").then((m) => ({ default: m.OrderSearchDesk })),
);
const OrderItemProgress = lazy(() =>
  import("./OrderProgress").then((m) => ({ default: m.OrderItemProgress })),
);
const OrderFlowDesk = lazy(() =>
  import("./OrderProgress").then((m) => ({ default: m.OrderFlowDesk })),
);
const ThirdPartyOrderImport = lazy(() =>
  import("./OrderProgress").then((m) => ({ default: m.ThirdPartyOrderImport })),
);
const OrderUnlockSettings = lazy(() =>
  import("./OrderProgress").then((m) => ({ default: m.OrderUnlockSettings })),
);
import {
  ReportArchive,
  ReportSearchControls,
  defaultReportFilters,
  filterReports,
} from "./ReportArchive";
const InvoiceAging = lazy(() => import("./InvoiceAging"));
import { AppointmentActions } from "./AppointmentActions";
import { AppointmentDashboard } from "./AppointmentDashboard";
import {
  OrderingConfiguration,
  GroupPackageBrowser,
} from "./OrderingConfiguration";
import {
  itemAvailableAtCampus,
  validateCampusItems,
  validateGroupOrderBooking,
} from "../groupImportRules";
const QueueRecommendationPanel = lazy(() =>
  import("./Queue").then((m) => ({ default: m.QueueRecommendationPanel })),
);
const OrderFinanceDesk = lazy(() =>
  import("./OrderFinanceCompletion").then((m) => ({
    default: m.OrderFinanceDesk,
  })),
);
const MembershipCardDesk = lazy(() =>
  import("./OrderFinanceCompletion").then((m) => ({
    default: m.MembershipCardDesk,
  })),
);
const GroupSettlementDesk = lazy(() =>
  import("./OrderFinanceCompletion").then((m) => ({
    default: m.GroupSettlementDesk,
  })),
);
const DiscountPasswordDesk = lazy(() =>
  import("./BatchOrdering").then((m) => ({ default: m.DiscountPasswordDesk })),
);
const GroupItemSwap = lazy(() =>
  import("./BatchOrdering").then((m) => ({ default: m.GroupItemSwap })),
);
import { ReviewWorkflowSettings, ReviewWorkflowTools } from "./ReviewWorkflow";
import { SpecimenStation } from "./SpecimenStation";
import {
  ClinicalRuleEditor,
  PreExamContext,
  HistoricalOrderPanel,
  ResultTemplateTools,
  InExamAdditions,
  SyntheticRecording,
  SelectedResultPrint,
} from "./ClinicalWorkbench";
const ReportDelivery = lazy(() => import("./ReportDelivery"));
import {
  reviewNodes,
  reviewDoctorEligible,
  clinicalRules,
  clinicalItems,
  clinicalExample,
  aggregateClinicalResults,
  validateClinicalResults,
  clinicalAbnormalities,
  localHistoricalOrders,
} from "../clinicalRules";
const BatchOrdering = lazy(() =>
  import("./BatchOrdering").then((m) => ({ default: m.BatchOrdering })),
);
const DiscountApprovalDesk = lazy(() =>
  import("./BatchOrdering").then((m) => ({ default: m.DiscountApprovalDesk })),
);
import { ClinicalTemplatePicker } from "./ClinicalTemplates";
import { getBookingAvailability } from "../bookingRules";
const GroupImport = lazy(() =>
  import("./Advanced").then((m) => ({ default: m.GroupImport })),
);
const IdentityPhotoViewer = lazy(() =>
  import("./ControlCenter").then((m) => ({ default: m.IdentityPhotoViewer })),
);
const SettlementDetails = lazy(() =>
  import("./SettlementDetails").then((m) => ({ default: m.SettlementDetails })),
);
const InvoiceReminder = lazy(() =>
  import("./InvoiceReminder").then((m) => ({ default: m.InvoiceReminder })),
);
import { analyzeDemoResults } from "../rules";
import {
  getOrderRules,
  packageIsApplicable,
  getOrderingIssues,
  quoteOrder,
  percentFromAmount,
  resolveDependencies,
  normalizeOrderItems,
  packageAvailableAtCampus,
  getPackageOptionalBundles,
} from "../orderingRules";
import { PrintDesk, ExpiryDesk, GynecologySpecimens } from "./ExecutionDesk";
import { RegistrationProfile, defaultCustomerTypes } from "./Registration";
import {
  ReviewTools,
  ReportOperations,
  sortReviewAppointments,
  isReportOverdue,
  isCriticalReviewAppointment,
} from "./ReviewTools";
import {
  GroupContractWorkbench,
  InvoiceLedger,
  applicableGroup,
  splitGroupAmount,
  groupDiscountPercent,
} from "./Groups";
import {
  RegistrationConsents,
  PastHistoryNotice,
} from "./RegistrationConsents";
import { ExamExtras, UndoExam } from "./ClinicalExtras";
import { OrderingRuleEditor } from "./Ordering";
import { useState, useRef, useEffect, lazy, Suspense } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock,
  Download,
  FileText,
  HeartPulse,
  Plus,
  Printer,
  Search,
  ShieldCheck,
  Users,
  Wallet,
  TriangleAlert,
  RefreshCw,
  ChevronRight,
  Activity,
  ScanLine,
  SlidersHorizontal,
} from "lucide-react";
import { useDemo, today, exportCsv, download, statusNames } from "../store";
import type { Appointment } from "../model";
import {
  Badge,
  Bars,
  Empty,
  LinkButton,
  Metric,
  Modal,
  PageTitle,
  StatusBadge,
  Trend,
} from "../ui";
export function Dashboard() {
  const { state } = useDemo();
  const days = Array.from({ length: 7 }, (_, i) =>
    new Date(Date.now() - (6 - i) * 86400000).toISOString().slice(0, 10),
  );
  const booked = days.map(
      (d) =>
        state.appointments.filter(
          (a) => a.date === d && a.status !== "cancelled",
        ).length,
    ),
    checked = days.map(
      (d) =>
        state.appointments.filter(
          (a) =>
            a.date === d &&
            ["checked", "in_exam", "review", "approved", "printed"].includes(
              a.status,
            ),
        ).length,
    );
  const weekly = booked.reduce((n, v) => n + v, 0),
    weeklyChecked = checked.reduce((n, v) => n + v, 0);

  const count = (ss: string[]) =>
    state.appointments.filter(
      (x) => x.date === today() && ss.includes(x.status),
    ).length;
  return (
    <>
      <PageTitle
        eyebrow="OVERVIEW / 运营概览"
        title="每一份健康，都值得悉心守护"
        description={`${new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" })} · 中心院区今日运行平稳`}
        actions={
          <a className="btn btn-primary" href="#/appointments">
            <Plus size={16} />
            新建体检预约
          </a>
        }
      />
      <div className="hero-strip">
        <div>
          <span className="live-dot" />
          全流程一体化 · 本地交互演示
        </div>
        <span>
          检前预约 <ChevronRight size={13} /> 智能导检{" "}
          <ChevronRight size={13} /> 总检报告 <ChevronRight size={13} />{" "}
          健康管理
        </span>
        <a href="#/coverage">
          查看需求响应范围 <ArrowUpRight size={15} />
        </a>
      </div>
      <div className="metrics">
        <Metric
          label="今日体检预约"
          value={
            state.appointments.filter(
              (a) => a.date === today() && a.status !== "cancelled",
            ).length
          }
          unit="人"
          note={`已开放 ${state.config.dailyCapacity} 个预约名额`}
        >
          <CalendarDays size={20} />
        </Metric>
        <Metric
          label="已到检人数"
          value={count(["checked", "in_exam", "review", "approved", "printed"])}
          unit="人"
          note="从预约到报告，全流程可追踪"
        >
          <Users size={20} />
        </Metric>
        <Metric
          label="待审核报告"
          value={count(["review"])}
          unit="份"
          note="初审 / 主检 / 总检三级审核"
        >
          <FileText size={20} />
        </Metric>
        <Metric
          label="待处理随访"
          value={state.tasks.filter((t) => t.status !== "已完成").length}
          unit="项"
          note="按 A / B / C / D 四色分级"
        >
          <HeartPulse size={20} />
        </Metric>
      </div>
      <div className="dashboard-grid">
        <section className="panel trend-panel">
          <div className="panel-heading">
            <div>
              <h2>体检服务趋势</h2>
              <p>预约与到检 · 最近7日实际本地订单</p>
            </div>
            <div className="legend">
              <i />
              预约人数 <i className="gold" />
              到检人数
            </div>
          </div>
          <Trend
            labels={days.map((d) => d.slice(5))}
            booked={booked}
            checked={checked}
          />
          <div className="chart-foot">
            <span>
              周度预约总量{" "}
              <strong>
                {weekly} <small>人</small>
              </strong>
            </span>
            <span>
              平均到检率{" "}
              <strong>
                {weekly ? ((weeklyChecked / weekly) * 100).toFixed(1) : "0.0"}
                <small>%</small>
              </strong>
            </span>
            <span className="muted">排除取消订单；按体检日期统计</span>
          </div>
        </section>
        <section className="panel todo-panel">
          <div className="panel-heading">
            <h2>我的待办</h2>
            <Badge tone="gray">
              {state.tasks.filter((t) => t.status !== "已完成").length +
                count(["review"])}
            </Badge>
          </div>
          {[
            {
              title: "体检报告待审核",
              sub: "请核对异常指标与综合建议",
              count: count(["review"]),
              route: "/review",
              icon: FileText,
              color: "teal",
            },
            {
              title: "重大异常跟进",
              sub: "优先处理 A 类健康风险",
              count: state.tasks.filter(
                (t) => t.risk === "A类" && t.status !== "已完成",
              ).length,
              route: "/health",
              icon: TriangleAlert,
              color: "orange",
            },
            {
              title: "到检确认与登记",
              sub: "预约已付款，等待现场到检",
              count: count(["paid"]),
              route: "/appointments",
              icon: CalendarDays,
              color: "blue",
            },
          ].map((x) => (
            <a className="todo" href={"#" + x.route} key={x.title}>
              <div className={`tile-icon ${x.color}`}>
                <x.icon size={20} />
              </div>
              <div>
                <strong>{x.title}</strong>
                <small>{x.sub}</small>
              </div>
              <b>{x.count}</b>
              <ChevronRight size={15} />
            </a>
          ))}
          <LinkButton href="/quality">查看全部业务提醒</LinkButton>
        </section>
        <section className="panel flow-panel">
          <div className="panel-heading">
            <h2>今日体检进度</h2>
            <LinkButton href="/queue">导检调度</LinkButton>
          </div>
          <div className="flow-stations">
            {[
              { name: "待到检", num: count(["paid"]), icon: CalendarDays },
              { name: "已登记", num: count(["checked"]), icon: ClipboardList },
              { name: "检查中", num: count(["in_exam"]), icon: Activity },
              { name: "待审核", num: count(["review"]), icon: ShieldCheck },
              {
                name: "报告完成",
                num: count(["approved", "printed"]),
                icon: CheckCircle2,
              },
            ].map((x) => (
              <div className="flow-station" key={x.name}>
                <x.icon size={20} />
                <strong>{x.num}</strong>
                <span>{x.name}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="panel quick-panel">
          <div className="panel-heading">
            <h2>常用工作台</h2>
            <span className="muted">快速进入</span>
          </div>
          <div className="quick-grid">
            {[
              { name: "开单登记", href: "/appointments", icon: ClipboardList },
              { name: "医生分检", href: "/exam", icon: HeartPulse },
              { name: "总检审核", href: "/review", icon: ShieldCheck },
              { name: "报告中心", href: "/reports", icon: FileText },
              { name: "企业健康", href: "/enterprise", icon: Users },
              { name: "财务结算", href: "/finance", icon: Wallet },
            ].map((x) => (
              <a key={x.href} href={"#" + x.href}>
                <x.icon size={20} />
                {x.name}
                <ArrowUpRight size={14} />
              </a>
            ))}
          </div>
        </section>
        <section className="panel schedule-panel">
          <div className="panel-heading">
            <div>
              <h2>今日预约</h2>
              <p>全部为合成演示客户</p>
            </div>
            <LinkButton href="/appointments">全部预约</LinkButton>
          </div>
          <table>
            <thead>
              <tr>
                <th>体检客户</th>
                <th>预约时间</th>
                <th>体检套餐</th>
                <th>所属单位</th>
                <th>当前状态</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {state.appointments
                .filter((a) => a.date === today() && a.status !== "cancelled")
                .slice(0, 5)
                .map((a) => {
                  const p = state.patients.find((p) => p.id === a.patientId)!;
                  return (
                    <tr key={a.id}>
                      <td>
                        <div className="person">
                          <span className="avatar">{p.name.slice(-2)}</span>
                          <div>
                            <strong>{p.name}</strong>
                            <small>
                              {p.sex} · {p.age}岁
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>{a.time}</td>
                      <td>
                        {state.packages.find((p) => p.id === a.packageId)?.name}
                      </td>
                      <td>{p.company}</td>
                      <td>
                        <StatusBadge status={a.status} />
                      </td>
                      <td>
                        <a
                          className="link-btn"
                          href={"#/appointments?selected=" + a.id}
                        >
                          查看 <ArrowRight size={14} />
                        </a>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </section>
      </div>
      <AppointmentDashboard />
    </>
  );
}
export function Appointments() {
  const { state, act } = useDemo();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [source, setSource] = useState("前台登记"),
    [sourceFilter, setSourceFilter] = useState("all");
  const [filterDate, setFilterDate] = useState("");
  const [filterCampus, setFilterCampus] = useState("all");
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [ruleEditor, setRuleEditor] = useState(false);
  const [groupEditor, setGroupEditor] = useState(false);
  const [profile, setProfile] = useState<string | null>(null);
  const [printDesk, setPrintDesk] = useState(false);
  const [expiryDesk, setExpiryDesk] = useState(false);
  const [otherPackages, setOtherPackages] = useState<string[]>([]);
  const [lineDiscounts, setLineDiscounts] = useState<Record<string, number>>(
    {},
  );
  const [extraItems, setExtraItems] = useState<string[]>([]);
  const [overrideReason, setOverrideReason] = useState("");
  const [replacement, setReplacement] = useState("");
  const [replacementReason, setReplacementReason] = useState("");
  const submitting = useRef(false);
  const [detail, setDetail] = useState(
    new URLSearchParams(window.location.hash.split("?")[1] || "").get(
      "selected",
    ) || "",
  );
  const [patient, setPatient] = useState(state.patients[0]?.id || "");
  const [pkg, setPkg] = useState(
    () =>
      applicableGroup(state, state.patients[0]?.id || "", today())
        ?.packages?.[0] || "PK02",
  );
  const [date, setDate] = useState(today());
  const [time, setTime] = useState("08:00–08:30");
  const [campus, setCampus] = useState(state.config.campus);
  const [discount, setDiscount] = useState(100);
  const [extra, setExtra] = useState(false);
  const [outsideGroupPersonalPay, setOutsideGroupPersonalPay] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const list = state.appointments.filter((a) => {
    const p = state.patients.find((p) => p.id === a.patientId);
    return (
      (!q ||
        [
          a.id,
          p?.name,
          p?.company,
          ...(a.replacements || []).flatMap((r: any) => [
            state.patients.find((p) => p.id === r.originalPatientId)?.name,
            state.patients.find((p) => p.id === r.replacementPatientId)?.name,
          ]),
        ]
          .join("")
          .includes(q)) &&
      (filter === "all" || a.status === filter) &&
      (sourceFilter === "all" || a.source === sourceFilter) &&
      (!filterDate || a.date === filterDate) &&
      (filterCampus === "all" || a.campus === filterCampus)
    );
  });
  const a = state.appointments.find((a) => a.id === detail);
  const historyPatient =
    state.patients.find((p) => p.id === patient) || state.patients[0];
  if (!historyPatient)
    return (
      <Empty text="当前演示数据范围内没有客户，请退出自定义权限或调整授权范围。" />
    );
  const historyOrder = state.appointments.find(
    (a) => a.patientId === patient && a.history,
  );
  const recommendation =
    historyPatient.risk === "A类"
      ? "颈动脉彩超"
      : historyPatient.risk === "B类"
        ? "血脂复查"
        : "健康教育咨询";
  const group = applicableGroup(state, patient, date);
  const packageIds = [...new Set([pkg, ...otherPackages])];
  const effectiveDiscount = outsideGroupPersonalPay
    ? discount
    : Math.min(discount, groupDiscountPercent(group));
  const discountFloor = Math.min(
    state.config.discountMin * 100,
    groupDiscountPercent(group),
  );
  const optionalBundles = getPackageOptionalBundles(state, packageIds);
  const initialQuote = quoteOrder(
    state,
    packageIds,
    effectiveDiscount,
    lineDiscounts,
    [...extraItems, ...(extra ? [recommendation] : [])],
  );
  const resolved = resolveDependencies(state, initialQuote.items);
  const normalized = normalizeOrderItems(state, [
    ...initialQuote.items,
    ...resolved.added,
  ]);
  const excludedItems = [
    ...new Set([...initialQuote.items, ...resolved.added]),
  ].filter((item) => !normalized.items.includes(item));
  const quote = quoteOrder(
    state,
    packageIds,
    effectiveDiscount,
    lineDiscounts,
    [...extraItems, ...resolved.added, ...(extra ? [recommendation] : [])],
    excludedItems,
  );
  const orderingErrors = getOrderingIssues(
    state,
    patient,
    quote.items,
    packageIds,
  );
  const submit = () => {
    if (submitting.current) return;
    if (
      !pkg ||
      packageIds.some((id) => !packageAvailableAtCampus(state, id, campus))
    )
      return setError("所选套餐不适用于当前院区，请重新选择");
    if (normalized.errors.length) return setError(normalized.errors.join("；"));
    for (const bundle of optionalBundles)
      if (
        extraItems.filter((item) => bundle.items.includes(item)).length !==
        bundle.choose
      )
        return setError(bundle.name + "自选包必须选择" + bundle.choose + "项");
    if (
      group &&
      !outsideGroupPersonalPay &&
      packageIds.some((id) => !group.packages.includes(id))
    )
      return setError("所选套餐不在该单位订单允许范围");
    if (
      !outsideGroupPersonalPay &&
      group?.packageChooseCount &&
      packageIds.length !== group.packageChooseCount
    )
      return setError("单位套餐必须选" + group.packageChooseCount + "套");
    if (
      group &&
      !outsideGroupPersonalPay &&
      group.mode === "固定套餐" &&
      packageIds.length !== 1
    )
      return setError("固定套餐单位订单只允许一个套餐");
    if (
      group &&
      !outsideGroupPersonalPay &&
      group.choose > 0 &&
      extraItems.filter((i) => (group.optionalItems || []).includes(i))
        .length !== group.choose
    )
      return setError("单位自选包必须选" + group.choose + "项");
    if (resolved.errors.length) return setError(resolved.errors.join("；"));
    const campusErrors = validateCampusItems(state, quote.items, campus);
    if (campusErrors.length) return setError(campusErrors.join("；"));
    if (group) {
      const errors = validateGroupOrderBooking(state, group.id, {
        patientId: patient,
        date,
        time,
        packageIds,
        items: quote.items,
      });
      if (errors.length) return setError(errors.join("；"));
    }
    const hardErrors = orderingErrors.filter((e) => !e.includes("婚姻"));
    if (hardErrors.length || (orderingErrors.length && !overrideReason.trim()))
      return setError(
        [
          ...hardErrors,
          ...(orderingErrors.some((e) => e.includes("婚姻"))
            ? ["婚姻适用警示需填写强制添加理由"]
            : []),
        ].join("；"),
      );
    if (quote.rows.some((r) => !r.nonDiscount && r.percent < discountFloor))
      return setError("单项折扣低于角色授权下限");
    const availability = getBookingAvailability(state, date, undefined, {
      patientId: patient,
      packageIds: [pkg, ...otherPackages],
      items: quote.items,
      company: historyPatient.company,
      kind: historyPatient.company === "个检" ? "individual" : "group",
      time,
    });
    if (!availability.allowed) return setError(availability.error);
    if (discount < discountFloor)
      return setError("折扣超出当前权限，请在审批中心申请授权（演示）");
    submitting.current = true;
    act({
      type: "CREATE_APPOINTMENT",
      payload: {
        patientId: patient,
        packageId: pkg,
        date,
        time,
        campus,
        amount: quote.amount,
        items: quote.items,
        packageIds,
        packageChooseCount: group?.packageChooseCount,
        pricing: quote.rows,
        autoFilteredItems: normalized.removed,
        appliedDiscount: effectiveDiscount,
        orderingOverride: overrideReason,
        source,
        recommendedItems: [recommendation],
        orderType:
          (state.records.customerTypes || defaultCustomerTypes).find(
            (t) => t.id === historyPatient.customerType,
          )?.orderType || (historyPatient.company === "个检" ? "个检" : "团检"),
        preferredQueueArea: (
          state.records.customerTypes || defaultCustomerTypes
        ).find((t) => t.id === historyPatient.customerType)?.queueArea,
        preExamHistory: historyPatient.preExamHistory,
        groupOrderId: group?.id,
        groupPersonnelId: group?.personnelGroupId,
        groupPersonnelName: group?.personnelGroupName,
        outsideGroupPersonalPay,
        groupSplit: outsideGroupPersonalPay
          ? { unit: 0, personal: quote.amount }
          : splitGroupAmount(group, quote.rows),
        note,
      },
    });
    setOpen(false);
  };
  return (
    <>
      <PageTitle
        eyebrow="PRE-EXAM / 检前服务"
        title="预约与开单登记"
        description="个检、团检、多院区预约统一管理，订单与患者端实时联动。"
        actions={
          <>
            <button
              className="btn"
              onClick={() =>
                exportCsv(
                  "预约明细.csv",
                  list.map((a) => ({
                    体检号: a.id,
                    客户: state.patients.find((p) => p.id === a.patientId)
                      ?.name,
                    日期: a.date,
                    状态: statusNames[a.status],
                    金额: a.amount,
                  })),
                )
              }
            >
              <Download size={16} />
              导出
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                submitting.current = false;
                const g = applicableGroup(state, patient, date);
                if (g?.packages?.[0]) setPkg(g.packages[0]);
                setOtherPackages([]);
                setExtraItems([]);
                setLineDiscounts({});
                setOverrideReason("");
                setOpen(true);
                setError("");
              }}
            >
              <Plus size={16} />
              新建预约
            </button>
          </>
        }
      />
      <div className="metrics compact">
        <Metric label="预约总量" value={state.appointments.length} unit="人" />
        <Metric
          label="待到检"
          value={state.appointments.filter((a) => a.status === "paid").length}
          unit="人"
        />
        <Metric
          label="今日剩余名额"
          value={Math.max(
            0,
            state.config.dailyCapacity -
              state.appointments.filter(
                (a) => a.date === today() && a.status !== "cancelled",
              ).length,
          )}
          unit="个"
        />
        <Metric
          label="当前院区"
          value={state.config.campus}
          note="到检时可自主选择院区"
        />
      </div>
      <section className="panel">
        <div className="toolbar">
          <div className="search-field">
            <Search size={16} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索姓名、体检号、单位"
              aria-label="搜索预约"
            />
          </div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="预约状态"
          >
            <option value="all">全部订单状态</option>
            {Object.entries(statusNames).map(([v, n]) => (
              <option key={v} value={v}>
                {n}
              </option>
            ))}
          </select>
          <input
            type="date"
            aria-label="筛选预约日期"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
          />
          <select
            aria-label="筛选预约院区"
            value={filterCampus}
            onChange={(e) => setFilterCampus(e.target.value)}
          >
            <option value="all">全部院区</option>
            <option>中心院区</option>
            <option>东院区</option>
          </select>
          <span className="spacer" />
          <button
            className="btn"
            disabled={!selected.length}
            onClick={() => {
              selected.forEach((id) =>
                act({ type: "CHECKIN", payload: { id } }),
              );
              setSelected([]);
            }}
          >
            批量到检 ({selected.length})
          </button>
          <button className="btn" onClick={() => setImporting(true)}>
            团检 CSV 导入
          </button>
          <button className="btn" onClick={() => setRuleEditor(true)}>
            项目与套餐规则
          </button>
          <button className="btn" onClick={() => setGroupEditor(true)}>
            团检订单与预算
          </button>
          <button className="btn" onClick={() => setProfile("")}>
            手工客户登记
          </button>
          <button className="btn" onClick={() => setPrintDesk(true)}>
            打印任务与版式
          </button>
          <button className="btn" onClick={() => setExpiryDesk(true)}>
            改日检到期管理
          </button>
          <button
            className="btn"
            onClick={() =>
              exportCsv(
                "团检替检对应名单.csv",
                state.appointments.flatMap((a) =>
                  (a.replacements || []).map((r: any) => ({
                    体检号: a.id,
                    原名单: state.patients.find(
                      (p) => p.id === r.originalPatientId,
                    )?.name,
                    替检名单: state.patients.find(
                      (p) => p.id === r.replacementPatientId,
                    )?.name,
                    原因: r.reason,
                    日期: r.at,
                  })),
                ),
              )
            }
          >
            导出原名单与替检名单
          </button>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="全选预约"
                    checked={list.length > 0 && selected.length === list.length}
                    onChange={(e) =>
                      setSelected(e.target.checked ? list.map((a) => a.id) : [])
                    }
                  />
                </th>
                <th>客户 / 体检号</th>
                <th>预约信息</th>
                <th>项目进度</th>
                <th>金额</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {list.map((a) => {
                const p = state.patients.find((p) => p.id === a.patientId)!;
                return (
                  <tr key={a.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.includes(a.id)}
                        aria-label={`选择${p.name}`}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, a.id]
                              : selected.filter((x) => x !== a.id),
                          )
                        }
                      />
                    </td>
                    <td>
                      <strong>{p.name}</strong>
                      <small>
                        {a.id} · {p.company}
                      </small>
                    </td>
                    <td>
                      {a.date} {a.time}
                      <small>
                        {a.campus} · {a.source || "在线预约"}
                      </small>
                    </td>
                    <td>
                      <span>
                        {Object.keys(a.results).length} / {a.items.length} 项
                      </span>
                      <div className="progress">
                        <i
                          style={{
                            width: `${(Object.keys(a.results).length / a.items.length) * 100}%`,
                          }}
                        />
                      </div>
                    </td>
                    <td>¥{a.amount.toFixed(2)}</td>
                    <td>
                      <StatusBadge status={a.status} />
                      {a.locked && <small>已锁定</small>}
                    </td>
                    <td>
                      <button
                        className="text-btn"
                        onClick={() => setDetail(a.id)}
                      >
                        详情
                      </button>
                      {a.status === "booked" && (
                        <button
                          className="text-btn"
                          onClick={() =>
                            act({ type: "PAYMENT", payload: { id: a.id } })
                          }
                        >
                          模拟收款
                        </button>
                      )}
                      {a.status === "paid" && (
                        <button
                          className="text-btn"
                          onClick={() =>
                            act({
                              type: "CHECKIN",
                              payload: {
                                id: a.id,
                                campus: state.config.campus,
                              },
                            })
                          }
                        >
                          到检
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!list.length && <Empty />}
        </div>
        <div className="table-footer">
          共 {list.length} 条 · 支持状态筛选、组合搜索及批量处理
          <span>仅保存于当前浏览器</span>
        </div>
      </section>
      <details>
        <summary>订单组合查询、逐项进度与第三方导入</summary>
        <Suspense fallback={<p>载入订单查询…</p>}>
          <OrderSearchDesk state={state} act={act} onSelect={setDetail} />
          <ThirdPartyOrderImport state={state} act={act} />
          <OrderUnlockSettings state={state} act={act} />
        </Suspense>
      </details>
      <OrderingConfiguration state={state} act={act} />
      <label>
        预约渠道筛选
        <select
          aria-label="预约渠道筛选"
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
        >
          <option value="all">全部渠道</option>
          {[
            ...new Set([
              "前台登记",
              "电话预约",
              ...state.appointments.map((a) => a.source).filter(Boolean),
            ]),
          ].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </label>
      <details id="batch-ordering-workspace">
        <summary>批量项目与套餐调整</summary>
        <Suspense fallback={<p>载入批量工作台…</p>}>
          <BatchOrdering state={state} act={act} appointmentIds={selected} />
        </Suspense>
      </details>
      <details>
        <summary>折扣申请与审批</summary>
        <Suspense fallback={<p>载入审批工作台…</p>}>
          <DiscountApprovalDesk state={state} act={act} />
        </Suspense>
      </details>
      {printDesk && (
        <Modal
          title="打印任务与版式管理"
          wide
          onClose={() => setPrintDesk(false)}
        >
          <PrintDesk />
        </Modal>
      )}
      {expiryDesk && (
        <Modal
          title="改日检临期与到期处理"
          wide
          onClose={() => setExpiryDesk(false)}
        >
          <ExpiryDesk />
        </Modal>
      )}
      {profile !== null && (
        <Modal
          title="合成客户登记与基础资料"
          wide
          onClose={() => setProfile(null)}
        >
          <RegistrationProfile key={profile} patientId={profile || undefined} />
        </Modal>
      )}
      {groupEditor && (
        <Modal
          title="团检单位订单、预算与结算"
          wide
          onClose={() => setGroupEditor(false)}
        >
          <GroupContractWorkbench />
        </Modal>
      )}
      {ruleEditor && (
        <Modal
          title="项目、套餐与计费规则"
          wide
          onClose={() => setRuleEditor(false)}
        >
          <OrderingRuleEditor />
        </Modal>
      )}
      {importing && (
        <Modal
          title="团检名单导入与校验"
          onClose={() => setImporting(false)}
          wide
        >
          <Suspense fallback={<p>正在加载名单校验…</p>}>
            <GroupImport onClose={() => setImporting(false)} />
          </Suspense>
        </Modal>
      )}
      {open && (
        <Modal title="新建体检预约" onClose={() => setOpen(false)} wide>
          <div className="form-grid">
            <label>
              体检人
              <select
                value={patient}
                onChange={(e) => {
                  setPatient(e.target.value);
                  setOutsideGroupPersonalPay(false);
                  setExtra(false);
                  setOtherPackages([]);
                  setLineDiscounts({});
                  setOverrideReason("");
                  setExtraItems([]);
                  const g = applicableGroup(state, e.target.value, date);
                  if (g?.packages?.[0]) setPkg(g.packages[0]);
                }}
              >
                {state.patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.sex} · {p.age} 岁（合成）
                  </option>
                ))}
              </select>
            </label>
            <label>
              体检院区
              <select
                value={campus}
                onChange={(e) => {
                  setCampus(e.target.value);
                  const candidate = state.packages.find(
                    (pack) =>
                      packageAvailableAtCampus(
                        state,
                        pack.id,
                        e.target.value,
                      ) &&
                      packageIsApplicable(state, historyPatient, pack.id) &&
                      (!group ||
                        group.packages.includes(pack.id) ||
                        (outsideGroupPersonalPay && pack.id === pkg)),
                  );
                  setPkg(candidate?.id || "");
                  setOtherPackages([]);
                  setExtraItems([]);
                  setLineDiscounts({});
                }}
              >
                <option>中心院区</option>
                <option>东院区</option>
              </select>
            </label>
            <label>
              预约日期
              <input
                type="date"
                min={today()}
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  const g = applicableGroup(state, patient, e.target.value);
                  if (g?.packages?.[0]) setPkg(g.packages[0]);
                  setOtherPackages([]);
                  setExtraItems([]);
                  setLineDiscounts({});
                }}
              />
            </label>
            <label>
              时段
              <select value={time} onChange={(e) => setTime(e.target.value)}>
                <option>08:00–08:30</option>
                <option>08:30–09:00</option>
                <option>09:00–09:30</option>
              </select>
            </label>
            <label>
              体检套餐
              <select
                value={pkg}
                onChange={(e) => {
                  setPkg(e.target.value);
                  setOutsideGroupPersonalPay(false);
                  setExtraItems([]);
                  setLineDiscounts({});
                }}
              >
                {state.packages
                  .filter(
                    (p) =>
                      packageIsApplicable(state, historyPatient, p.id) &&
                      packageAvailableAtCampus(state, p.id, campus) &&
                      (!group || group.packages.includes(p.id)),
                  )
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ¥{p.price}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              折扣百分比
              <input
                type="number"
                min="0"
                max="100"
                value={discount}
                onChange={(e) =>
                  setDiscount(
                    Math.max(0, Math.min(100, Number(e.target.value))),
                  )
                }
              />
            </label>
          </div>
          {normalized.removed.length > 0 && (
            <div className="notice" aria-label="自动过滤项目说明">
              自动过滤并重新计价：
              {normalized.removed
                .map((r) => r.item + "（" + r.reason + "）")
                .join("；")}
            </div>
          )}
          {optionalBundles.map((bundle) => (
            <fieldset key={bundle.packageId}>
              <legend>
                {bundle.name} · 套餐独立自选包 {bundle.items.length} 选{" "}
                {bundle.choose}
              </legend>
              {bundle.items.map((item) => (
                <label className="check-line" key={item}>
                  <input
                    type="checkbox"
                    checked={extraItems.includes(item)}
                    onChange={(e) =>
                      setExtraItems(
                        e.target.checked
                          ? [...new Set([...extraItems, item])]
                          : extraItems.filter((i) => i !== item),
                      )
                    }
                  />
                  {item}
                </label>
              ))}
            </fieldset>
          ))}
          {group && (
            <>
              <GroupPackageBrowser
                state={state}
                patientId={patient}
                campus={campus}
                groupOrderId={group.id}
                onSelect={(id, personalPay) => {
                  setPkg(id);
                  setOutsideGroupPersonalPay(personalPay);
                  setOtherPackages([]);
                  setExtraItems([]);
                  setLineDiscounts({});
                }}
              />
              {outsideGroupPersonalPay && (
                <p className="callout">
                  当前选择单位外套餐，全额由个人承担，单位预算不参与本单结算。
                </p>
              )}
            </>
          )}
          {group && (
            <div className="callout">
              <div>
                <strong>
                  单位订单：{group.name} · {group.mode} · 协议折扣{" "}
                  {groupDiscountPercent(group)}%
                </strong>
                <p>
                  单位承担 ¥
                  {splitGroupAmount(group, quote.rows).unit.toFixed(2)} /
                  个人承担 ¥
                  {splitGroupAmount(group, quote.rows).personal.toFixed(2)}
                  ；超预算差额自动转个人
                </p>
                <p>
                  单位自选包：{(group.optionalItems || []).length}选
                  {group.choose}
                </p>
                {(group.optionalItems || []).map((item: string) => (
                  <label className="check-line" key={item}>
                    <input
                      type="checkbox"
                      checked={extraItems.includes(item)}
                      onChange={(e) =>
                        setExtraItems(
                          e.target.checked
                            ? [...extraItems, item]
                            : extraItems.filter((i) => i !== item),
                        )
                      }
                    />
                    {item}
                  </label>
                ))}
              </div>
            </div>
          )}
          <details>
            <summary>多套餐、单项折扣与适用规则</summary>
            <div className="form-grid">
              <label>
                婚姻状态（用于演示规则）
                <select
                  value={historyPatient.marriage || "未设置"}
                  onChange={(e) =>
                    act({
                      type: "UPSERT_PATIENT",
                      payload: { ...historyPatient, marriage: e.target.value },
                    })
                  }
                >
                  <option>未设置</option>
                  <option>未婚</option>
                  <option>已婚</option>
                </select>
              </label>
              <label>
                目标总金额（反算折扣）
                <input
                  aria-label="目标总金额"
                  type="number"
                  min="0"
                  max={quote.original}
                  value={quote.amount}
                  onChange={(e) => {
                    setDiscount(
                      percentFromAmount(
                        state,
                        packageIds,
                        Number(e.target.value),
                        [...extraItems, ...(extra ? [recommendation] : [])],
                        excludedItems,
                      ),
                    );
                    setLineDiscounts({});
                  }}
                />
              </label>
            </div>
            <p>
              多套餐重复项目只计费一次；单项基价按套餐金额均分，叠加时取较高者，纯演示计价规则。
            </p>
            {group?.packageChooseCount && (
              <p>
                该单位允许套餐中必须选择 {group.packageChooseCount} 套，当前已选{" "}
                {packageIds.length} 套。
              </p>
            )}
            {state.packages
              .filter(
                (p) =>
                  p.id !== pkg &&
                  (!group || group.packages.includes(p.id)) &&
                  packageAvailableAtCampus(state, p.id, campus) &&
                  packageIsApplicable(state, historyPatient, p.id),
              )
              .map((p) => (
                <label className="check-line" key={p.id}>
                  <input
                    type="checkbox"
                    checked={otherPackages.includes(p.id)}
                    onChange={(e) =>
                      setOtherPackages(
                        e.target.checked
                          ? [...otherPackages, p.id]
                          : otherPackages.filter((x) => x !== p.id),
                      )
                    }
                  />
                  {p.name}
                </label>
              ))}
            <label>
              附加项目
              <select
                aria-label="规则附加项目"
                value=""
                onChange={(e) => {
                  if (e.target.value)
                    setExtraItems([
                      ...new Set([...extraItems, e.target.value]),
                    ]);
                }}
              >
                <option value="">选择项目</option>
                {getOrderRules(state)
                  .filter((r) => itemAvailableAtCampus(state, r.item, campus))
                  .filter(
                    (r) =>
                      r.enabled !== false &&
                      (!r.sex ||
                        r.sex === "不限" ||
                        r.sex === historyPatient.sex),
                  )
                  .map((r) => (
                    <option key={r.id}>{r.item}</option>
                  ))}
              </select>
            </label>
            <table>
              <thead>
                <tr>
                  <th>项目</th>
                  <th>原价</th>
                  <th>单项折扣%</th>
                  <th>实价</th>
                </tr>
              </thead>
              <tbody>
                {quote.rows.map((r) => (
                  <tr key={r.item}>
                    <td>
                      {r.item}
                      {extraItems.includes(r.item) && (
                        <button
                          className="text-btn"
                          onClick={() =>
                            setExtraItems(
                              extraItems.filter((i) => i !== r.item),
                            )
                          }
                        >
                          移除附加
                        </button>
                      )}
                    </td>
                    <td>{r.price.toFixed(2)}</td>
                    <td>
                      {r.nonDiscount ? (
                        "禁止折扣"
                      ) : (
                        <input
                          aria-label={r.item + "单项折扣"}
                          type="number"
                          min="0"
                          max="100"
                          value={r.percent}
                          onChange={(e) =>
                            setLineDiscounts({
                              ...lineDiscounts,
                              [r.item]: Number(e.target.value),
                            })
                          }
                        />
                      )}
                    </td>
                    <td>{r.amount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {resolved.added.length > 0 && (
              <p>必检/依赖自动带入：{resolved.added.join("、")}</p>
            )}
            {orderingErrors.length > 0 && (
              <div className="error">{orderingErrors.join("；")}</div>
            )}
            {orderingErrors.some((e) => e.includes("婚姻")) && (
              <label>
                强制添加理由
                <input
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="明确记录覆盖适用警示的演示理由"
                />
              </label>
            )}
          </details>
          <div className="callout">
            <HeartPulse size={20} />
            <div>
              <strong>历次异常参考 · 合成历史</strong>
              <p>
                {historyPatient.name}的合成记录：上次空腹血糖{" "}
                {historyOrder?.history?.["空腹血糖"]?.[0] || "未收录"}，血压{" "}
                {historyOrder?.history?.["一般检查"]?.[0] || "未收录"}，分组{" "}
                {historyPatient.risk}
                。推荐项目仅用于演示，临床适应证须由医生判断。
              </p>
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={extra}
                  onChange={(e) => setExtra(e.target.checked)}
                />
                增加{recommendation} · ¥80
              </label>
            </div>
          </div>
          <label className="field">
            既往史 / 备注
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="仅录入演示内容，请勿填入真实健康信息"
            />
          </label>
          <label>
            预约来源
            <select
              aria-label="预约来源"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              <option>前台登记</option>
              <option>电话预约</option>
              <option>现场咨询</option>
            </select>
          </label>
          {error && <p className="error">{error}</p>}
          <div className="modal-actions">
            <strong>合计 ¥{quote.amount.toFixed(2)}</strong>
            <button className="btn" onClick={() => setOpen(false)}>
              取消
            </button>
            <button className="btn btn-primary" onClick={submit}>
              确认预约
            </button>
          </div>
        </Modal>
      )}
      {a && (
        <Modal
          title={`订单详情 · ${state.patients.find((p) => p.id === a.patientId)?.name}`}
          onClose={() => setDetail("")}
          wide
        >
          <details>
            <summary>本单折扣申请与审批</summary>
            <Suspense fallback={<p>载入本单审批…</p>}>
              <DiscountApprovalDesk
                key={a.id}
                state={state}
                act={act}
                appointmentId={a.id}
              />
            </Suspense>
          </details>
          <details>
            <summary>逐项检查和22种流转事件查询</summary>
            <Suspense fallback={<p>载入项目进度…</p>}>
              <OrderItemProgress state={state} act={act} appointmentId={a.id} />
              <OrderFlowDesk state={state} act={act} appointmentId={a.id} />
            </Suspense>
          </details>
          <AppointmentActions key={"actions-" + a.id} appointment={a} />
          <Suspense fallback={<p>载入登记协同…</p>}>
            <QueueRecommendationPanel appointmentId={a.id} />
            <OrderFinanceDesk state={state} act={act} appointmentId={a.id} />
            <DiscountPasswordDesk
              state={state}
              act={act}
              appointmentId={a.id}
            />
            <GroupItemSwap state={state} act={act} appointmentId={a.id} />
          </Suspense>
          <RegistrationConsents
            key={"registration-" + a.id}
            appointmentId={a.id}
          />
          <div className="detail-grid">
            <div>
              <label>体检号</label>
              <p>{a.id}</p>
            </div>
            <div>
              <label>订单状态</label>
              <p>
                <StatusBadge status={a.status} />
              </p>
            </div>
            <div>
              <label>院区（可自由更换）</label>
              <select
                value={a.campus}
                disabled={a.locked}
                onChange={(e) =>
                  act({
                    type: "UPDATE_APPOINTMENT",
                    payload: { id: a.id, campus: e.target.value },
                  })
                }
              >
                <option>中心院区</option>
                <option>东院区</option>
              </select>
            </div>
            <div>
              <label>预约日期</label>
              <input
                type="date"
                value={a.date}
                min={today()}
                disabled={a.locked}
                onChange={(e) => {
                  const available = getBookingAvailability(
                    state,
                    e.target.value,
                    a.id,
                    {
                      patientId: a.patientId,
                      packageIds: [a.packageId, ...(a.packageIds || [])],
                      items: a.items,
                      company: state.patients.find((p) => p.id === a.patientId)
                        ?.company,
                      kind:
                        state.patients.find((p) => p.id === a.patientId)
                          ?.company === "个检"
                          ? "individual"
                          : "group",
                      time: a.time,
                    },
                  );
                  if (!available.allowed) {
                    setError(available.error);
                    return;
                  }
                  setError("");
                  act({
                    type: "UPDATE_APPOINTMENT",
                    payload: { id: a.id, date: e.target.value },
                  });
                }}
              />
            </div>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button
            className="btn"
            onClick={() => {
              setProfile(a.patientId);
              setDetail("");
            }}
          >
            编辑客户基本资料
          </button>
          <h3>检查项目与结果</h3>
          <div className="item-grid">
            {a.items.map((x) => (
              <div key={x}>
                <span>{x}</span>
                <Badge tone={a.results[x] ? "green" : "gray"}>
                  {a.results[x] || "待检查"}
                </Badge>
                <button
                  className="text-btn danger"
                  disabled={
                    a.locked ||
                    a.items.length <= 1 ||
                    !state.config.allowRemove ||
                    getOrderRules(state).some(
                      (r) =>
                        r.enabled !== false &&
                        r.ruleEnabled !== false &&
                        r.item === x &&
                        r.required,
                    )
                  }
                  onClick={() =>
                    act({
                      type: "UPDATE_APPOINTMENT",
                      payload: {
                        id: a.id,
                        items: a.items.filter((i) => i !== x),
                        waived: [...(a.waived || []), x],
                      },
                    })
                  }
                >
                  弃检
                </button>
              </div>
            ))}
          </div>
          <details>
            <summary>团检替检与双向追踪</summary>
            <p>
              仅可替换未开始检查的团检订单，保留原名单；已检查结果不转移给其他人。
            </p>
            <div className="form-grid">
              <label>
                替检人
                <select
                  aria-label="替检人"
                  value={replacement}
                  onChange={(e) => setReplacement(e.target.value)}
                >
                  <option value="">请选择</option>
                  {state.patients
                    .filter((p) => p.id !== a.patientId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.sex} · {p.company}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                替检原因
                <input
                  aria-label="替检原因"
                  value={replacementReason}
                  onChange={(e) => setReplacementReason(e.target.value)}
                />
              </label>
            </div>
            <button
              className="btn"
              disabled={a.locked || !["booked", "paid"].includes(a.status)}
              onClick={() => {
                if (!replacement || !replacementReason.trim())
                  return setError("请选择替检人并填写原因");
                const old = state.patients.find((p) => p.id === a.patientId)!;
                if (old.company === "个检") return setError("仅团检订单可替检");
                const items = a.items.filter(
                  (item) =>
                    !getOrderRules(state).some(
                      (r) =>
                        r.item === item &&
                        r.sex &&
                        r.sex !== "不限" &&
                        r.sex !==
                          state.patients.find((p) => p.id === replacement)?.sex,
                    ),
                );
                act({
                  type: "UPDATE_APPOINTMENT",
                  payload: {
                    id: a.id,
                    patientId: replacement,
                    items,
                    results: {},
                    replacements: [
                      ...(a.replacements || []),
                      {
                        originalPatientId: a.patientId,
                        replacementPatientId: replacement,
                        reason: replacementReason,
                        at: new Date().toISOString(),
                      },
                    ],
                  },
                });
                setReplacement("");
                setReplacementReason("");
                setError("");
              }}
            >
              确认替检并更新订单
            </button>
            {(a.replacements || []).map((r: any, i: number) => (
              <p key={i}>
                {state.patients.find((p) => p.id === r.originalPatientId)?.name}{" "}
                →{" "}
                {
                  state.patients.find((p) => p.id === r.replacementPatientId)
                    ?.name
                }{" "}
                · {r.reason}
              </p>
            ))}
          </details>
          <div className="actions">
            <button
              className="btn"
              disabled={
                a.locked || !state.config.allowAdd || a.status !== "booked"
              }
              onClick={() => {
                setDetail("");
                setSelected([a.id]);
                document
                  .getElementById("batch-ordering-workspace")
                  ?.setAttribute("open", "");
              }}
            >
              进入项目加项
            </button>
            <button
              className="btn"
              onClick={() => {
                setPatient(a.patientId);
                setPkg(a.packageId);
                setOtherPackages(
                  (a.packageIds || []).filter(
                    (id: string) => id !== a.packageId,
                  ),
                );
                setExtraItems([]);
                setLineDiscounts({});
                setOutsideGroupPersonalPay(false);
                setDate(today());
                setCampus(a.campus);
                setDetail("");
                setError("");
                submitting.current = false;
                setOpen(true);
              }}
            >
              克隆预约
            </button>
            <button
              className="btn"
              disabled={a.locked && !canUnlockOrder(state, a)}
              onClick={() =>
                act({
                  type: "UPDATE_APPOINTMENT",
                  payload: { id: a.id, locked: !a.locked },
                })
              }
            >
              {a.locked ? "解锁订单" : "锁定订单"}
            </button>
            <button
              className="btn danger"
              disabled={a.locked || !["booked", "paid"].includes(a.status)}
              onClick={() =>
                act({
                  type: "UPDATE_APPOINTMENT",
                  payload: { id: a.id, status: "cancelled" },
                })
              }
            >
              取消预约
            </button>
          </div>
          <div className="notice">
            变更、加项、弃检、到检均写入操作追踪；取消保留历史订单。真实退款和身份验证未接入。
          </div>
        </Modal>
      )}
    </>
  );
}
export function Exam() {
  const { state, act } = useDemo();
  const requestedId = new URLSearchParams(
    window.location.hash.split("?")[1] || "",
  ).get("appointmentId");
  const requestedOrder = state.appointments.find((a) => a.id === requestedId);
  const [examDate, setExamDate] = useState(requestedOrder?.date || today());
  const [examPhase, setExamPhase] = useState("未检/在检");
  const [examQuery, setExamQuery] = useState("");
  const list = state.appointments.filter(
    (a) =>
      a.date === examDate &&
      (examPhase === "未检/在检"
        ? ["checked", "in_exam"]
        : ["review", "approved", "printed"]
      ).includes(a.status) &&
      `${a.id} ${state.patients.find((p) => p.id === a.patientId)?.name}`.includes(
        examQuery,
      ),
  );
  const [id, setId] = useState(
    list.find((a) => a.id === requestedId)?.id || list[0]?.id || "",
  );
  const [department, setDepartment] = useState("全科检查");
  const [examDoctor, setExamDoctor] = useState("");
  const [examRoom, setExamRoom] = useState("");
  const a = list.find((a) => a.id === id) || list[0];
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [summary, setSummary] = useState("");
  const [override, setOverride] = useState(false);
  const [sample, setSample] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [critical, setCritical] = useState(false);
  useEffect(() => {
    setDraft({});
    setSummary("");
    setError("");
    setOverride(false);
    setExamDoctor("");
    setExamRoom("");
    setSample(false);
    setCritical(false);
  }, [a?.id]);
  const allDepartments = [
    ...new Set(clinicalRules(state).map((r) => r.department)),
  ];
  const allowedDepartments: string[] =
    state.config.doctorAllowedDepartments?.[state.config.role] ||
    allDepartments;
  const activeDepartment = allowedDepartments.includes(department)
    ? department
    : allowedDepartments[0] || "";
  const examFilters = (
    <div className="toolbar">
      <label>
        分检业务日期
        <input
          type="date"
          value={examDate}
          onChange={(e) => setExamDate(e.target.value)}
        />
      </label>
      <label>
        当日检查范围
        <select
          value={examPhase}
          onChange={(e) => setExamPhase(e.target.value)}
        >
          <option>未检/在检</option>
          <option>已检</option>
        </select>
      </label>
      <label>
        姓名 / 体检号定位
        <input
          value={examQuery}
          onChange={(e) => setExamQuery(e.target.value)}
        />
      </label>
      <span>{list.length} 位客户</span>
    </div>
  );
  if (!a)
    return (
      <>
        <PageTitle
          title="分检工作站"
          description="先在开单登记完成到检，再进行科室检查。"
        />
        {examFilters}
        <ClinicalRuleEditor />
        <Empty text="当前无待检查客户" />
        <UndoExam />
        <a className="btn btn-primary" href="#/appointments">
          前往登记
        </a>
      </>
    );
  const p = state.patients.find((p) => p.id === a.patientId)!;
  const values = { ...a.results, ...draft };
  const examItems = clinicalItems(state, a);
  const visibleItems = examItems.filter(
    (item) =>
      (clinicalRules(state).find((r) => r.item === item)?.department ||
        "全科检查") === activeDepartment,
  );
  const foundAbnormal = clinicalAbnormalities(state, values);
  const criticalResults = foundAbnormal.filter((r) => r.critical);
  const isCritical = criticalResults.length > 0;
  const save = (complete: boolean) => {
    if (a.locked) return setError("订单已锁定，不能保存或上报新的检查结果。");
    if (!["checked", "in_exam"].includes(a.status))
      return setError("当前为已检记录，只读查看，不能再次保存或上报。");
    if (!activeDepartment) return setError("当前医生没有允许的检查科室");
    if (
      complete &&
      (a.examAdditions || []).some((r: any) => r.status === "待付款")
    )
      return setError("检中加项差额尚未付款，请付款或取消后提交");
    const validation = validateClinicalResults(state, examItems, values);
    if (validation.length) return setError(validation.join("；"));
    if (complete && examItems.some((x) => !values[x]?.trim()))
      return setError("仍有未录入的检查项目，请补全或在订单中登记弃检。");
    if (values["空腹血糖"] && !Number.isFinite(Number(values["空腹血糖"])))
      return setError("空腹血糖必须为数值型结果（mmol/L），不能提交文字。");
    if (isCritical && (!override || !summary.trim()))
      return setError(
        "结果触发演示异常阈值，请确认已复核，并填写分检小结后提交。",
      );
    act({
      type: "SAVE_RESULTS",
      payload: {
        id: a.id,
        results: aggregateClinicalResults(state, a, values),
        metadataItems: visibleItems,
        complete,
        conclusion: summary,
        doctor: examDoctor.trim() || a.doctor || "演示分检医生",
        department: activeDepartment,
        room: examRoom.trim() || `${department}01诊室`,
      },
    });
    if (isCritical) {
      criticalResults.forEach((result, index) =>
        act({
          type: "UPSERT_RECORD",
          payload: {
            collection: "alerts",
            record: {
              id: "ALERT-" + a.id + (index ? "-" + result.item : ""),
              title: result.item + "异常（演示）",
              patientId: p.id,
              appointmentId: a.id,
              status: "待处理",
              value: result.value,
              item: result.item,
              risk: "A类",
            },
          },
        }),
      );
      setCritical(true);
    }
    setDraft({});
    setError("");
  };
  return (
    <>
      <PageTitle
        eyebrow="CLINICAL / 科室工作站"
        title="分检工作站"
        description="采样登记、结果录入与异常上报。数值阈值仅为交互测试样例。"
        actions={
          <select
            aria-label="当前检查科室"
            value={activeDepartment}
            onChange={(e) => setDepartment(e.target.value)}
          >
            {allowedDepartments.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        }
      />
      <UndoExam />
      {examFilters}
      <ClinicalRuleEditor />
      <details>
        <summary>妇科标本待采与病理标签</summary>
        <GynecologySpecimens />
      </details>
      <div className="clinical-layout">
        <aside className="panel patient-list">
          <h3>
            今日候检 <Badge>{list.length}</Badge>
          </h3>
          {list.map((x) => {
            const p = state.patients.find((p) => p.id === x.patientId)!;
            return (
              <button
                className={a.id === x.id ? "selected" : ""}
                key={x.id}
                onClick={() => {
                  setId(x.id);
                  setDraft({});
                  setSummary("");
                  setError("");
                  setOverride(false);
                }}
              >
                <span className="avatar">{p.name.slice(-2)}</span>
                <span>
                  <strong>{p.name}</strong>
                  <small>
                    {p.sex} · {p.age}岁 · {x.id.slice(-4)}
                  </small>
                </span>
                <StatusBadge status={x.status} />
              </button>
            );
          })}
        </aside>
        <section
          className="panel clinical-main"
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              save(true);
            }
          }}
        >
          <div className="clinical-person">
            <span className="avatar large">{p.name.slice(-2)}</span>
            <div>
              <h2>
                {p.name} <Badge tone="gray">合成客户</Badge>
              </h2>
              <p>
                {p.sex} · {p.age}岁 · {p.company} · {a.campus}
              </p>
            </div>
            <div className="spacer" />
            <button
              className="btn"
              onClick={() => setShowHistory(!showHistory)}
            >
              <Clock size={16} />
              历次结果
            </button>
            <button className="btn" onClick={() => setSample(true)}>
              <ScanLine size={16} />
              采样条码
            </button>
          </div>
          <div className="notice">
            检前信息以下方实际保存的合成档案为准；影像 / LIS /
            身份照片仅为模拟状态，无真实数据接口。
          </div>
          <PreExamContext key={"PreExamContext-" + a.id} appointment={a} />
          {showHistory && (
            <HistoricalOrderPanel
              key={"history-" + a.id}
              appointment={a}
              onUse={(v) => setDraft({ ...draft, ...v })}
            />
          )}
          <ResultTemplateTools
            key={"result-" + a.id}
            appointment={a}
            onApply={(item, value, s) => {
              setDraft({ ...draft, [item]: value });
              setSummary(s);
            }}
          />
          <div className="panel-heading">
            <h3>{activeDepartment} · 检查结果</h3>
            <button
              className="text-btn"
              onClick={() =>
                setDraft(
                  Object.fromEntries(
                    visibleItems.map((x) => [x, clinicalExample(state, x)]),
                  ),
                )
              }
            >
              填入正常示例
            </button>
          </div>
          <table className="results-table">
            <thead>
              <tr>
                <th>检查项目</th>
                <th>本次结果</th>
                <th>参考 / 类型</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((x) => (
                <tr key={x}>
                  <td>
                    <strong>{x}</strong>
                    <small>{x === "空腹血糖" ? "mmol/L" : "科室检查"}</small>
                  </td>
                  <td>
                    <input
                      aria-label={x + "结果"}
                      value={values[x] || ""}
                      onChange={(e) =>
                        setDraft({ ...draft, [x]: e.target.value })
                      }
                      inputMode={
                        clinicalRules(state).find((r) => r.item === x)?.kind ===
                        "number"
                          ? "decimal"
                          : "text"
                      }
                      disabled={
                        a.locked || !["checked", "in_exam"].includes(a.status)
                      }
                      placeholder={
                        x === "空腹血糖" ? "输入数值" : "输入检查所见"
                      }
                    />
                  </td>
                  <td>
                    {clinicalRules(state).find((r) => r.item === x)?.kind ===
                    "number"
                      ? `数值型 · 正常范围 ${clinicalRules(state).find((r) => r.item === x)?.abnormalMin ?? "不限"}—${clinicalRules(state).find((r) => r.item === x)?.abnormalMax ?? "不限"}`
                      : "描述型 · 已维护结果字典"}
                  </td>
                  <td>
                    <Badge
                      tone={
                        foundAbnormal.some((r) => r.item === x)
                          ? "red"
                          : values[x]
                            ? "green"
                            : "gray"
                      }
                    >
                      {foundAbnormal.some((r) => r.item === x)
                        ? "异常待复核"
                        : values[x]
                          ? "已录入"
                          : "待录入"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Suspense fallback={<p>载入身份对照…</p>}>
            <IdentityPhotoViewer appointmentId={a.id} />
          </Suspense>
          <PastHistoryNotice
            key={"past-history-" + a.id + (p.pastMedicalHistory || "")}
            appointmentId={a.id}
          />
          <RegistrationConsents key={"consent-" + a.id} appointmentId={a.id} />
          <div className="form-grid">
            <label className="field">
              本次分检医生（合成）
              <input
                value={examDoctor || a.doctor || "演示分检医生"}
                onChange={(e) => setExamDoctor(e.target.value)}
              />
            </label>
            <label className="field">
              本次分检诊室
              <input
                value={examRoom || `${department}01诊室`}
                onChange={(e) => setExamRoom(e.target.value)}
              />
            </label>
          </div>
          <ExamExtras key={"exam-extras-" + a.id} appointmentId={a.id} />
          <InExamAdditions key={"extra-" + a.id} appointment={a} />
          <SyntheticRecording key={"audio-" + a.id} appointment={a} />
          <SelectedResultPrint key={"print-" + a.id} appointment={a} />
          <p className="muted">
            快捷提交：Ctrl / ⌘ + Enter，执行同一必填与锁定校验。
          </p>
          <label className="field">
            分检小结 / 医学建议（演示）
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="填写所见、小结与建议；演示数据不用于临床决策"
            />
          </label>
          {isCritical && (
            <label className="check-line">
              <input
                type="checkbox"
                checked={override}
                onChange={(e) => setOverride(e.target.checked)}
              />
              已复核异常结果，确认继续并进入异常上报流程
            </label>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <span>
              {Object.keys(values).filter((x) => values[x]).length} /{" "}
              {a.items.length} 项已录入
            </span>
            <button className="btn" onClick={() => save(false)}>
              保存草稿
            </button>
            <button className="btn btn-primary" onClick={() => save(true)}>
              <Check size={16} />
              提交分检结果
            </button>
          </div>
        </section>
      </div>
      {sample && (
        <Modal title="采样与条码工作站 · 模拟" onClose={() => setSample(false)}>
          <SpecimenStation initialAppointmentId={a.id} />
        </Modal>
      )}
      {critical && (
        <Modal title="重大异常已上报" onClose={() => setCritical(false)}>
          <div className="callout alert">
            <TriangleAlert />
            <p>
              异常已进入全局待办。请由健康管理岗位记录处置结果，并选择是否持续随访。当前仅模拟消息，不发送真实通知。
            </p>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => setCritical(false)}
          >
            我已知晓
          </button>
        </Modal>
      )}
    </>
  );
}
export function Review() {
  const { state, act } = useDemo();
  const [overdueOnly, setOverdueOnly] = useState(false);
  const daysOld = (a: Appointment) =>
    Math.floor((Date.now() - new Date(a.date).getTime()) / 86400000);
  const list = sortReviewAppointments(
    state,
    state.appointments.filter(
      (a) =>
        a.status === "review" && (!overdueOnly || isReportOverdue(state, a)),
    ),
  );
  const [id, setId] = useState(list[0]?.id || "");
  const [text, setText] = useState("");
  const [reason, setReason] = useState("");
  const [reject, setReject] = useState(false);
  const [abnormal, setAbnormal] = useState(false);
  const [rejectItems, setRejectItems] = useState<string[]>([]);
  const a = list.find((x) => x.id === id) || list[0];
  if (!a)
    return (
      <>
        <PageTitle
          title="总检审核工作站"
          description="所有当前报告已处理，可从分检工作站提交新的报告。"
        />
        <Empty text="没有待审核报告" />
        <ReviewWorkflowSettings />
        {overdueOnly && (
          <button className="btn" onClick={() => setOverdueOnly(false)}>
            显示全部待审核报告
          </button>
        )}
      </>
    );
  const p = state.patients.find((p) => p.id === a.patientId)!;
  return (
    <>
      <PageTitle
        eyebrow="REVIEW / 报告质控"
        title="总检审核工作站"
        description="初审、主检、总检三级递进，所有审核与驳回操作留痕。"
      />
      <ReviewWorkflowSettings />
      <div className="clinical-layout">
        <aside className="panel patient-list">
          <h3>
            待审核报告 <Badge>{list.length}</Badge>
          </h3>
          <label className="check-line">
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(e) => setOverdueOnly(e.target.checked)}
            />
            仅看超期报告
          </label>
          {list.map((x) => (
            <button
              key={x.id}
              className={x.id === a.id ? "selected" : ""}
              onClick={() => {
                setId(x.id);
                setText("");
              }}
            >
              <span className="avatar">
                {state.patients
                  .find((p) => p.id === x.patientId)
                  ?.name.slice(-2)}
              </span>
              <span>
                <strong>
                  {state.patients.find((p) => p.id === x.patientId)?.name}
                </strong>
                <small>
                  {reviewNodes(state, x)[x.reviewStage || 0]} ·{" "}
                  {x.doctor || "未分配"}
                </small>
                {isCriticalReviewAppointment(state, x) && (
                  <Badge tone="red">危急 · 优先审核</Badge>
                )}
                {isReportOverdue(state, x) && (
                  <Badge tone="red">超期{daysOld(x)}天</Badge>
                )}
              </span>
              <ChevronRight size={16} />
            </button>
          ))}
        </aside>
        <section className="panel clinical-main">
          <div className="clinical-person">
            <div>
              <h2>{p.name} 的体检报告</h2>
              <p>
                {a.id} · {p.sex} / {p.age} 岁 · {a.campus}
              </p>
            </div>
            <div className="spacer" />
            <Badge tone={p.risk === "A类" ? "red" : "amber"}>{p.risk}</Badge>
            <button
              className="btn"
              disabled={a.locked && !canUnlockOrder(state, a)}
              onClick={() =>
                act({
                  type: "UPDATE_APPOINTMENT",
                  payload: { id: a.id, locked: !a.locked },
                })
              }
            >
              {a.locked ? "解除审核锁定" : "锁定报告"}
            </button>
          </div>
          <div className="review-steps">
            {reviewNodes(state, a).map((x, i) => (
              <div
                className={(a.reviewStage || 0) >= i ? "active" : ""}
                key={x}
              >
                <span>
                  {(a.reviewStage || 0) > i ? <Check size={15} /> : i + 1}
                </span>
                {x}
                <small>
                  {(a.reviewStage || 0) > i
                    ? "已完成"
                    : (a.reviewStage || 0) === i
                      ? "当前环节"
                      : "待处理"}
                </small>
              </div>
            ))}
          </div>
          <PreExamContext key={"PreExamContext-" + a.id} appointment={a} />
          <HistoricalOrderPanel
            key={"HistoricalOrderPanel-" + a.id}
            appointment={a}
          />
          <ReviewWorkflowTools
            key={"ReviewWorkflowTools-" + a.id}
            appointment={a}
            onConclusion={setText}
          />
          <div className="panel-heading">
            <h3>结果核对与历年对比</h3>
            <label className="check-line">
              <input
                type="checkbox"
                checked={abnormal}
                onChange={(e) => setAbnormal(e.target.checked)}
              />
              仅看异常
            </label>
          </div>
          <table>
            <thead>
              <tr>
                <th>检查项目</th>
                <th>本次结果</th>
                <th>上次结果</th>
                <th>质控提示</th>
              </tr>
            </thead>
            <tbody>
              {clinicalItems(state, a)
                .filter(
                  (x) =>
                    !abnormal ||
                    clinicalAbnormalities(state, a.results).some(
                      (r) => r.item === x,
                    ),
                )
                .map((x) => (
                  <tr key={x}>
                    <td>{x}</td>
                    <td>
                      <strong
                        className={
                          clinicalAbnormalities(state, a.results).some(
                            (r) => r.item === x,
                          )
                            ? "danger"
                            : ""
                        }
                      >
                        {a.results[x] || "未回传"}
                      </strong>
                    </td>
                    <td>
                      {localHistoricalOrders(state, a)[0]?.results[x] ||
                        "— 未收录"}
                    </td>
                    <td>
                      {!a.results[x] ? (
                        <Badge tone="red">结果缺失</Badge>
                      ) : clinicalAbnormalities(state, a.results).some(
                          (r) => r.item === x,
                        ) ? (
                        <Badge tone="amber">需复核</Badge>
                      ) : (
                        <Badge tone="gray">已核对</Badge>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          <div className="callout">
            <Activity size={20} />
            <div>
              <strong>辅助主检 · 本地规则模拟</strong>
              <p>
                关联异常合并与文书质控演示，不使用医疗 AI 服务，不构成医学建议。
              </p>
              <button
                className="text-btn"
                onClick={() =>
                  setText(analyzeDemoResults(a.results).conclusion)
                }
              >
                生成关联异常综合建议
              </button>
            </div>
          </div>
          <label className="field">
            综合结论与指导意见
            <textarea
              rows={4}
              value={text || a.conclusion}
              onChange={(e) => setText(e.target.value)}
              placeholder="审核者填写综合建议，或使用上方演示规则生成后编辑"
            />
          </label>
          <div className="actions">
            <label>
              责任医生
              <select
                value={a.doctor || "周医生"}
                onChange={(e) =>
                  act({
                    type: "UPDATE_APPOINTMENT",
                    payload: { id: a.id, doctor: e.target.value },
                  })
                }
              >
                {[
                  ...new Set([
                    "周医生",
                    "余医生",
                    ...(state.records.reviewDoctorLevels || []).map(
                      (r) => r.name,
                    ),
                  ]),
                ]
                  .filter((name) => reviewDoctorEligible(state, a, name))
                  .map((name) => (
                    <option key={name}>{name}</option>
                  ))}
              </select>
            </label>
            <button
              className="btn"
              onClick={() => {
                act({
                  type: "ADD_TASK",
                  payload: {
                    patientId: p.id,
                    title: "总检异常跟进",
                    id: "REVIEW-FOLLOW-" + a.id,
                    appointmentId: a.id,
                    risk: p.risk,
                  },
                });
              }}
            >
              创建随访任务
            </button>
          </div>
          <details>
            <summary>排班分配、重大阳性与复查控制</summary>
            <ReviewTools appointmentId={a.id} />
            <button className="btn" onClick={() => setText(a.conclusion)}>
              将工具保存的结论载入编辑区
            </button>
          </details>
          <div className="modal-actions">
            <button
              className="btn danger"
              disabled={a.locked}
              onClick={() => {
                setRejectItems(a.items);
                setReject(true);
              }}
            >
              驳回重检
            </button>
            <button
              className="btn btn-primary"
              disabled={
                a.locked ||
                !reviewDoctorEligible(state, a, a.doctor || "周医生") ||
                a.items.some((x) => !a.results[x]) ||
                !(text || a.conclusion).trim()
              }
              onClick={() => {
                act({
                  type: "REVIEW",
                  payload: {
                    id: a.id,
                    conclusion: text || a.conclusion,
                    expectedStage: a.reviewStage || 0,
                  },
                });
                setText("");
              }}
            >
              通过{reviewNodes(state, a)[a.reviewStage || 0]}
            </button>
          </div>
        </section>
      </div>
      {reject && (
        <Modal title="退回报告" onClose={() => setReject(false)}>
          <div className="checkbox-grid">
            {a.items.map((item) => (
              <label key={item}>
                <input
                  type="checkbox"
                  checked={rejectItems.includes(item)}
                  onChange={(e) =>
                    setRejectItems(
                      e.target.checked
                        ? [...rejectItems, item]
                        : rejectItems.filter((x) => x !== item),
                    )
                  }
                />
                {item}
              </label>
            ))}
          </div>
          <ClinicalTemplatePicker
            state={state}
            appointment={a}
            kind="reject"
            onApply={(value) => setReason(value)}
          />
          <label className="field">
            驳回原因（必填）
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="填写需要补充/复核的项目与原因"
            />
          </label>
          <div className="modal-actions">
            <button className="btn" onClick={() => setReject(false)}>
              取消
            </button>
            <button
              className="btn btn-primary"
              disabled={!reason.trim() || !rejectItems.length}
              onClick={() => {
                act({
                  type: "REJECT",
                  payload: { id: a.id, reason, items: rejectItems },
                });
                setReject(false);
              }}
            >
              确认驳回
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function Reports() {
  const { state, act } = useDemo();
  const [q, setQ] = useState("");
  const [reportFilters, setReportFilters] = useState(defaultReportFilters);
  const [selected, setSelected] = useState("");
  const [template, setTemplate] = useState("年度健康报告");
  const [batch, setBatch] = useState<string[]>([]);
  const [flowIds, setFlowIds] = useState<string[]>([]);
  const list = filterReports(
    state,
    state.appointments.filter(
      (a) =>
        ["approved", "printed"].includes(a.status) &&
        [a.id, state.patients.find((p) => p.id === a.patientId)?.name]
          .join("")
          .includes(q),
    ),
    reportFilters,
  );
  const a = state.appointments.find((a) => a.id === selected);
  const reportText = (a: Appointment) =>
    `${template}\n【合成演示报告，不用于医疗诊断】\n姓名：${state.patients.find((p) => p.id === a.patientId)?.name}\n体检号：${a.id}\n日期：${a.date}\n${clinicalItems(
      state,
      a,
    )
      .map((i) => i + "：" + a.results[i])
      .join("\n")}\n综合结论：${a.conclusion}`;
  return (
    <>
      <PageTitle
        eyebrow="REPORTS / 报告中心"
        title="体检报告与档案"
        description="审核通过后可预览、打印、装订、入库与发放。硬件操作仅为模拟。"
        actions={
          <a className="btn btn-primary" href="#/kiosk?mode=report">
            <Printer size={16} />
            报告自助机
          </a>
        }
      />
      <details className="panel">
        <summary>真实PDF生成与报告版式</summary>{" "}
        <Suspense fallback={<p>载入PDF文件工具…</p>}>
          <ReportDelivery
            selectedIds={batch.length ? batch : selected ? [selected] : []}
          />
        </Suspense>
      </details>
      <ReportSearchControls onChange={setReportFilters} />
      <ReportArchive
        appointmentIds={batch.length ? batch : selected ? [selected] : []}
      />
      <section className="panel">
        <div className="toolbar">
          <div className="search-field">
            <Search size={16} />
            <input
              aria-label="搜索报告"
              placeholder="姓名 / 体检号"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <span className="spacer" />
          <button
            className="btn"
            disabled={!batch.length}
            onClick={() => {
              setFlowIds([...batch]);
              setSelected("");
            }}
          >
            批量领取 / 发放单 ({batch.length})
          </button>
          <button
            className="btn"
            disabled={!batch.length}
            onClick={() =>
              batch.forEach((id) => act({ type: "PRINT", payload: { id } }))
            }
          >
            批量模拟打印
          </button>
          <button
            className="btn"
            onClick={() =>
              exportCsv(
                "报告档案.csv",
                list.map((a) => ({
                  编号: a.id,
                  姓名: state.patients.find((p) => p.id === a.patientId)?.name,
                  打印时间: a.printedAt || "",
                  报告柜: a.cabinet || "",
                  领取: a.delivered ? "已领取" : "未领取",
                })),
              )
            }
          >
            导出档案
          </button>
        </div>
        <div className="table-scroll report-table-scroll">
          <table>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="全选报告"
                    checked={list.length > 0 && batch.length === list.length}
                    onChange={(e) =>
                      setBatch(e.target.checked ? list.map((a) => a.id) : [])
                    }
                  />
                </th>
                <th>体检客户</th>
                <th>报告日期</th>
                <th>审核状态</th>
                <th>打印次数</th>
                <th>存放位置</th>
                <th>领取状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={"选择报告" + a.id}
                      checked={batch.includes(a.id)}
                      onChange={(e) =>
                        setBatch(
                          e.target.checked
                            ? [...batch, a.id]
                            : batch.filter((x) => x !== a.id),
                        )
                      }
                    />
                  </td>
                  <td>
                    <strong>
                      {state.patients.find((p) => p.id === a.patientId)?.name}
                    </strong>
                    <small>{a.id}</small>
                  </td>
                  <td>{a.date}</td>
                  <td>
                    <StatusBadge status={a.status} />
                  </td>
                  <td>{a.printCount || 0}</td>
                  <td>{a.cabinet || "未入库"}</td>
                  <td>
                    <Badge tone={a.delivered ? "green" : "gray"}>
                      {a.delivered ? "已领取" : "待领取"}
                    </Badge>
                  </td>
                  <td>
                    <button
                      className="text-btn"
                      onClick={() => setSelected(a.id)}
                    >
                      预览 / 管理
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!list.length && <Empty />}
      </section>
      {a && (
        <Modal title="体检报告预览与流转" onClose={() => setSelected("")} wide>
          <div className="toolbar">
            <select
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
            >
              <option>年度健康报告</option>
              <option>入职体检报告</option>
              <option>VIP 体检报告</option>
            </select>
          </div>
          <article className="report-paper" id="report-print">
            <div className="report-mark">红创 · 健康管理中心</div>
            <h2>{template}</h2>
            <p className="report-warning">
              合成数据 / 展示样本 / 不作为诊疗依据
            </p>
            <div className="detail-grid">
              <div>
                姓名：{state.patients.find((p) => p.id === a.patientId)?.name}
              </div>
              <div>体检号：{a.id}</div>
              <div>体检日期：{a.date}</div>
              <div>院区：{a.campus}</div>
            </div>
            <HistoricalOrderPanel
              key={"report-history-" + a.id}
              appointment={a}
            />
            <h3>检查结果</h3>
            <div className="table-scroll report-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>项目</th>
                    <th>本次</th>
                  </tr>
                </thead>
                <tbody>
                  {clinicalItems(state, a).map((x) => (
                    <tr key={x}>
                      <td>{x}</td>
                      <td>{a.results[x]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3>综合结论</h3>
            <p>{a.conclusion}</p>
            <div className="report-sign">
              审核医生：{a.doctor || "周医生"}（模拟）
              <span>本报告仅用于软件流程展示</span>
            </div>
          </article>
          <div className="actions">
            <button
              className="btn"
              onClick={() => download(a.id + "-演示报告.txt", reportText(a))}
            >
              <Download size={15} />
              导出文本报告
            </button>
            <button className="btn" onClick={() => window.print()}>
              <Printer size={15} />
              浏览器打印 / 存 PDF
            </button>
            <button
              className="btn"
              onClick={() => act({ type: "PRINT", payload: { id: a.id } })}
            >
              模拟打印报告
            </button>
            <button
              className="btn btn-primary"
              disabled={a.delivered}
              onClick={() => {
                setFlowIds([a.id]);
                setSelected("");
              }}
            >
              登记领取
            </button>
          </div>
        </Modal>
      )}
      {flowIds.length > 0 && (
        <Modal title="报告发放登记" onClose={() => setFlowIds([])} wide>
          <ReportArchive appointmentIds={flowIds} initialOperation="issue" />
        </Modal>
      )}
      <details className="panel">
        <summary>团体健康报告与Word导出</summary>
        <Suspense fallback={<p>载入团体报告…</p>}>
          <GroupReportBuilder />
        </Suspense>
      </details>
      <details>
        <summary>报告解读、标本与回收工作量</summary>
        <ReportOperations />
      </details>
    </>
  );
}
export { default as Queue } from "./Queue";
const seedBills = [
  {
    id: "B001",
    name: "星辰科技",
    total: 125000,
    paid: 80000,
    days: 24,
    deadline: "2026-10-30",
  },
  {
    id: "B002",
    name: "云海设计",
    total: 68000,
    paid: 20000,
    days: 45,
    deadline: "2026-09-30",
  },
  {
    id: "B003",
    name: "远帆制造",
    total: 98000,
    paid: 60000,
    days: 78,
    deadline: "2026-08-30",
  },
  {
    id: "B004",
    name: "晨光文创",
    total: 36000,
    paid: 0,
    days: 125,
    deadline: "2026-07-30",
  },
  {
    id: "B005",
    name: "同济商贸",
    total: 19000,
    paid: 0,
    days: 210,
    deadline: "2026-04-30",
  },
];
export function Finance() {
  const { state, act } = useDemo();
  const [tab, setTab] = useState("团检账期");
  const [bill, setBill] = useState("");
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState("银行回款（模拟）");
  const [error, setError] = useState("");
  const bills = seedBills.map((b) => ({
    ...b,
    ...state.records.bills?.find((r) => r.id === b.id),
  }));
  const selected = bills.find((b) => b.id === bill);
  const aging = [
    bills.filter((b) => b.days <= 30),
    bills.filter((b) => b.days > 30 && b.days <= 60),
    bills.filter((b) => b.days > 60 && b.days <= 90),
    bills.filter((b) => b.days > 90 && b.days <= 180),
    bills.filter((b) => b.days > 180),
  ].map((bs) => bs.reduce((s, b) => s + b.total - b.paid, 0));
  return (
    <>
      <PageTitle
        eyebrow="FINANCE / 财务与结算"
        title="财务结算中心"
        description="收款、退款、团检分批结算与账龄分析。全部为账务状态模拟。"
        actions={
          <button
            className="btn"
            onClick={() => exportCsv("团检账龄.csv", bills)}
          >
            <Download size={16} />
            导出结算报表
          </button>
        }
      />
      <div className="metrics">
        <Metric
          label="订单应收总额"
          value={
            "¥" +
            state.appointments
              .filter((a) => a.status !== "cancelled")
              .reduce((s, a) => s + a.amount, 0)
              .toLocaleString()
          }
        >
          <Wallet size={20} />
        </Metric>
        <Metric
          label="团检未结算"
          value={
            "¥" +
            bills.reduce((s, b) => s + b.total - b.paid, 0).toLocaleString()
          }
        />
        <Metric
          label="逾期 90 天以上"
          value={"¥" + (aging[3] + aging[4]).toLocaleString()}
        />
        <Metric
          label="开票 / 支付接口"
          value="模拟状态"
          note="不产生真实财务凭证"
        />
      </div>
      <Suspense fallback={<p>载入真实本地账龄…</p>}>
        <InvoiceAging />
      </Suspense>
      <p className="muted">
        以下合同回款区为独立合成历史样本账，账龄采用样本预置天数；上方发票账龄按真实本地日期与已登记收款计算。
      </p>
      <div className="tabs">
        {["团检账期", "个检收退费", "会员卡与开票"].map((t) => (
          <button
            key={t}
            className={t === tab ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "团检账期" ? (
        <div className="finance-layout">
          <section className="panel">
            <div className="panel-heading">
              <h2>单位结算与回款</h2>
              <Badge tone="amber">★ 账期 / 账龄</Badge>
            </div>
            <table>
              <thead>
                <tr>
                  <th>体检单位</th>
                  <th>合同 / 已回款</th>
                  <th>未结算金额</th>
                  <th>账龄</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <strong>{b.name}</strong>
                      <small>到期 {b.deadline}</small>
                      {b.deadline < today() && b.paid < b.total && (
                        <Badge tone="red">回款已到期 · 本地提醒</Badge>
                      )}
                      <label className="muted">
                        应回款日
                        <input
                          type="date"
                          aria-label={b.name + "应回款日"}
                          value={b.deadline}
                          onChange={(e) =>
                            act({
                              type: "UPSERT_RECORD",
                              payload: {
                                collection: "bills",
                                record: { ...b, deadline: e.target.value },
                              },
                            })
                          }
                        />
                      </label>
                    </td>
                    <td>
                      ¥{b.total.toLocaleString()}
                      <small>已回款 ¥{b.paid.toLocaleString()}</small>
                    </td>
                    <td>
                      <strong>¥{(b.total - b.paid).toLocaleString()}</strong>
                    </td>
                    <td>
                      <Badge
                        tone={
                          b.days > 90 ? "red" : b.days > 30 ? "amber" : "green"
                        }
                      >
                        {b.days} 天
                      </Badge>
                    </td>
                    <td>
                      <button
                        className="text-btn"
                        disabled={b.paid >= b.total}
                        onClick={() => {
                          setBill(b.id);
                          setAmount(b.total - b.paid);
                          setError("");
                        }}
                      >
                        分批结算
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="panel">
            <h2>未结算账龄分布</h2>
            <Bars
              values={aging.map((v) => v / 1000)}
              labels={["≤30天", "31–60", "61–90", "91–180", ">180"]}
            />
            <p className="muted">
              单位：千元。原条款 0–30 / 30–60
              等边界重叠；本演示使用互斥区间，正式计龄规则待院方确认。
            </p>
          </section>
        </div>
      ) : tab === "个检收退费" ? (
        <section className="panel">
          <table>
            <thead>
              <tr>
                <th>客户 / 订单</th>
                <th>应收</th>
                <th>单位支付 / 个人支付</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {state.appointments
                .filter((a) => a.status !== "cancelled")
                .map((a) => (
                  <tr key={a.id}>
                    <td>
                      <strong>
                        {state.patients.find((p) => p.id === a.patientId)?.name}
                      </strong>
                      <small>{a.id}</small>
                    </td>
                    <td>¥{a.amount}</td>
                    <td>
                      ¥{a.groupSplit?.unit || 0} / ¥
                      {a.groupSplit?.personal ?? a.amount}
                    </td>
                    <td>
                      <StatusBadge status={a.status} />
                      {a.refunded && <Badge tone="amber">已模拟退款</Badge>}
                    </td>
                    <td>
                      {a.status === "booked" ? (
                        <button
                          className="text-btn"
                          onClick={() =>
                            act({
                              type: "PAYMENT",
                              payload: { id: a.id, method: "模拟收款" },
                            })
                          }
                        >
                          模拟收费
                        </button>
                      ) : (
                        <button
                          className="text-btn"
                          disabled={a.refunded}
                          onClick={() =>
                            act({
                              type: "UPDATE_APPOINTMENT",
                              payload: {
                                id: a.id,
                                refunded: true,
                                refundAmount: a.amount,
                              },
                            })
                          }
                        >
                          模拟全退
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      ) : (
        <section className="panel">
          <div className="panel-heading">
            <h2>会员卡、套餐卡与电子发票</h2>
            <button
              className="btn btn-primary"
              onClick={() =>
                act({
                  type: "UPSERT_RECORD",
                  payload: {
                    collection: "cards",
                    record: {
                      name: "演示会员卡",
                      balance: 1000,
                      status: "有效",
                    },
                  },
                })
              }
            >
              新增模拟会员卡
            </button>
          </div>
          {(state.records.cards || []).map((c) => (
            <div className="queue-row" key={c.id}>
              <Wallet size={20} />
              <span>
                {c.name} · {c.id}
              </span>
              <strong>¥{c.balance}</strong>
              <Badge>{c.status}</Badge>
              <button
                className="text-btn"
                disabled={c.balance <= 0}
                onClick={() =>
                  act({
                    type: "UPSERT_RECORD",
                    payload: {
                      collection: "cards",
                      record: { ...c, balance: Math.max(0, c.balance - 100) },
                    },
                  })
                }
              >
                模拟抵扣 ¥100
              </button>
            </div>
          ))}
          <div className="notice">
            会员抵扣仅修改本地余额，无真实储值；验证码、税务开票需要生产接口。
          </div>
          <div className="actions">
            {["模拟合并开票", "模拟拆分开票", "模拟发票作废"].map((label) => (
              <button
                key={label}
                className="btn"
                onClick={() =>
                  act({
                    type: "UPSERT_RECORD",
                    payload: {
                      collection: "invoices",
                      record: { title: label, status: "已记录", date: today() },
                    },
                  })
                }
              >
                {label}
              </button>
            ))}
          </div>
          {(state.records.invoices || []).map((x) => (
            <div className="queue-row" key={x.id}>
              <span>{x.title}</span>
              <span>{x.date}</span>
              <Badge>{x.status}</Badge>
            </div>
          ))}
        </section>
      )}
      {selected && (
        <Modal
          title={`回款登记 · ${selected.name}`}
          onClose={() => setBill("")}
        >
          <div className="notice">
            模拟记账，不执行资金转移。剩余应收 ¥{selected.total - selected.paid}
          </div>
          <label className="field">
            本批次回款金额
            <input
              type="number"
              min="0"
              max={selected.total - selected.paid}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </label>
          <label className="field">
            付款方式
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option>银行回款（模拟）</option>
              <option>预付款抵扣（模拟）</option>
              <option>单位自费结算（模拟）</option>
            </select>
          </label>
          {error && <p className="error">{error}</p>}
          <div className="modal-actions">
            <button className="btn" onClick={() => setBill("")}>
              取消
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                if (amount <= 0 || amount > selected.total - selected.paid)
                  return setError("金额须大于 0，且不能超过剩余应收");
                act({
                  type: "UPSERT_RECORD",
                  payload: {
                    collection: "bills",
                    record: {
                      ...selected,
                      paid: selected.paid + amount,
                      method,
                    },
                  },
                });
                setBill("");
              }}
            >
              登记模拟回款
            </button>
          </div>
        </Modal>
      )}
      <details>
        <summary>订单支付明细与分组结算小计</summary>
        <Suspense fallback={<p>载入结算明细…</p>}>
          <SettlementDetails />
        </Suspense>
      </details>
      <details>
        <summary>单位预算、预付款与项目结算</summary>
        <GroupContractWorkbench />
      </details>
      <details>
        <summary>发票回款到期与业务员提醒</summary>
        <Suspense fallback={<p>载入发票提醒…</p>}>
          <InvoiceReminder />
        </Suspense>
      </details>
      <details>
        <summary>交易关联发票台账</summary>
        <InvoiceLedger />
        <Suspense fallback={<p>载入收款与卡务…</p>}>
          <OrderFinanceDesk state={state} act={act} />
          <MembershipCardDesk state={state} act={act} />
          <GroupSettlementDesk state={state} act={act} />
        </Suspense>
      </details>
    </>
  );
}
export function Quality() {
  const { state, act } = useDemo();
  const [tab, setTab] = useState("质控看板");
  const [q, setQ] = useState("");
  const [dismiss, setDismiss] = useState<string[]>([]);
  const checks = [
    {
      id: "Q1",
      title: "未回传结果检查",
      level: "提醒",
      count: state.appointments.filter(
        (a) =>
          ["checked", "in_exam"].includes(a.status) &&
          Object.keys(a.results).length < a.items.length,
      ).length,
      desc: "检索在检订单中的未完成项目，避免报告遗漏。",
      route: "/exam",
    },
    {
      id: "Q2",
      title: "报告审核积案",
      level: "待办",
      count: state.appointments.filter((a) => a.status === "review").length,
      desc: "按初审 / 主检 / 总检责任医生追踪报告。",
      route: "/review",
    },
    {
      id: "Q3",
      title: "A / B 类异常跟进",
      level: "重点",
      count: state.tasks.filter(
        (t) => t.status !== "已完成" && ["A类", "B类"].includes(t.risk),
      ).length,
      desc: "异常处置记录、跟踪随访与处理结果。",
      route: "/health",
    },
  ];
  return (
    <>
      <PageTitle
        eyebrow="QUALITY / 安全与质控"
        title="质控与操作追踪"
        description="从检前到报告发放的全过程留痕。生产级安全、审计防篡改与合规需服务端验证。"
      />
      <div className="tabs">
        {["质控看板", "操作追踪", "接口模拟"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={tab === t ? "active" : ""}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "质控看板" ? (
        <>
          <div className="quality-grid">
            {checks.map((c) => (
              <section className="panel" key={c.id}>
                <div className="panel-heading">
                  <ShieldCheck size={24} />
                  <Badge tone={c.level === "重点" ? "red" : "amber"}>
                    {c.level}
                  </Badge>
                </div>
                <h2>{c.title}</h2>
                <div className="big-number">
                  {c.count}
                  <small>项</small>
                </div>
                <p className="muted">{c.desc}</p>
                <LinkButton href={c.route}>处理相关记录</LinkButton>
              </section>
            ))}
          </div>
          <section className="panel">
            <h2>质控配置</h2>
            <div className="form-grid">
              <label>
                报告超期阈值（天）
                <input
                  type="number"
                  min={1}
                  value={state.config.reportDeadline}
                  onChange={(e) =>
                    act({
                      type: "UPDATE_CONFIG",
                      payload: {
                        reportDeadline: Math.max(1, Number(e.target.value)),
                      },
                    })
                  }
                />
              </label>
              <label>
                异常规则：血糖阈值（演示）
                <input
                  type="number"
                  step="0.1"
                  value={state.config.criticalGlucose}
                  onChange={(e) =>
                    act({
                      type: "UPDATE_CONFIG",
                      payload: {
                        criticalGlucose: Math.max(0, Number(e.target.value)),
                      },
                    })
                  }
                />
              </label>
              <label>
                报告审核流程
                <select
                  value={state.config.reviewStages}
                  onChange={(e) =>
                    act({
                      type: "UPDATE_CONFIG",
                      payload: { reviewStages: Number(e.target.value) },
                    })
                  }
                >
                  <option value={3}>初审 → 主检 → 总检</option>
                  <option value={2}>初审 → 总检（两级演示）</option>
                </select>
              </label>
            </div>
            <div className="notice">
              规则仅用于交互展示，未经临床验证；实际 A / B
              类共识字典、临床知识库和自动诊断不在纯前端验证范围内。
            </div>
          </section>
        </>
      ) : tab === "操作追踪" ? (
        <section className="panel">
          <div className="toolbar">
            <div className="search-field">
              <Search size={16} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="搜索审计"
                placeholder="搜索订单、操作人、行为"
              />
            </div>
            <span className="spacer" />
            <button
              className="btn"
              onClick={() => exportCsv("操作追踪.csv", state.audit)}
            >
              导出日志
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th>时间</th>
                <th>操作角色</th>
                <th>变更内容</th>
              </tr>
            </thead>
            <tbody>
              {state.audit
                .filter((x) => [x.message, x.actor].join("").includes(q))
                .slice(0, 100)
                .map((x) => (
                  <tr key={x.id}>
                    <td>{new Date(x.time).toLocaleString("zh-CN")}</td>
                    <td>
                      <Badge tone="gray">{x.actor}</Badge>
                    </td>
                    <td>
                      {x.message}
                      {x.before && (
                        <details>
                          <summary>查看变更前后</summary>
                          <pre className="audit-diff">
                            {JSON.stringify(
                              {
                                对象: x.entity,
                                操作: x.action,
                                变更前: x.before,
                                变更后: x.after,
                              },
                              null,
                              2,
                            )}
                          </pre>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      ) : (
        <section className="panel">
          <h2>接口连接测试台</h2>
          <p className="muted">
            以下接口都未连接医院；点击后生成可追踪的本地模拟结果。
          </p>
          {[
            "HIS 医嘱推送",
            "LIS 检验结果回传",
            "PACS 影像报告",
            "微信支付回调",
            "短信通知服务",
            "设备采集工作站",
          ].map((x, i) => (
            <div className="queue-row" key={x}>
              <span className="tile-icon teal">
                <Activity size={18} />
              </span>
              <div>
                <strong>{x}</strong>
                <small>Mock adapter · 无外部网络请求</small>
              </div>
              <span className="spacer" />
              <Badge tone={dismiss.includes(x) ? "green" : "gray"}>
                {dismiss.includes(x) ? "模拟成功" : "未连接"}
              </Badge>
              <button
                className="btn"
                onClick={() => {
                  setDismiss([...dismiss, x]);
                  act({
                    type: "ADD_AUDIT",
                    payload: { message: `接口模拟：${x} 返回示例成功` },
                  });
                }}
              >
                测试模拟响应
              </button>
            </div>
          ))}
        </section>
      )}
    </>
  );
}

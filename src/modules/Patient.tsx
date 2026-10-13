import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Bell,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  FileCheck2,
  FileText,
  Heart,
  HeartPulse,
  Home,
  MapPin,
  MessageCircle,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Stethoscope,
  UserRound,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useDemo } from "../store";
import "./devices.css";
import {
  getOrderingIssues,
  packageIsApplicable,
  getOrderRules,
  quoteOrder,
  packageAvailableAtCampus,
  getPackageOptionalBundles,
  normalizeOrderItems,
  getItemClassification,
} from "../orderingRules";
import { deriveQueueDefinitions } from "./Queue";
import {
  groupForBooking,
  groupDiscountPercent,
  splitGroupAmount,
} from "./Groups";
import {
  getBookingAvailability,
  getOnlineExtraCatalog,
  getGroupBookingSchedules,
  getBookingNow,
  bookingDateOffset,
  groupAppointmentCompany,
  getBookingSlots,
  getBookingDates,
  hasCompletedQuestionnaire,
  recommendedBookingItems,
  QUESTIONNAIRE_OPTIONS,
} from "../bookingRules";

type View =
  | "home"
  | "booking"
  | "compare"
  | "questionnaire"
  | "group"
  | "orders"
  | "guide"
  | "reports"
  | "followup"
  | "services"
  | "shop"
  | "messages"
  | "profile"
  | "article"
  | "portal";
const titles: Record<View, string> = {
  home: "健康，从每一天开始",
  booking: "预约体检",
  compare: "套餐对比",
  questionnaire: "1 + X 个性化定制",
  group: "单位团检预约",
  orders: "我的预约",
  guide: "智能导检",
  reports: "体检报告",
  followup: "健康随访",
  services: "健康服务",
  shop: "健康好物",
  messages: "消息与留言",
  profile: "我的健康档案",
  article: "健康课堂",
  portal: "健康中心与服务指引",
};
const statuses: Record<string, string> = {
  booked: "待支付",
  paid: "待到检",
  checked: "已签到",
  in_exam: "体检中",
  review: "报告审核中",
  approved: "报告已出",
  printed: "已领取报告",
  cancelled: "已取消",
};
const meanings: Record<string, string> = {
  一般检查: "记录身高、体重、血压等基础健康指标",
  血常规: "了解血细胞数量与分类等基础信息",
  肝功能: "了解肝脏相关生化指标",
  肾功能: "了解肾脏相关代谢与排泄指标",
  血脂四项: "了解胆固醇与甘油三酯等血脂水平",
  空腹血糖: "了解空腹状态下的血糖水平",
  心电图: "记录心脏电活动及节律信息",
  腹部彩超: "观察肝胆胰脾肾等腹部器官形态",
  颈动脉彩超: "观察颈动脉结构与血流信息",
  骨密度: "了解骨量及骨密度情况",
  肺功能: "了解肺通气功能相关指标",
};
const satisfactionQuestions = [
  { key: "booking", label: "预约流程是否清晰便捷" },
  { key: "service", label: "工作人员服务是否耐心友善" },
  { key: "environment", label: "体检环境与导检标识是否清晰" },
  { key: "communication", label: "检查说明与报告沟通是否易懂" },
  { key: "overall", label: "本次整体服务体验是否满意" },
] as const;
const satisfactionSuggestions = [
  "无额外演示建议",
  "合成建议：增加预约时段提示",
  "合成建议：完善院内导检标识",
  "合成建议：增加报告说明示例",
];
function safePortalLink(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^https:\/\//i.test(value) ||
    [...value].some(
      (character) =>
        character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
    )
  )
    return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !!url.hostname
      ? url.href
      : "";
  } catch {
    return "";
  }
}
function safePosterImage(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
  )
    return "";
  const data = value.split(",")[1];
  const bytes =
    (data.length * 3) / 4 -
    (data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0);
  return data.length % 4 === 0 && bytes <= 512 * 1024 ? value : "";
}
const upcomingDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

export default function Patient() {
  const { state, act } = useDemo();
  const entranceGroup = new URLSearchParams(
    window.location.hash.split("?")[1] || window.location.search,
  ).get("group");
  const entryParams = new URLSearchParams(
    window.location.hash.split("?")[1] || window.location.search,
  );
  const queueEntry = entryParams.get("queue") || "";
  const [distributorId, setDistributorId] = useState(
    entryParams.get("distributor") || "",
  );
  const [shareDistributor, setShareDistributor] = useState(
    `D-${state.patients[0]?.id || "P001"}`,
  );
  const [accountId] = useState(
    state.config.patientAccountId ||
      state.patients.find((p) => p.id === "P001")?.id ||
      state.patients[0]?.id ||
      "P001",
  );
  const [personDraft, setPersonDraft] = useState({
    name: "",
    sex: "女",
    age: 30,
    phone: "",
  });
  const [queueDepartment, setQueueDepartment] = useState("");
  const unitSchedules = getGroupBookingSchedules(state);
  const [groupCompany, setGroupCompany] = useState(
    unitSchedules.find((row) => row.id === entranceGroup)?.company ||
      "星辰科技",
  );
  const [view, setView] = useState<View>(
    queueEntry ? "guide" : entranceGroup ? "group" : "home",
  );
  const [bookingReturn, setBookingReturn] = useState<"booking" | "group">(
    entranceGroup ? "group" : "booking",
  );
  const [patientId, setPatientId] = useState(
    state.appointments.find((a) => a.id === queueEntry)?.patientId ||
      state.patients[0]?.id ||
      "",
  );
  const patient =
    state.patients.find((p) => p.id === patientId) || state.patients[0];
  const orders = state.appointments.filter((a) => a.patientId === patient?.id);
  const upcoming =
    orders.find((a) => a.id === queueEntry) ||
    orders.find(
      (a) => !["cancelled", "approved", "printed"].includes(a.status),
    );
  const reports = orders.filter((a) =>
    ["approved", "printed"].includes(a.status),
  );
  const [date, setDate] = useState(upcomingDate());
  const inGroupFlow =
    view === "group" ||
    (["compare", "questionnaire"].includes(view) && bookingReturn === "group");
  const [groupRelative, setGroupRelative] = useState(false);
  const [sponsorPatientId, setSponsorPatientId] = useState(
    state.patients[0]?.id || "",
  );
  const eligibleSponsors = state.patients.filter(
    (person) => person.company === groupCompany,
  );
  const effectiveSponsorId = eligibleSponsors.some(
    (person) => person.id === sponsorPatientId,
  )
    ? sponsorPatientId
    : eligibleSponsors[0]?.id || "";
  const activeGroup = inGroupFlow
    ? groupForBooking(state, patient.id, date, {
        relative: groupRelative,
        sponsorPatientId: effectiveSponsorId,
        company: groupCompany,
      })
    : undefined;
  const packageScope =
    groupRelative && activeGroup ? { company: activeGroup.company } : {};
  const [campus, setCampus] = useState(state.config.campus || "中心院区");
  const groupContractBlocked =
    inGroupFlow &&
    (state.records.groupOrders || []).some((g) => g.company === groupCompany) &&
    (!activeGroup || activeGroup.company !== groupCompany);
  const [packageId, setPackageId] = useState(state.packages[0]?.id || "");
  const [packageSelection, setPackageSelection] = useState<string[]>([
    state.packages[0]?.id || "",
  ]);
  const rawPackageCount = Number(
    activeGroup?.packageChooseCount ?? state.config.packageChooseCount ?? 1,
  );
  const packageChooseCount =
    Number.isInteger(rawPackageCount) && rawPackageCount > 0
      ? rawPackageCount
      : 1;
  const multiPackageMode = packageChooseCount > 1;
  const applicablePackages = state.packages.filter(
    (p) =>
      (!activeGroup || activeGroup.packages?.includes(p.id)) &&
      packageIsApplicable(state, patient, p.id, packageScope) &&
      packageAvailableAtCampus(state, p.id, campus) &&
      (state.records.packageRules || []).find((r) => r.packageId === p.id)
        ?.onlineEnabled !== false &&
      p.onlineEnabled !== false,
  );
  const selectedPackageIds = (
    multiPackageMode ? packageSelection : [packageId]
  ).filter(
    (id, index, ids) =>
      ids.indexOf(id) === index &&
      applicablePackages.some((pack) => pack.id === id),
  );
  const selectedPackages = applicablePackages.filter((pack) =>
    selectedPackageIds.includes(pack.id),
  );
  const selectedPackage = selectedPackages[0];
  const basePackageItems = [
    ...new Set(selectedPackages.flatMap((pack) => pack.items)),
  ];
  const selectedPackageKey = selectedPackageIds.join("|");
  const packageBundles = getPackageOptionalBundles(state, selectedPackageIds);
  const [bundleSelections, setBundleSelections] = useState<
    Record<string, string[]>
  >({});
  const hasPackageBundles = packageBundles.length > 0;
  const bundleCatalog = getOnlineExtraCatalog(
    state,
    patient.id,
    packageBundles.flatMap((bundle) => bundle.items),
  );
  const globalExtras = getOnlineExtraCatalog(
    state,
    patient.id,
    activeGroup
      ? hasPackageBundles
        ? []
        : activeGroup.optionalItems || []
      : undefined,
  );
  const bookingExtras = [
    ...new Map(
      [...globalExtras, ...bundleCatalog].map((extra) => [extra.name, extra]),
    ).values(),
  ].filter((extra) => !basePackageItems.includes(extra.name));
  const activeBundles = packageBundles.map((bundle) => ({
    ...bundle,
    eligibleItems: bundle.items.filter((item) =>
      bookingExtras.some((extra) => extra.name === item),
    ),
  }));
  const [bodyPartFilter, setBodyPartFilter] = useState("");
  const [diseaseFilter, setDiseaseFilter] = useState("");
  const [autoFilterMutual, setAutoFilterMutual] = useState(
    state.config.autoFilterMutualItems !== false,
  );
  const genericExtras = bookingExtras.filter(
    (extra) =>
      !packageBundles.some((bundle) => bundle.items.includes(extra.name)),
  );
  const displayedExtras = genericExtras.filter((extra) => {
    const classification = getItemClassification(state, extra.name);
    return (
      (!bodyPartFilter || classification.bodyPart === bodyPartFilter) &&
      (!diseaseFilter || classification.diseaseType === diseaseFilter)
    );
  });
  const requiredItems = getOrderRules(state)
    .filter((r) => r.required && r.enabled !== false && r.ruleEnabled !== false)
    .map((r) => r.item);
  const [time, setTime] = useState("08:00-08:30");
  useEffect(() => {
    const slots = getBookingSlots(state);
    if (!slots.some((slot) => slot.time === time))
      setTime(slots[0]?.time || "");
  }, [state.config.timeSlots]);
  const [simple, setSimple] = useState(false);
  useEffect(() => {
    if (activeGroup || multiPackageMode) setSimple(false);
  }, [activeGroup?.id, multiPackageMode]);
  const [selectedExtras, setSelectedExtras] = useState<string[]>([]);
  const [excludedItems, setExcludedItems] = useState<string[]>([]);
  const bookingSubmitted = useRef(false);
  const allowAdd = state.config.allowAdd !== false;
  const allowRemove = state.config.allowRemove !== false;
  const displayPrices =
    state.config.showPrices !== false &&
    !["不显示", "不显示价格"].includes(state.config.priceMode);
  const baseItems = basePackageItems.filter(
    (item) => !excludedItems.includes(item),
  );
  const activeExtras =
    allowAdd && !simple
      ? [
          ...new Set([
            ...selectedExtras.filter((name) =>
              genericExtras.some((extra) => extra.name === name),
            ),
            ...activeBundles.flatMap((bundle) =>
              (bundleSelections[bundle.packageId] || []).filter((name) =>
                bundle.eligibleItems.includes(name),
              ),
            ),
          ]),
        ]
      : [];
  const unfilteredItems = [
    ...selectedPackages
      .flatMap((pack) => pack.items)
      .filter((item) => !excludedItems.includes(item)),
    ...activeExtras,
  ];
  const normalizedItems = normalizeOrderItems(state, unfilteredItems);
  const applyAutomaticFiltering =
    selectedPackageIds.length > 1 && autoFilterMutual;
  const submittedItems = applyAutomaticFiltering
    ? normalizedItems.items
    : [...new Set(unfilteredItems)];
  const mutuallyExcludedItems = applyAutomaticFiltering
    ? [...new Set(unfilteredItems)].filter(
        (item) => !submittedItems.includes(item),
      )
    : [];
  const availability = getBookingAvailability(state, date, undefined, {
    patientId: patient?.id,
    company: groupCompany,
    kind: view === "group" ? "group" : "individual",
    time,
  });
  const questionnaireEnabled = state.config.questionnaireEnabled !== false;
  const questionnaireSkippable = state.config.questionnaireSkippable !== false;
  const recommendationEnabled = state.config.recommendationEnabled !== false;
  const questionnaireCompleted = hasCompletedQuestionnaire(state, patient?.id);
  useEffect(() => {
    setExcludedItems(
      state.config.defaultSelected === false
        ? basePackageItems.filter((item) => !requiredItems.includes(item))
        : [],
    );
  }, [selectedPackageKey, state.config.defaultSelected]);
  const [compare, setCompare] = useState<string[]>(
    state.packages.slice(0, 2).map((p) => p.id),
  );
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState("");
  const [payId, setPayId] = useState("");
  const [payMethod, setPayMethod] = useState("微信支付");
  const [cancelId, setCancelId] = useState("");
  const [editId, setEditId] = useState("");
  const [reportId, setReportId] = useState("");
  const [historyCount, setHistoryCount] = useState(3);
  const [answers, setAnswers] = useState<string[]>([]);
  const [questionContext, setQuestionContext] = useState({
    history: "",
    medication: "",
    family: "",
  });
  useEffect(() => {
    setAnswers([]);
    setQuestionContext({ history: "", medication: "", family: "" });
    setQuestionDone(false);
  }, [patientId]);
  const [questionDone, setQuestionDone] = useState(false);
  const [consent, setConsent] = useState(false);
  const [groupVerified, setGroupVerified] = useState(
    unitSchedules.some((row) => row.id === entranceGroup),
  );
  const [groupCode, setGroupCode] = useState("DEMO2026");
  const [groupMode, setGroupMode] = useState("定额自选");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<string[]>([]);
  const [surveyOrderId, setSurveyOrderId] = useState("");
  const surveyOrders = orders.filter((order) => order.status !== "cancelled");
  const surveyAppointmentId = surveyOrders.some(
    (order) => order.id === surveyOrderId,
  )
    ? surveyOrderId
    : surveyOrders[0]?.id || "";
  const satisfactionId = `SAT-${patient?.id}-${surveyAppointmentId || "portal"}`;
  const satisfactionResult = (state.records.patientSatisfaction || []).find(
    (row) => row.id === satisfactionId,
  );
  const [surveyScores, setSurveyScores] = useState<Record<string, number>>({});
  const [surveySuggestion, setSurveySuggestion] = useState("");
  const surveySubmitted = useRef(new Set<string>());
  useEffect(() => {
    setSurveyScores({});
    setSurveySuggestion("");
  }, [satisfactionId]);
  const [healthDays, setHealthDays] = useState<string[]>([]);
  const [cart, setCart] = useState(0);
  const [article, setArticle] = useState("体检前，这些准备请记好");
  const [service, setService] = useState("");
  const [serviceDate, setServiceDate] = useState(upcomingDate());
  const [reminders, setReminders] = useState(true);
  const groupUrl = `${window.location.origin}${window.location.pathname}#/patient?group=${encodeURIComponent(unitSchedules.find((row) => row.company === groupCompany)?.id || "xingchen-2026")}`;
  useEffect(() => {
    const enterGroup = () => {
      const params = new URLSearchParams(window.location.hash.split("?")[1]);
      setDistributorId(params.get("distributor") || "");
      const queueOrder = state.appointments.find(
        (a) => a.id === params.get("queue"),
      );
      if (queueOrder) {
        setPatientId(queueOrder.patientId);
        setView("guide");
      }
      const group = new URLSearchParams(window.location.hash.split("?")[1]).get(
        "group",
      );
      if (group) {
        setView("group");
        setGroupVerified(unitSchedules.some((row) => row.id === group));
        setGroupCompany(
          unitSchedules.find((row) => row.id === group)?.company || "星辰科技",
        );
      }
    };
    window.addEventListener("hashchange", enterGroup);
    return () => window.removeEventListener("hashchange", enterGroup);
  }, []);
  const tell = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(""), 4000);
  };
  const go = (next: View) => {
    if ((next === "booking" || next === "group") && next !== view)
      bookingSubmitted.current = false;
    if (next === "compare" || next === "questionnaire")
      setBookingReturn(view === "group" ? "group" : "booking");
    setView(next);
    setQuery("");
  };
  const toggle = (
    values: string[],
    value: string,
    setter: (v: string[]) => void,
  ) =>
    setter(
      values.includes(value)
        ? values.filter((v) => v !== value)
        : [...values, value],
    );
  const addPrice = bookingExtras
    .filter((e) => activeExtras.includes(e.name))
    .reduce((sum, e) => sum + e.price, 0);
  const compositeBaseQuote =
    activeGroup || multiPackageMode
      ? quoteOrder(
          state,
          selectedPackageIds,
          groupDiscountPercent(activeGroup, groupRelative),
          {},
          activeExtras,
          mutuallyExcludedItems,
        )
      : null;
  const compositeRows = compositeBaseQuote?.rows.map((row) => {
    const extra = bookingExtras.find(
      (item) => item.name === row.item && activeExtras.includes(item.name),
    );
    return extra
      ? {
          ...row,
          price: extra.price,
          amount: Math.round(extra.price * row.percent) / 100,
        }
      : row;
  });
  const groupQuote =
    compositeBaseQuote && compositeRows
      ? {
          ...compositeBaseQuote,
          rows: compositeRows,
          amount:
            Math.round(
              compositeRows.reduce((sum, row) => sum + row.amount, 0) * 100,
            ) / 100,
        }
      : null;
  const total = groupQuote
    ? groupQuote.amount
    : (simple ? 0 : selectedPackage?.price || 0) + addPrice;
  const selectBookingPackage = (id: string) => {
    if (!multiPackageMode) {
      setPackageId(id);
      setPackageSelection([id]);
      return;
    }
    if (selectedPackageIds.includes(id))
      setPackageSelection(selectedPackageIds.filter((value) => value !== id));
    else if (selectedPackageIds.length < packageChooseCount)
      setPackageSelection([...selectedPackageIds, id]);
    else tell(`本模式最多选择 ${packageChooseCount} 个套餐，请先取消已选套餐`);
  };
  const submitSatisfaction = () => {
    if (satisfactionResult || surveySubmitted.current.has(satisfactionId))
      return tell("此体验已提交问卷，可直接回看结果");
    if (
      satisfactionQuestions.some(
        (question) =>
          !Number.isInteger(surveyScores[question.key]) ||
          surveyScores[question.key] < 1 ||
          surveyScores[question.key] > 5,
      )
    )
      return tell("请完成全部 5 道必答评分题");
    if (surveySuggestion && !satisfactionSuggestions.includes(surveySuggestion))
      return tell("请选择有效的合成建议");
    surveySubmitted.current.add(satisfactionId);
    act({
      type: "UPSERT_RECORD",
      payload: {
        collection: "patientSatisfaction",
        record: {
          id: satisfactionId,
          patientId: patient.id,
          appointmentId: surveyAppointmentId,
          scores: { ...surveyScores },
          suggestion: surveySuggestion,
          average:
            Math.round(
              (satisfactionQuestions.reduce(
                (sum, question) => sum + surveyScores[question.key],
                0,
              ) /
                5) *
                100,
            ) / 100,
          status: "已提交",
          submittedAt: getBookingNow(state).toISOString(),
          source: "H5合成满意度问卷",
        },
      },
    });
    tell("满意度问卷已保存，可回看本次结果");
  };
  const groupCharge = activeGroup
    ? groupRelative && activeGroup.relativePayment !== "unit"
      ? { unit: 0, personal: total }
      : splitGroupAmount(activeGroup, groupQuote?.rows || [])
    : {
        unit: groupRelative ? 0 : Math.min(total, 800),
        personal: groupRelative ? total : Math.max(0, total - 800),
      };
  const createOrder = (isGroup = false) => {
    if (bookingSubmitted.current) return;
    if (!consent) return tell("请先确认已阅读预约须知");
    if ((activeGroup || multiPackageMode) && simple)
      return tell("当前预约模式必须选择已配置的体检套餐，不能使用简单预约");
    if (groupContractBlocked)
      return tell("当前体检人不在单位订单有效名单或预约日期内");
    if (
      activeGroup &&
      !hasPackageBundles &&
      activeExtras.length !== Number(activeGroup.choose || 0)
    )
      return tell(`单位自选项目需选择 ${Number(activeGroup.choose || 0)} 项`);
    if (!simple && selectedPackageIds.length !== packageChooseCount)
      return tell(
        `本模式需选择 ${packageChooseCount} 个套餐，当前已选 ${selectedPackageIds.length} 个`,
      );
    for (const bundle of activeBundles) {
      const chosen = (bundleSelections[bundle.packageId] || []).filter(
        (name) =>
          bundle.eligibleItems.includes(name) &&
          activeExtras.includes(name) &&
          submittedItems.includes(name),
      );
      if (chosen.length !== bundle.choose)
        return tell(
          `${bundle.name}自选包需选择 ${bundle.choose} 项，当前有效 ${chosen.length} 项`,
        );
    }
    if (applyAutomaticFiltering && normalizedItems.errors.length)
      return tell(normalizedItems.errors.join("；"));
    if (!patient || (!simple && !selectedPackage))
      return tell("请选择体检人和套餐");
    if (!availability.allowed) return tell(availability.error);
    if (
      isGroup &&
      groupRelative &&
      unitSchedules.find((row) => row.company === groupCompany)
        ?.allowRelatives === false
    )
      return tell("该单位已关闭亲属预约");
    const itemIssues = simple
      ? []
      : getOrderingIssues(
          state,
          patient.id,
          submittedItems,
          selectedPackageIds,
          packageScope,
        );
    if (itemIssues.length) return tell(itemIssues.join("；"));
    if (!simple && baseItems.length + activeExtras.length === 0)
      return tell("请至少保留一个检查项目");
    if (
      isGroup &&
      !activeGroup &&
      !hasPackageBundles &&
      groupMode === "N 选 M" &&
      allowAdd &&
      activeExtras.length !== 2
    )
      return tell("本方案请从 3 项中选择 2 项");
    bookingSubmitted.current = true;
    act({
      type: "CREATE_APPOINTMENT",
      payload: {
        patientId: patient.id,
        packageId: simple ? "simple" : selectedPackageIds[0],
        packageIds: simple ? [] : selectedPackageIds,
        packageChooseCount: simple ? 0 : packageChooseCount,
        date,
        time,
        campus,
        amount: total,
        items: simple ? [] : submittedItems,
        itemFiltering: applyAutomaticFiltering ? normalizedItems.removed : [],
        packageOptionalSelections: Object.fromEntries(
          activeBundles.map((bundle) => [
            bundle.packageId,
            (bundleSelections[bundle.packageId] || []).filter(
              (item) =>
                activeExtras.includes(item) && submittedItems.includes(item),
            ),
          ]),
        ),
        relativeBooking: isGroup && groupRelative,
        sponsorPatientId:
          isGroup && groupRelative ? effectiveSponsorId : undefined,
        groupDiscount: isGroup
          ? groupDiscountPercent(activeGroup, groupRelative)
          : 100,
        relativePayment:
          isGroup && groupRelative
            ? activeGroup?.relativePayment || "self"
            : undefined,
        results: {},
        conclusion: "",
        source: isGroup ? "H5团检" : "H5个检",
        bookingKind: isGroup ? "group" : "individual",
        groupCompany: isGroup ? groupCompany : "",
        questionnaireCompleted,
        distributorId: state.patients.some((p) => `D-${p.id}` === distributorId)
          ? distributorId
          : "",
        questionnaireAnswers:
          state.records.bookingQuestionnaires?.find(
            (row) => row.patientId === patient.id,
          )?.answers || [],
        groupBudget: isGroup
          ? activeGroup
            ? Number.isFinite(Number(activeGroup.budget))
              ? Number(activeGroup.budget)
              : groupCharge.unit
            : 800
          : 0,
        groupOrderId: isGroup ? activeGroup?.id : undefined,
        groupSplit: isGroup ? groupCharge : undefined,
        pricing: groupQuote?.rows,
        selfPay: isGroup ? groupCharge.personal : total,
      },
    });
    setConsent(false);
    go("orders");
    tell("预约成功，已同步到体检工作台。短信为模拟记录。");
  };
  const payOrder = state.appointments.find((a) => a.id === payId);
  const currentReport =
    reports.find((r) => r.id === reportId) || reports[reports.length - 1];
  const baseServices = [
    {
      icon: CalendarDays,
      title: "预约体检",
      desc: "为健康做好计划",
      target: "booking",
    },
    {
      icon: Building2,
      title: "单位团检",
      desc: "专属福利轻松约",
      target: "group",
    },
    {
      icon: MapPin,
      title: "智能导检",
      desc: "下一站，清晰可见",
      target: "guide",
    },
    {
      icon: FileText,
      title: "体检报告",
      desc: "随时查看健康档案",
      target: "reports",
    },
  ] as const;

  const referralUrl = `${window.location.origin}${window.location.pathname}#/patient?distributor=${encodeURIComponent(shareDistributor)}`;
  const commonPeople = (state.records.patientCommonPeople || []).filter(
    (row) => row.ownerPatientId === accountId && row.status === "active",
  );
  const saveCommon = (id: string, active: boolean) =>
    act({
      type: "UPSERT_RECORD",
      payload: {
        collection: "patientCommonPeople",
        record: {
          id: `COMMON-${accountId}-${id}`,
          ownerPatientId: accountId,
          patientId: id,
          status: active ? "active" : "removed",
        },
      },
    });
  const registerPerson = () => {
    if (!/^演示.{1,10}$/.test(personDraft.name.trim()))
      return tell("称呼须以“演示”开头，且总长 3–12 字");
    if (!/^DEMO-\d{4,8}$/.test(personDraft.phone))
      return tell("手机号标识仅允许 DEMO- 加 4–8 位数字");
    if (
      !Number.isInteger(Number(personDraft.age)) ||
      personDraft.age < 18 ||
      personDraft.age > 99
    )
      return tell("演示年龄范围为 18–99 岁");
    if (state.patients.some((p) => p.phone === personDraft.phone))
      return tell("该演示手机号标识已注册");
    const id = `P-DEMO-${Date.now().toString(36)}`;
    act({
      type: "UPSERT_PATIENT",
      payload: {
        id,
        ...personDraft,
        name: personDraft.name.trim(),
        company: "个检",
        risk: "未评估（演示）",
        demoIdentity: `DEMO-${id}`,
        demoAccount: true,
      },
    });
    saveCommon(id, true);
    setPersonDraft({ name: "", sex: "女", age: 30, phone: "" });
    tell("合成体检人已注册并保存为常用体检人");
  };
  const queueDefinitions = deriveQueueDefinitions(state).filter(
    (q) =>
      q.enabled &&
      (!patient || q.sex === "不限" || q.sex === patient.sex) &&
      upcoming?.items.some(
        (item) => q.items.includes(item) && !upcoming.results[item],
      ),
  );
  const selectedQueue =
    queueDefinitions.find((q) => q.id === queueDepartment) ||
    queueDefinitions[0];
  const currentTickets = (state.records.queueTickets || []).filter(
    (t) =>
      t.appointmentId === upcoming?.id &&
      ["waiting", "calling", "missed"].includes(t.status),
  );
  const joinQueue = () => {
    if (!upcoming || !["checked", "in_exam"].includes(upcoming.status))
      return tell("请先完成到检签到，再加入排队");
    if (
      !selectedQueue ||
      state.config.queueOpen?.[selectedQueue.id] === false ||
      state.records.guideZones?.find((z) => z.name === selectedQueue.zone)
        ?.status === "已停用"
    )
      return tell("当前队列未开放，请选择其他检查科室");
    if (currentTickets.some((t) => t.department === selectedQueue.id))
      return tell("您已在该队列，请勿重复取号");
    const inLine = (state.records.queueTickets || []).filter(
      (t) =>
        t.department === selectedQueue.id &&
        ["waiting", "calling"].includes(t.status),
    );
    act({
      type: "UPSERT_RECORD",
      payload: {
        collection: "queueTickets",
        record: {
          id: `${selectedQueue.id}-${upcoming.id}`,
          appointmentId: upcoming.id,
          department: selectedQueue.id,
          status: "waiting",
          position: inLine.length
            ? Math.max(...inLine.map((t) => Number(t.position) || 0)) + 1
            : 0,
          waitMinutes: inLine.length * selectedQueue.minutes,
          zone: selectedQueue.zone,
          createdAt: getBookingNow(state).toISOString(),
          source: "患者H5",
        },
      },
    });
    tell("已加入演示队列，状态与导检工作台同步");
  };
  const publicRows = (key: string) =>
    (state.records[key] || [])
      .filter(
        (row) =>
          row.enabled !== false &&
          ["已启用", "已发布", "已通过"].includes(row.status),
      )
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  const hospital = {
    name: "红创 · 健康中心",
    intro: "合成演示健康中心，提供体检预约、报告与健康管理服务。",
    address: "演示城市 · 合成健康路 1 号（非真实地址）",
    hotline: "DEMO-0000",
    hours: "周一至周六 07:30—17:00",
    ...(state.config.portalHospital || {}),
  };
  const portalTarget = (target: string): View =>
    (({
      预约体检: "booking",
      报告查询: "reports",
      健康科普: "article",
      服务中心: "services",
      常见问题: "portal",
    })[target] as View) || "portal";
  const menuIcons: Record<string, typeof Heart> = {
    日历: CalendarDays,
    报告: FileText,
    健康: Heart,
    客服: MessageCircle,
  };
  const commonServices = state.records.portalMenus
    ? publicRows("portalMenus").map((row) => ({
        title: row.name,
        desc: row.target,
        target: portalTarget(row.target),
        icon: menuIcons[row.icon] || Heart,
      }))
    : baseServices;
  const portalContent = publicRows("portalBanners").filter(
    (row) => !row.date || row.date <= bookingDateOffset(state),
  );
  const portalPosters = publicRows("portalPosters").filter(
    (row) =>
      (!row.date || row.date <= bookingDateOffset(state)) &&
      safePosterImage(row.imageData),
  );
  const configuredArticle = portalContent.find((row) => row.name === article);
  const serviceNames = state.records.portalServices
    ? publicRows("portalServices").map((row) => row.name as string)
    : ["体检报告解读", "健康生活方式咨询", "体检项目咨询", "到院无障碍协助"];
  if (!patient)
    return <div className="pt-empty">暂无演示体检人，请先重置演示数据。</div>;
  return (
    <div className="pt-root">
      <div className="pt-topbar">
        <div className="pt-brand">
          <span>
            <HeartPulse size={25} />
          </span>
          <div>
            <b>{hospital.name}</b>
            <small>HEALTH, WITH CARE</small>
          </div>
        </div>
        <div className="pt-top-actions">
          <span className="pt-demo-label">H5 小程序演示</span>
          <button
            className="pt-icon-button"
            aria-label="查看消息"
            onClick={() => go("messages")}
          >
            <Bell size={21} />
            <i />
          </button>
          <button className="pt-user-chip" onClick={() => go("profile")}>
            <span>{patient.name.slice(-1)}</span>
            {patient.name}
          </button>
        </div>
      </div>
      {state.patients.some((p) => `D-${p.id}` === distributorId) && (
        <p className="pt-note">
          当前通过个人推广入口访问：{distributorId}，新预约将保存该来源。
        </p>
      )}
      <div className="pt-page-header">
        <div>
          {view !== "home" && (
            <button className="pt-back" onClick={() => go("home")}>
              <ArrowLeft size={16} /> 返回首页
            </button>
          )}
          <p className="pt-eyebrow">YOUR HEALTH COMPANION</p>
          <h1>{titles[view]}</h1>
          <p>
            {view === "home"
              ? `${patient.name}，早上好。把关心自己，放进今天的计划里。`
              : "便捷、安心，陪伴您的每一段健康旅程。"}
          </p>
        </div>
        <span className="pt-campus">
          <MapPin size={16} /> 青岛 · {campus}
        </span>
      </div>
      <div className="pt-layout">
        <main className="pt-main">
          {view === "home" && (
            <>
              <section className="pt-hero">
                <div>
                  <span className="pt-hero-kicker">
                    <Sparkles size={14} /> 秋日健康关怀计划
                  </span>
                  <h2>
                    给忙碌的生活，
                    <br />
                    留一份健康的底气。
                  </h2>
                  <p>
                    从一份适合自己的体检开始
                    <br />
                    让每一次关心，都有回响。
                  </p>
                  <button onClick={() => go("booking")}>
                    开启健康计划 <ArrowRight size={18} />
                  </button>
                </div>
                <div className="pt-hero-art" aria-hidden="true">
                  <div className="pt-art-orbit orbit-one" />
                  <div className="pt-art-orbit orbit-two" />
                  <div className="pt-art-cross">
                    <HeartPulse size={66} strokeWidth={1.25} />
                  </div>
                  <span className="pt-art-leaf leaf-one" />
                  <span className="pt-art-leaf leaf-two" />
                  <div className="pt-art-note">
                    <ShieldCheck size={21} />
                    <div>
                      <b>用心守护每一天</b>
                      <small>YOUR WELLNESS MATTERS</small>
                    </div>
                  </div>
                </div>
              </section>
              <div className="pt-section-title">
                <button className="pt-text-button" onClick={() => go("portal")}>
                  中心介绍 · 医院位置 · 服务与常见问题{" "}
                  <ChevronRight size={16} />
                </button>
              </div>
              {portalPosters.length > 0 && (
                <section className="pt-stacked" aria-label="医院图片海报">
                  {portalPosters.map((row) => (
                    <button
                      key={row.id}
                      className="pt-card"
                      style={{
                        padding: 0,
                        overflow: "hidden",
                        width: "100%",
                        textAlign: "left",
                      }}
                      onClick={() => go(portalTarget(row.target))}
                      aria-label={`查看海报：${row.name}`}
                    >
                      <img
                        src={safePosterImage(row.imageData)}
                        alt={row.alt || row.name}
                        style={{
                          display: "block",
                          width: "100%",
                          maxHeight: 320,
                          objectFit: "contain",
                          background: "#eef6f5",
                        }}
                      />
                      <span style={{ display: "block", padding: "12px 18px" }}>
                        {row.name} · {row.target || "中心介绍"}
                      </span>
                    </button>
                  ))}
                </section>
              )}
              {portalContent.length > 0 && (
                <section className="pt-stacked">
                  {portalContent.map((row) => (
                    <button
                      key={row.id}
                      className="pt-info-banner"
                      style={{ textAlign: "left", width: "100%" }}
                      onClick={() => {
                        if (row.kind === "新闻" || row.target === "健康科普") {
                          setArticle(row.name);
                          go("article");
                        } else go(portalTarget(row.target));
                      }}
                    >
                      <Bell size={23} />
                      <div>
                        <small>
                          {row.kind === "海报" ? "文字海报" : "站内新闻"} ·{" "}
                          {row.date}
                        </small>
                        <h3>{row.name}</h3>
                        <p>{row.summary}</p>
                      </div>
                      <ChevronRight size={18} />
                    </button>
                  ))}
                </section>
              )}
              <section className="pt-shortcuts">
                {commonServices.map((s) => (
                  <button key={s.title} onClick={() => go(s.target)}>
                    <span>
                      <s.icon size={25} />
                    </span>
                    <b>{s.title}</b>
                    <small>{s.desc}</small>
                  </button>
                ))}
              </section>
              <section className="pt-mobile-services">
                {(
                  [
                    { title: "健康随访", icon: Heart, target: "followup" },
                    {
                      title: "健康服务",
                      icon: Stethoscope,
                      target: "services",
                    },
                    { title: "健康好物", icon: ShoppingBag, target: "shop" },
                    {
                      title: "个性问卷",
                      icon: ClipboardList,
                      target: "questionnaire",
                    },
                  ] as const
                ).map((s) => (
                  <button key={s.title} onClick={() => go(s.target)}>
                    <s.icon size={20} />
                    <span>{s.title}</span>
                  </button>
                ))}
              </section>
              {upcoming && (
                <section className="pt-appointment">
                  <span className="pt-calendar-tile">
                    <small>{upcoming.date.slice(5, 7)} 月</small>
                    <b>{upcoming.date.slice(8)}</b>
                  </span>
                  <div>
                    <span className="pt-mini-tag">
                      {statuses[upcoming.status]}
                    </span>
                    <h3>您有一份健康之约</h3>
                    <p>
                      {upcoming.time} · {upcoming.campus} · {patient.name}
                    </p>
                  </div>
                  <button
                    className="pt-text-button"
                    onClick={() => go("orders")}
                  >
                    查看预约 <ChevronRight size={16} />
                  </button>
                </section>
              )}
              <div className="pt-section-title">
                <div>
                  <h2>为您精选的健康计划</h2>
                  <p>多一点了解，多一份安心</p>
                </div>
                <button onClick={() => go("booking")}>
                  全部套餐 <ArrowRight size={16} />
                </button>
              </div>
              <div className="pt-package-grid">
                {applicablePackages.slice(0, 3).map((p, i) => (
                  <button
                    className="pt-package-card"
                    key={p.id}
                    onClick={() => {
                      setPackageId(p.id);
                      setPackageSelection([p.id]);
                      go("booking");
                    }}
                  >
                    <div className={`pt-package-art art-${i}`}>
                      <span>{["基础健康", "品质生活", "深度守护"][i]}</span>
                      {i === 0 ? (
                        <HeartPulse size={59} strokeWidth={1.1} />
                      ) : i === 1 ? (
                        <ShieldCheck size={59} strokeWidth={1.1} />
                      ) : (
                        <Activity size={59} strokeWidth={1.1} />
                      )}
                      <small>{p.tag || "个性化健康方案"}</small>
                    </div>
                    <div className="pt-package-info">
                      <h3>{p.name}</h3>
                      <p>{p.items.length} 项健康检查 · 专业总检解读</p>
                      <div>
                        <strong>
                          {displayPrices ? (
                            <>
                              <small>¥</small>
                              {p.price.toLocaleString()}
                            </>
                          ) : (
                            <small>价格待咨询</small>
                          )}
                        </strong>
                        <span>
                          查看详情 <ArrowRight size={15} />
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              <div className="pt-section-title">
                <div>
                  <h2>健康课堂</h2>
                  <p>把专业知识，变成日常习惯</p>
                </div>
                <button onClick={() => go("article")}>
                  更多内容 <ArrowRight size={16} />
                </button>
              </div>
              <div className="pt-articles">
                {["体检前，这些准备请记好", "久坐的你，今天动起来了吗？"].map(
                  (name, i) => (
                    <button
                      key={name}
                      onClick={() => {
                        setArticle(name);
                        go("article");
                      }}
                    >
                      <span className={`pt-article-art art-${i}`}>
                        <Heart size={30} />
                      </span>
                      <div>
                        <small>
                          {i ? "生活方式" : "体检知识"} · 3 分钟阅读
                        </small>
                        <h3>{name}</h3>
                        <p>每天学一点，健康近一点</p>
                      </div>
                      <ChevronRight size={18} />
                    </button>
                  ),
                )}
              </div>
            </>
          )}
          {view === "portal" && (
            <section className="pt-card">
              <span className="pt-pill">医院门户 · 本地已启用内容</span>
              <h2>{hospital.name}</h2>
              <p>{hospital.intro}</p>
              <div className="pt-info-banner">
                <MapPin size={25} />
                <div>
                  <b>医院位置与到院指引</b>
                  <p>{hospital.address}</p>
                  <p>
                    {hospital.hours} · 演示热线 {hospital.hotline}
                  </p>
                </div>
              </div>
              <label>
                查看院区路线
                <select
                  value={campus}
                  onChange={(e) => setCampus(e.target.value)}
                >
                  <option>中心院区</option>
                  <option>东院区</option>
                </select>
              </label>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3,1fr)",
                  gap: 12,
                  margin: "20px 0",
                }}
              >
                {["入口 / 服务台", "一层 / 采血区", "二层 / 检查区"].map(
                  (text, i) => (
                    <div className="pt-note" key={text}>
                      <b>
                        {i + 1}. {text}
                      </b>
                      <p>
                        {i
                          ? "沿导引标识前往，需帮助请联系服务台。"
                          : "先核验演示预约，到检后领取导检单。"}
                      </p>
                    </div>
                  ),
                )}
              </div>
              <p className="pt-note">
                以上为本地合成路线示意，不是医院实景或实时导航。
              </p>
              {publicRows("guideZones")
                .filter((row) => row.campus === campus)
                .map((row) => (
                  <div className="pt-result-row" key={row.id}>
                    <b>
                      {row.name} · {row.floor}
                    </b>
                    <span>{row.directions}</span>
                  </div>
                ))}
              <h3 className="pt-subheading">检查设备与医生团队</h3>
              {publicRows("portalTeams").map((row) => (
                <article className="pt-info-banner" key={row.id}>
                  <Stethoscope size={22} />
                  <div>
                    <b>
                      {row.name} · {row.kind}
                    </b>
                    <p>
                      {row.department} · {row.summary}
                    </p>
                  </div>
                </article>
              ))}
              <h3 className="pt-subheading">常见问题</h3>
              {publicRows("portalFaq").map((row) => (
                <details className="pt-note" key={row.id}>
                  <summary>{row.name}</summary>
                  <p>{row.answer}</p>
                </details>
              ))}
              <h3 className="pt-subheading">服务信息</h3>
              {publicRows("portalServices").map((row) => (
                <div className="pt-info-banner" key={row.id}>
                  <Heart size={22} />
                  <div>
                    <b>{row.name}</b>
                    <p>{row.scope}</p>
                    <p>
                      {row.hours} · {row.location}
                      {displayPrices ? ` · 演示费用 ¥${row.price}` : ""}
                    </p>
                    <button
                      className="pt-text-button"
                      onClick={() => setService(row.name)}
                    >
                      预约此服务
                    </button>
                  </div>
                </div>
              ))}
              <h3 className="pt-subheading">友情链接</h3>
              {publicRows("portalLinks").map((row) => (
                <details className="pt-note" key={row.id}>
                  <summary>{row.name}</summary>
                  <p>{row.description}</p>
                  {safePortalLink(row.url) ? (
                    <a
                      className="pt-text-button"
                      href={safePortalLink(row.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      referrerPolicy="no-referrer"
                    >
                      访问 {row.name}（外部网站）
                    </a>
                  ) : (
                    <p>链接格式不安全，已禁用访问。</p>
                  )}
                  <small>
                    仅在您主动点击后打开 HTTPS
                    外部网站，请勿提交真实健康或身份信息。
                  </small>
                </details>
              ))}
            </section>
          )}
          {(view === "booking" || view === "group") && (
            <section className="pt-card">
              {view === "group" && !groupVerified ? (
                <div className="pt-group-entry">
                  <Building2 size={42} />
                  <h2>欢迎使用单位专属预约</h2>
                  <p>演示单位：星辰科技 · 2026 年度员工健康计划</p>
                  <div className="pt-unit-qr">
                    <QRCodeSVG
                      value={groupUrl}
                      size={128}
                      fgColor="#345d47"
                      level="M"
                      title="星辰科技 2026 团检预约入口"
                    />
                  </div>
                  <small>
                    扫码进入星辰科技专属团检订单 · 需能访问本演示服务
                  </small>
                  <a className="pt-group-link" href={groupUrl}>
                    打开同一单位预约入口 <ArrowRight size={14} />
                  </a>
                  <label>
                    单位口令
                    <input
                      value={groupCode}
                      onChange={(e) => setGroupCode(e.target.value)}
                      placeholder="DEMO2026"
                    />
                  </label>
                  <button
                    className="pt-primary"
                    onClick={() =>
                      groupCode === "DEMO2026"
                        ? setGroupVerified(true)
                        : tell("演示口令为 DEMO2026")
                    }
                  >
                    进入单位预约 <ArrowRight size={17} />
                  </button>
                </div>
              ) : (
                <>
                  {view === "group" && (
                    <div className="pt-info-banner">
                      <Building2 size={22} />
                      <div>
                        <b>{groupCompany} · 年度体检福利</b>
                        <p>
                          {activeGroup
                            ? `${activeGroup.name || activeGroup.id} · ${activeGroup.mode} · 单位预算 ${activeGroup.mode === "无限额" ? "不限" : `¥${activeGroup.budget}`}`
                            : "单位额度 ¥800 / 人，超额自费。"}
                          {activeGroup
                            ? ` · 单位折扣 ${groupDiscountPercent(activeGroup)}%；亲属付款按已配置策略执行。`
                            : "亲属预约按全额自费演示。"}
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="pt-form-grid">
                    <label>
                      体检人
                      <select
                        value={patientId}
                        onChange={(e) => setPatientId(e.target.value)}
                      >
                        {state.patients.map((p) => (
                          <option value={p.id} key={p.id}>
                            {p.name} · {p.sex} · {p.age} 岁
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      就诊院区
                      <select
                        value={campus}
                        onChange={(e) => setCampus(e.target.value)}
                      >
                        <option>中心院区</option>
                        <option>东院区</option>
                      </select>
                    </label>
                  </div>
                  <div className="pt-section-title compact">
                    <h3>选择适合您的套餐</h3>
                    <button
                      onClick={() =>
                        questionnaireEnabled
                          ? go("questionnaire")
                          : tell("当前已关闭检前问卷")
                      }
                    >
                      <Sparkles size={16} />{" "}
                      {questionnaireEnabled
                        ? questionnaireCompleted
                          ? "问卷已完成"
                          : "填写检前问卷"
                        : "问卷已关闭"}
                    </button>
                  </div>
                  <label className="pt-check-row">
                    <input
                      type="checkbox"
                      checked={simple}
                      disabled={!!activeGroup || multiPackageMode}
                      onChange={(e) => setSimple(e.target.checked)}
                    />{" "}
                    简单预约，仅预约到院时间
                  </label>
                  {!simple && (
                    <>
                      <div className="pt-search">
                        <Search size={18} />
                        <input
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="搜索套餐名称"
                        />
                      </div>
                      {multiPackageMode && (
                        <p className="pt-note" role="note">
                          套餐 N 选 M：{applicablePackages.length} 选{" "}
                          {packageChooseCount}，已选 {selectedPackageIds.length}
                          /{packageChooseCount}{" "}
                          个。重复检查项目按共享定价规则去重计费。
                        </p>
                      )}
                      {multiPackageMode &&
                        applicablePackages.length < packageChooseCount && (
                          <p className="pt-note">
                            可选线上套餐不足以满足必选数量，请联系体检中心调整配置。
                          </p>
                        )}
                      <div className="pt-package-options">
                        {applicablePackages
                          .filter((p) => p.name.includes(query))
                          .map((p) => (
                            <div
                              className={`pt-package-option ${selectedPackageIds.includes(p.id) ? "selected" : ""}`}
                              key={p.id}
                            >
                              <button
                                aria-pressed={selectedPackageIds.includes(p.id)}
                                onClick={() => selectBookingPackage(p.id)}
                              >
                                <span className="pt-radio">
                                  {selectedPackageIds.includes(p.id) && (
                                    <Check size={13} />
                                  )}
                                </span>
                                <span>
                                  <b>{p.name}</b>
                                  <small>{p.items.join(" · ")}</small>
                                </span>
                                <strong>
                                  {displayPrices ? `¥${p.price}` : "价格待咨询"}
                                </strong>
                              </button>
                              <label>
                                <input
                                  type="checkbox"
                                  checked={compare.includes(p.id)}
                                  onChange={() =>
                                    toggle(compare, p.id, setCompare)
                                  }
                                />{" "}
                                加入对比
                              </label>
                            </div>
                          ))}
                      </div>
                      <button
                        className="pt-secondary"
                        disabled={compare.length < 2}
                        onClick={() => go("compare")}
                      >
                        对比已选套餐（{compare.length}）
                      </button>
                    </>
                  )}
                  {view === "group" && (
                    <div className="pt-form-grid pt-spaced">
                      <label>
                        单位预约模式
                        <select
                          value={activeGroup?.mode || groupMode}
                          disabled={!!activeGroup}
                          onChange={(e) => setGroupMode(e.target.value)}
                        >
                          <option>固定套餐</option>
                          <option>定额自选</option>
                          <option>N 选 M</option>
                          <option>限额自选</option>
                          <option>无限额</option>
                        </select>
                      </label>
                      <label className="pt-check-row">
                        <input
                          type="checkbox"
                          disabled={
                            !groupRelative &&
                            unitSchedules.find(
                              (row) => row.company === groupCompany,
                            )?.allowRelatives === false
                          }
                          checked={groupRelative}
                          onChange={(e) => {
                            if (
                              e.target.checked &&
                              unitSchedules.find(
                                (row) => row.company === groupCompany,
                              )?.allowRelatives === false
                            )
                              return tell("该单位已关闭亲属预约");
                            setGroupRelative(e.target.checked);
                          }}
                        />{" "}
                        亲属预约（单位折扣及承担规则）
                      </label>
                    </div>
                  )}
                  {view === "group" && groupRelative && (
                    <div className="pt-note">
                      <label>
                        关联单位员工（合成）
                        <select
                          value={effectiveSponsorId}
                          onChange={(e) => setSponsorPatientId(e.target.value)}
                        >
                          {eligibleSponsors.map((person) => (
                            <option key={person.id} value={person.id}>
                              {person.name} · {person.company}
                            </option>
                          ))}
                        </select>
                      </label>
                      <p>
                        请在上方选择与员工不同的实际合成亲属体检人。
                        {activeGroup
                          ? `亲属折扣 ${groupDiscountPercent(activeGroup, true)}%；${activeGroup.relativePayment === "unit" ? "单位按预算承担，超额及个人项目自费" : "优惠后全额自费"}`
                          : "请选择有效员工、亲属身份及单位订单日期。"}
                      </p>
                    </div>
                  )}
                  {!simple && (
                    <>
                      {multiPackageMode && (
                        <label className="pt-check-row">
                          <input
                            type="checkbox"
                            checked={autoFilterMutual}
                            onChange={(e) =>
                              setAutoFilterMutual(e.target.checked)
                            }
                          />
                          自动过滤重复与互斥项目（必检优先，其余先选优先）
                        </label>
                      )}
                      {applyAutomaticFiltering &&
                        (normalizedItems.removed.length > 0 ||
                          normalizedItems.errors.length > 0) && (
                          <div
                            className="pt-note"
                            aria-label="项目自动过滤说明"
                          >
                            {normalizedItems.removed.map((row, index) => (
                              <p key={`${row.item}-${index}`}>
                                {row.item}：{row.reason}
                                {row.keptItem ? `；保留 ${row.keptItem}` : ""}
                              </p>
                            ))}
                            {normalizedItems.errors.map((error) => (
                              <p key={error}>{error}</p>
                            ))}
                          </div>
                        )}
                      <h3 className="pt-subheading">套餐检查项目</h3>
                      <p className="pt-muted">
                        {allowRemove
                          ? "可取消不需要的检查项目，套餐价保持不变（演示规则）。"
                          : "当前配置不允许取消套餐项目。"}
                      </p>
                      <div className="pt-item-checks">
                        {basePackageItems.map((item) => (
                          <label key={item}>
                            <input
                              type="checkbox"
                              aria-label={`套餐项目：${item}`}
                              checked={baseItems.includes(item)}
                              disabled={
                                requiredItems.includes(item) ||
                                (!allowRemove && baseItems.includes(item))
                              }
                              onChange={() => {
                                if (
                                  requiredItems.includes(item) ||
                                  (!allowRemove && baseItems.includes(item))
                                )
                                  return;
                                toggle(excludedItems, item, setExcludedItems);
                              }}
                            />
                            {item}
                          </label>
                        ))}
                      </div>
                      <h3 className="pt-subheading">
                        按需增加检查项目{" "}
                        {view === "group" &&
                          (activeGroup ? (
                            <small>
                              {bookingExtras.length} 选{" "}
                              {activeGroup.choose || 0}
                            </small>
                          ) : (
                            groupMode === "N 选 M" && <small>3 选 2</small>
                          ))}
                      </h3>
                      <div className="pt-form-grid">
                        <label>
                          按检查部位添加
                          <select
                            value={bodyPartFilter}
                            onChange={(e) => setBodyPartFilter(e.target.value)}
                          >
                            <option value="">全部部位</option>
                            {[
                              ...new Set(
                                genericExtras.map(
                                  (extra) =>
                                    getItemClassification(state, extra.name)
                                      .bodyPart,
                                ),
                              ),
                            ].map((part) => (
                              <option key={part}>{part}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          按疾病类型添加
                          <select
                            value={diseaseFilter}
                            onChange={(e) => setDiseaseFilter(e.target.value)}
                          >
                            <option value="">全部类型</option>
                            {[
                              ...new Set(
                                genericExtras.map(
                                  (extra) =>
                                    getItemClassification(state, extra.name)
                                      .diseaseType,
                                ),
                              ),
                            ].map((type) => (
                              <option key={type}>{type}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                      {displayedExtras.map(
                        (e: {
                          name: string;
                          price: number;
                          detail: string;
                        }) => (
                          <label className="pt-extra" key={e.name}>
                            <input
                              type="checkbox"
                              disabled={!allowAdd}
                              checked={activeExtras.includes(e.name)}
                              onChange={() =>
                                toggle(
                                  selectedExtras,
                                  e.name,
                                  setSelectedExtras,
                                )
                              }
                            />
                            <span>
                              <b>{e.name}</b>
                              <small>{e.detail}</small>
                            </span>
                            <b>
                              {displayPrices ? `+ ¥${e.price}` : "价格待咨询"}
                            </b>
                          </label>
                        ),
                      )}
                      {activeBundles.map((bundle) => (
                        <fieldset className="pt-note" key={bundle.packageId}>
                          <legend>{bundle.name} · 独立自选包</legend>
                          <p>
                            {bundle.eligibleItems.length} 选 {bundle.choose}
                            ，已选{" "}
                            {
                              (bundleSelections[bundle.packageId] || []).filter(
                                (item) =>
                                  activeExtras.includes(item) &&
                                  bundle.eligibleItems.includes(item),
                              ).length
                            }
                            /{bundle.choose}；跨包同项目只计价一次。
                          </p>
                          {bundle.eligibleItems.map((item) => (
                            <label key={item} className="pt-check-row">
                              <input
                                type="checkbox"
                                aria-label={`${bundle.name}自选包：${item}`}
                                disabled={!allowAdd}
                                checked={
                                  !!bundleSelections[
                                    bundle.packageId
                                  ]?.includes(item)
                                }
                                onChange={(e) => {
                                  const current = (
                                    bundleSelections[bundle.packageId] || []
                                  ).filter((name) =>
                                    bundle.eligibleItems.includes(name),
                                  );
                                  if (
                                    e.target.checked &&
                                    current.length >= bundle.choose
                                  )
                                    return tell(
                                      `${bundle.name}自选包最多选择 ${bundle.choose} 项`,
                                    );
                                  setBundleSelections({
                                    ...bundleSelections,
                                    [bundle.packageId]: e.target.checked
                                      ? [...current, item]
                                      : current.filter((name) => name !== item),
                                  });
                                }}
                              />
                              {item}
                              {displayPrices
                                ? ` · ¥${bookingExtras.find((extra) => extra.name === item)?.price ?? 0}`
                                : ""}
                            </label>
                          ))}
                        </fieldset>
                      ))}
                      {!allowAdd && (
                        <p className="pt-note">
                          当前配置不允许增加套餐外项目。
                        </p>
                      )}
                    </>
                  )}
                  {view === "group" && (
                    <>
                      <label>
                        预约单位
                        <select
                          value={groupCompany}
                          onChange={(e) => setGroupCompany(e.target.value)}
                        >
                          {unitSchedules.map((row) => (
                            <option key={row.id} value={row.company}>
                              {row.company}
                            </option>
                          ))}
                        </select>
                      </label>
                      <UnitBookingCalendar
                        company={groupCompany}
                        onSelectDate={setDate}
                      />
                    </>
                  )}
                  <h3 className="pt-subheading">预约时间</h3>
                  <div
                    style={{
                      display: "flex",
                      gap: 7,
                      flexWrap: "wrap",
                      marginBottom: 15,
                    }}
                  >
                    {getBookingDates(state, 14).map((day) => (
                      <button
                        className="pt-secondary"
                        style={{ padding: "7px 9px", fontSize: 10 }}
                        key={day}
                        onClick={() => setDate(day)}
                      >
                        {day.slice(5)}
                      </button>
                    ))}
                  </div>
                  <div className="pt-form-grid">
                    <label>
                      预约日期
                      <input
                        type="date"
                        min={new Date().toISOString().slice(0, 10)}
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                      />
                    </label>
                    <label>
                      到院时段
                      <select
                        value={time}
                        onChange={(e) => setTime(e.target.value)}
                      >
                        {getBookingSlots(state).map((slot) => (
                          <option key={slot.time}>{slot.time}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div
                    className={`pt-capacity ${availability.allowed ? "" : "blocked"}`}
                    role="note"
                  >
                    {groupContractBlocked
                      ? "当前体检人不在单位订单有效名单或预约日期内"
                      : availability.error ||
                        `当日全院剩余 ${availability.remaining} / ${availability.capacity} 个预约名额`}
                  </div>
                  <div className="pt-note">
                    请提前 10
                    分钟到院。涉及空腹项目的准备，以体检中心发出的具体须知为准。
                  </div>
                  <label className="pt-check-row">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                    />{" "}
                    已阅读预约须知，确认本次为本地模拟预约
                  </label>
                  {questionnaireEnabled && !questionnaireCompleted && (
                    <p className="pt-note">
                      {questionnaireSkippable
                        ? "检前问卷可选填。"
                        : "预约前须完成检前问卷。"}
                      <button
                        className="pt-text-button"
                        onClick={() => go("questionnaire")}
                      >
                        填写检前问卷
                      </button>
                    </p>
                  )}
                  <div className="pt-checkout">
                    <div>
                      <small>
                        {!displayPrices
                          ? "价格展示已关闭"
                          : view === "group"
                            ? `单位承担 ¥${groupCharge.unit} / 自费 ¥${groupCharge.personal}`
                            : "预约总金额"}
                        <br />
                      </small>
                      <strong>
                        {displayPrices
                          ? `¥${total.toLocaleString()}`
                          : "待确认"}
                      </strong>
                    </div>
                    <button
                      className="pt-primary"
                      disabled={!availability.allowed || groupContractBlocked}
                      onClick={() => createOrder(view === "group")}
                    >
                      确认预约 <ArrowRight size={17} />
                    </button>
                  </div>
                </>
              )}
            </section>
          )}
          {view === "compare" && (
            <section className="pt-card">
              <p className="pt-note">
                横向对比套餐价格、明细及检查意义。仅展示演示套餐配置。
              </p>
              <div className="pt-compare-table">
                <table>
                  <thead>
                    <tr>
                      <th>对比项目</th>
                      {state.packages
                        .filter((p) => compare.includes(p.id))
                        .map((p) => (
                          <th key={p.id}>
                            {p.name}
                            <strong>
                              {displayPrices ? `¥${p.price}` : "价格待咨询"}
                            </strong>
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(
                      new Set(
                        state.packages
                          .filter((p) => compare.includes(p.id))
                          .flatMap((p) => p.items),
                      ),
                    ).map((item) => (
                      <tr key={item}>
                        <td>
                          <b>{item}</b>
                          <small>
                            {meanings[item] ||
                              "用于评估相关健康情况，详情以中心项目说明为准"}
                          </small>
                        </td>
                        {state.packages
                          .filter((p) => compare.includes(p.id))
                          .map((p) => (
                            <td key={p.id}>
                              {p.items.includes(item) ? (
                                <CheckCircle2 size={18} />
                              ) : (
                                "—"
                              )}
                            </td>
                          ))}
                      </tr>
                    ))}
                    <tr>
                      <td>选择套餐</td>
                      {state.packages
                        .filter((p) => compare.includes(p.id))
                        .map((p) => (
                          <td key={p.id}>
                            <button
                              className="pt-secondary"
                              onClick={() => {
                                if (!selectedPackageIds.includes(p.id))
                                  selectBookingPackage(p.id);
                                go(bookingReturn);
                              }}
                            >
                              选择此套餐
                            </button>
                          </td>
                        ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {view === "questionnaire" && (
            <section className="pt-card">
              <span className="pt-pill">
                <Sparkles size={15} />
                检前健康问卷
              </span>
              <h2>先了解您，再选择检查</h2>
              {!questionnaireEnabled ? (
                <>
                  <p className="pt-note">
                    当前配置已关闭检前问卷，不采集问卷，也不生成推荐。
                  </p>
                  <button
                    className="pt-secondary"
                    onClick={() => go(bookingReturn)}
                  >
                    返回预约
                  </button>
                </>
              ) : (
                <>
                  <p className="pt-muted">
                    仅记录合成选择，规则推荐不构成诊疗建议。
                    {questionnaireSkippable
                      ? "本问卷可以跳过。"
                      : "本问卷为预约必填项，不允许跳过。"}
                  </p>
                  <div className="pt-form-grid">
                    {(
                      [
                        ["history", "合成既往史"],
                        ["medication", "合成用药记录"],
                        ["family", "合成家族史"],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key}>
                        {label}（可选）
                        <select
                          value={questionContext[key]}
                          onChange={(e) =>
                            setQuestionContext({
                              ...questionContext,
                              [key]: e.target.value,
                            })
                          }
                        >
                          <option value="">未填写</option>
                          <option value={`${label}样例A（非真实信息）`}>
                            {label}样例A（非真实信息）
                          </option>
                          <option value="明确无相关演示记录">
                            明确无相关演示记录
                          </option>
                        </select>
                      </label>
                    ))}
                  </div>
                  {QUESTIONNAIRE_OPTIONS.map((a) => (
                    <label className="pt-survey-option" key={a}>
                      <input
                        type="checkbox"
                        checked={answers.includes(a)}
                        onChange={() => {
                          toggle(answers, a, setAnswers);
                          setQuestionDone(false);
                        }}
                      />
                      {a}
                    </label>
                  ))}
                  <button
                    className="pt-primary"
                    disabled={!answers.length}
                    onClick={() => {
                      act({
                        type: "UPSERT_RECORD",
                        payload: {
                          collection: "bookingQuestionnaires",
                          record: {
                            id: `Q-${patient.id}`,
                            patientId: patient.id,
                            ...questionContext,
                            answers,
                            status: "completed",
                            completedAt: getBookingNow(state).toISOString(),
                            recommended: recommendationEnabled
                              ? recommendedBookingItems(answers)
                              : [],
                          },
                        },
                      });
                      setQuestionDone(true);
                      tell("检前问卷已保存");
                    }}
                  >
                    {recommendationEnabled
                      ? "完成问卷并生成参考方案"
                      : "提交问卷"}
                  </button>
                  {questionnaireSkippable && (
                    <button
                      className="pt-secondary"
                      style={{ marginLeft: 10 }}
                      onClick={() => {
                        act({
                          type: "UPSERT_RECORD",
                          payload: {
                            collection: "bookingQuestionnaires",
                            record: {
                              id: `Q-${patient.id}`,
                              patientId: patient.id,
                              history: "",
                              medication: "",
                              family: "",
                              recommended: [],
                              answers: [],
                              status: "skipped",
                              completedAt: getBookingNow(state).toISOString(),
                            },
                          },
                        });
                        go(bookingReturn);
                      }}
                    >
                      跳过问卷
                    </button>
                  )}
                  {questionDone && (
                    <div className="pt-recommendation">
                      <h3>
                        {recommendationEnabled
                          ? "为您整理的参考组合"
                          : "问卷已完成"}
                      </h3>
                      {recommendationEnabled ? (
                        <>
                          <p>
                            基础套餐：
                            {selectedPackages
                              .map((pack) => pack.name)
                              .join(" + ")}
                          </p>
                          <p>
                            可向医生咨询：
                            {recommendedBookingItems(answers).join("、") ||
                              "基础健康评估"}
                          </p>
                          <button
                            className="pt-secondary"
                            onClick={() => {
                              if (allowAdd)
                                setSelectedExtras(
                                  recommendedBookingItems(answers),
                                );
                              go(bookingReturn);
                            }}
                          >
                            使用方案继续预约
                          </button>
                        </>
                      ) : (
                        <>
                          <p>当前配置关闭了问卷推荐，不会自动增加检查项目。</p>
                          <button
                            className="pt-secondary"
                            onClick={() => go(bookingReturn)}
                          >
                            返回预约
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
            </section>
          )}
          {view === "orders" && (
            <div className="pt-stacked">
              {orders.length === 0 && (
                <div className="pt-card pt-empty">
                  <CalendarDays size={38} />
                  <h3>还没有体检预约</h3>
                  <button className="pt-primary" onClick={() => go("booking")}>
                    预约一次健康关怀
                  </button>
                </div>
              )}
              {(state.records.cancelledAppointmentArchive || [])
                .filter(
                  (record) =>
                    record.patientId === patient.id &&
                    record.policy === "deleteBusiness" &&
                    !record.restoredAt,
                )
                .map((record) => (
                  <section className="pt-card" key={record.id}>
                    <h3>已移除业务的取消预约 · {record.id}</h3>
                    <p>
                      取消时间 {record.cancelledAt} ·
                      审计与财务记录保留。恢复后仅为已取消历史记录，不恢复排队、打印任务或预约资格，不重新收费。
                    </p>
                    <button
                      className="pt-secondary"
                      onClick={() =>
                        act({
                          type: "RESTORE_CANCELLED_APPOINTMENT",
                          payload: { id: record.id, patientId: patient.id },
                        })
                      }
                    >
                      恢复取消记录供查询
                    </button>
                  </section>
                ))}
              {orders.map((a) => (
                <section className="pt-card pt-order" key={a.id}>
                  <div className="pt-order-top">
                    <span>预约编号 {a.id}</span>
                    <span
                      className={`pt-status ${a.status === "cancelled" ? "gray" : ""}`}
                    >
                      {statuses[a.status]}
                    </span>
                  </div>
                  <h3>
                    {(a.packageIds?.length
                      ? state.packages
                          .filter((pack) => a.packageIds.includes(pack.id))
                          .map((pack) => pack.name)
                          .join(" + ")
                      : state.packages.find((p) => p.id === a.packageId)
                          ?.name) || "个性化 / 简单预约"}
                  </h3>
                  <p>
                    <UserRound size={15} /> {patient.name} <MapPin size={15} />{" "}
                    {a.campus}
                  </p>
                  <p>
                    <CalendarDays size={15} /> {a.date} <Clock3 size={15} />{" "}
                    {a.time}
                  </p>
                  <div className="pt-order-bottom">
                    <strong>¥{a.amount}</strong>
                    <div>
                      {a.status === "booked" && (
                        <button
                          className="pt-primary"
                          onClick={() => setPayId(a.id)}
                        >
                          模拟支付
                        </button>
                      )}
                      {["booked", "paid"].includes(a.status) && (
                        <>
                          <button
                            className="pt-secondary"
                            onClick={() => {
                              setEditId(a.id);
                              setDate(a.date);
                            }}
                          >
                            改期
                          </button>
                          <button
                            className="pt-text-button"
                            disabled={!!a.locked}
                            title={a.locked ? "订单已锁定，不可取消" : ""}
                            onClick={() => setCancelId(a.id)}
                          >
                            取消预约
                          </button>
                        </>
                      )}
                      {["paid", "checked", "in_exam"].includes(a.status) && (
                        <button
                          className="pt-secondary"
                          onClick={() => go("guide")}
                        >
                          电子导检
                        </button>
                      )}
                      {["approved", "printed"].includes(a.status) && (
                        <button
                          className="pt-secondary"
                          onClick={() => {
                            setReportId(a.id);
                            go("reports");
                          }}
                        >
                          查看报告
                        </button>
                      )}
                    </div>
                  </div>
                </section>
              ))}
            </div>
          )}
          {view === "guide" && (
            <section className="pt-card">
              <div className="pt-info-banner">
                <MapPin size={25} />
                <div>
                  <b>
                    {upcoming
                      ? `${upcoming.campus} · 电子导检单`
                      : "暂无进行中的体检"}
                  </b>
                  <p>
                    {upcoming
                      ? `${upcoming.date} ${upcoming.time} · ${statuses[upcoming.status]}`
                      : "请完成预约后查看您的专属路线。"}
                  </p>
                </div>
              </div>
              {upcoming ? (
                <>
                  <div className="pt-next-stop">
                    <span>建议下一站</span>
                    <h2>
                      {["booked", "paid"].includes(upcoming.status)
                        ? "一层 · 自助报到区"
                        : `${Object.keys(upcoming.results).length ? "二层" : "一层"} · ${upcoming.items.find((item) => !upcoming.results[item]) || "报告服务台"}`}
                    </h2>
                    <p>
                      <Clock3 size={16} /> 预计等候 6 分钟{" "}
                      <small>演示估算</small>
                    </p>
                  </div>
                  <section
                    className="pt-info-banner"
                    style={{ alignItems: "flex-start" }}
                  >
                    <QRCodeSVG
                      value={`${window.location.origin}${window.location.pathname}#/patient?queue=${encodeURIComponent(upcoming.id)}`}
                      size={92}
                      title="演示排队查询二维码"
                    />
                    <div>
                      <b>我的排队二维码</b>
                      <p>扫码回到此合成订单的排队页，非真实身份凭证。</p>
                      <small>{upcoming.id}</small>
                    </div>
                  </section>
                  <h3 className="pt-subheading">我的实时演示队列</h3>
                  {currentTickets.map((ticket) => (
                    <div className="pt-info-banner" key={ticket.id}>
                      <div style={{ flex: 1 }}>
                        <b>
                          {deriveQueueDefinitions(state).find(
                            (q) => q.id === ticket.department,
                          )?.department || ticket.department}
                        </b>
                        <p>
                          {
                            (
                              {
                                waiting: "等待中",
                                calling: "正在叫号",
                                missed: "已过号",
                              } as Record<string, string>
                            )[ticket.status]
                          }{" "}
                          · {ticket.roomName || ticket.zone || "等候区"}
                        </p>
                        <small>
                          队列位置 {Number(ticket.position) + 1} · 演示票号{" "}
                          {ticket.id}
                        </small>
                      </div>
                      <button
                        className="pt-secondary"
                        onClick={() => {
                          act({
                            type: "UPSERT_RECORD",
                            payload: {
                              collection: "queueTickets",
                              record: {
                                ...ticket,
                                status: "cleared",
                                endedBy: "patient",
                                endedAt: getBookingNow(state).toISOString(),
                                reason: "体检人主动结束排队",
                              },
                            },
                          });
                          tell("已结束本次排队，工作台队列已同步");
                        }}
                      >
                        结束此排队
                      </button>
                    </div>
                  ))}
                  {!currentTickets.length && (
                    <p className="pt-note">当前没有活动排队记录。</p>
                  )}
                  {selectedQueue && (
                    <div className="pt-form-grid">
                      <label>
                        选择排队科室
                        <select
                          value={selectedQueue.id}
                          onChange={(e) => setQueueDepartment(e.target.value)}
                        >
                          {queueDefinitions.map((q) => (
                            <option key={q.id} value={q.id}>
                              {q.department}
                              {state.config.queueOpen?.[q.id] === false
                                ? "（已关闭）"
                                : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button className="pt-secondary" onClick={joinQueue}>
                        加入演示排队
                      </button>
                    </div>
                  )}
                  <h3 className="pt-subheading">您的检查进度</h3>
                  <div className="pt-progress">
                    <i
                      style={{
                        width: `${Math.min(100, (Object.keys(upcoming.results).length / Math.max(1, upcoming.items.length)) * 100)}%`,
                      }}
                    />
                  </div>
                  <div className="pt-guide-list">
                    {upcoming.items.map((item, i) => (
                      <div key={`${item}-${i}`}>
                        <span className={upcoming.results[item] ? "done" : ""}>
                          {upcoming.results[item] ? (
                            <Check size={17} />
                          ) : (
                            String(i + 1).padStart(2, "0")
                          )}
                        </span>
                        <div>
                          <b>{item}</b>
                          <small>
                            {i % 2 ? "二层检查区" : "一层检查区"} ·{" "}
                            {upcoming.results[item]
                              ? "检查完成"
                              : `预计等候 ${[3, 6, 8, 4][i % 4]} 分钟（模拟）`}
                          </small>
                        </div>
                        <span className="pt-mini-tag">
                          {upcoming.results[item] ? "已完成" : "待检查"}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="pt-note">
                    检查进度与医护工作台同步。路线与等候时间为演示数据，未接入实时院内导航。
                  </p>
                </>
              ) : (
                <button className="pt-primary" onClick={() => go("booking")}>
                  去预约
                </button>
              )}
            </section>
          )}
          {view === "reports" && (
            <section className="pt-card">
              {!currentReport ? (
                <div className="pt-empty">
                  <FileCheck2 size={45} />
                  <h3>报告正在路上</h3>
                  <p>总检审核通过后，报告将展示在这里。</p>
                  <button
                    className="pt-secondary"
                    onClick={() => go("profile")}
                  >
                    切换演示体检人
                  </button>
                </div>
              ) : (
                <>
                  <div className="pt-section-title compact">
                    <div>
                      <span className="pt-pill">审核通过 · 示例报告</span>
                      <h2>{patient.name}的健康体检报告</h2>
                    </div>
                    <FileCheck2 size={36} />
                  </div>
                  <label>
                    选择检查记录
                    <select
                      value={currentReport.id}
                      onChange={(e) => setReportId(e.target.value)}
                    >
                      {reports.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.date} · {r.campus}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="pt-report-summary">
                    <ShieldCheck size={27} />
                    <div>
                      <h3>总检结论</h3>
                      <p>
                        {currentReport.conclusion ||
                          "示例报告已审核。请结合各分项结果咨询体检中心。"}
                      </p>
                      <small>
                        本报告为合成演示数据，不能用于真实医疗决策。
                      </small>
                    </div>
                  </div>
                  <h3 className="pt-subheading">检查结果</h3>
                  {Object.entries(currentReport.results).length ? (
                    Object.entries(currentReport.results).map(
                      ([name, result]) => (
                        <div className="pt-result-row" key={name}>
                          <b>{name}</b>
                          <span>{String(result)}</span>
                        </div>
                      ),
                    )
                  ) : (
                    <p className="pt-muted">分项结果尚未录入。</p>
                  )}
                  <h3 className="pt-subheading">历次记录对比</h3>
                  {currentReport.history && (
                    <>
                      <label>
                        对比次数
                        <select
                          value={historyCount}
                          onChange={(e) =>
                            setHistoryCount(Number(e.target.value))
                          }
                        >
                          <option value={2}>最近 2 次</option>
                          <option value={3}>最近 3 次</option>
                        </select>
                      </label>
                      <div className="pt-compare-table">
                        <table>
                          <thead>
                            <tr>
                              <th>指标</th>
                              {Array.from({ length: historyCount }, (_, i) => (
                                <th key={i}>
                                  {i === historyCount - 1
                                    ? "本次"
                                    : `前 ${historyCount - i - 1} 次`}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(
                              currentReport.history as Record<string, string[]>,
                            ).map(([key, values]) => (
                              <tr key={key}>
                                <td>{key}</td>
                                {values.slice(-historyCount).map((value, i) => (
                                  <td key={i}>{value}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="pt-note">
                        以上为样例中保存的合成历次指标。原始检查日期未提供，按检查次序展示。
                      </p>
                    </>
                  )}
                  <div className="pt-compare-table">
                    <table>
                      <thead>
                        <tr>
                          <th>日期</th>
                          <th>院区</th>
                          <th>已录入结果</th>
                          <th>状态</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orders
                          .filter((a) => Object.keys(a.results).length)
                          .map((a) => (
                            <tr key={a.id}>
                              <td>{a.date}</td>
                              <td>{a.campus}</td>
                              <td>
                                {Object.entries(a.results)
                                  .map(([k, v]) => `${k}：${v}`)
                                  .join("；")}
                              </td>
                              <td>{statuses[a.status]}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  <button className="pt-primary" onClick={() => go("followup")}>
                    查看健康随访 <ArrowRight size={17} />
                  </button>
                </>
              )}
            </section>
          )}
          {view === "followup" && (
            <section className="pt-card">
              <span className="pt-pill">
                <Heart size={15} /> 让改变发生在日常
              </span>
              <h2>我的健康行动计划</h2>
              <p className="pt-muted">
                以下是一般健康习惯演示，实际随访方案需由专业人员制定。
              </p>
              {[
                "规律作息，记录今天的睡眠",
                "适量活动，记录日常步行",
                "均衡饮食，记录蔬果摄入",
              ].map((task, i) => (
                <button
                  className={`pt-habit ${healthDays.includes(task) ? "checked" : ""}`}
                  key={task}
                  onClick={() => toggle(healthDays, task, setHealthDays)}
                >
                  <span>
                    {healthDays.includes(task) ? (
                      <Check size={20} />
                    ) : (
                      <HeartPulse size={20} />
                    )}
                  </span>
                  <div>
                    <b>{task}</b>
                    <small>
                      {healthDays.includes(task)
                        ? "今日已打卡"
                        : `每日计划 ${i + 1} · 点击完成今日打卡`}
                    </small>
                  </div>
                  <ChevronRight size={17} />
                </button>
              ))}
              <div className="pt-progress">
                <i style={{ width: `${(healthDays.length / 3) * 100}%` }} />
              </div>
              <p>今日已完成 {healthDays.length} / 3 项</p>
              <button
                className="pt-primary"
                onClick={() => {
                  act({
                    type: "ADD_TASK",
                    payload: {
                      title: "H5 用户申请健康随访",
                      patientId: patient.id,
                      status: "待处理",
                      date: upcomingDate(),
                    },
                  });
                  tell("随访申请已提交到健康管理工作台（模拟）");
                }}
              >
                申请健康随访 <MessageCircle size={17} />
              </button>
            </section>
          )}
          {view === "services" && (
            <section className="pt-card">
              <h2>专业服务，温暖陪伴</h2>
              <p className="pt-muted">
                服务预约仅建立本地待处理任务，不发送外部消息。
              </p>
              {serviceNames.map((name, i) => (
                <button
                  className="pt-service-row"
                  key={name}
                  onClick={() => setService(name)}
                >
                  <span>
                    {i < 2 ? <Stethoscope size={24} /> : <Heart size={24} />}
                  </span>
                  <div>
                    <h3>{name}</h3>
                    <p>
                      {publicRows("portalServices").find(
                        (row) => row.name === name,
                      )?.scope || "专业人员协助 · 预约后联系"}
                    </p>
                  </div>
                  <ChevronRight size={19} />
                </button>
              ))}
            </section>
          )}
          {view === "shop" && (
            <section className="pt-card">
              <span className="pt-pill">演示商城 · 不产生真实交易</span>
              <h2>日常健康，小物相伴</h2>
              <div className="pt-shop-item">
                <span>
                  <ShoppingBag size={60} />
                </span>
                <div>
                  <h3>健康记录手账套装</h3>
                  <p>把每一天的习惯与变化，认真记下来。</p>
                  <strong>¥29.00</strong>
                  <button
                    className="pt-secondary"
                    onClick={() => setCart(cart + 1)}
                  >
                    <Plus size={16} /> 加入演示购物车
                  </button>
                </div>
              </div>
              <div className="pt-checkout">
                <div>
                  <small>购物车 {cart} 件</small>
                  <strong>¥{cart * 29}</strong>
                </div>
                <button
                  className="pt-primary"
                  disabled={!cart}
                  onClick={() => {
                    act({
                      type: "ADD_AUDIT",
                      payload: {
                        message: `${patient.name} 模拟兑换健康手账 ${cart} 件，无真实付款`,
                      },
                    });
                    setCart(0);
                    tell("演示订单已记录，未扣款、未发货");
                  }}
                >
                  模拟结算
                </button>
              </div>
            </section>
          )}
          {view === "messages" && (
            <section className="pt-card">
              <div className="pt-info-banner">
                <Bell size={23} />
                <div>
                  <b>服务通知</b>
                  <p>预约与报告状态将同步更新。短信、微信推送均未实际发送。</p>
                </div>
              </div>
              <h3 className="pt-subheading">给体检中心留言</h3>
              {messages.map((msg, i) => (
                <div className="pt-message-bubble" key={i}>
                  <b>我 · 留言已记录</b>
                  <p>{msg}</p>
                  <small>待工作人员处理（演示）</small>
                </div>
              ))}
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                placeholder="请填写演示留言，不要输入真实个人敏感信息"
              />
              <button
                className="pt-primary"
                disabled={!message.trim()}
                onClick={() => {
                  setMessages([...messages, message.trim()]);
                  act({
                    type: "ADD_TASK",
                    payload: {
                      title: `H5 留言：${message.trim()}`,
                      patientId: patient.id,
                      status: "待处理",
                    },
                  });
                  setMessage("");
                  tell("留言已提交到本地服务工单");
                }}
              >
                提交留言
              </button>
              <h3 className="pt-subheading">服务满意度问卷</h3>
              <p className="pt-note">
                合成体验问卷：五道评分均为必答，1 分为很不满意，5
                分为非常满意。每位体检人每份订单仅提交一次，本地保存后可回看。
              </p>
              <label className="pt-field">
                评价体验订单
                <select
                  value={surveyAppointmentId}
                  onChange={(e) => setSurveyOrderId(e.target.value)}
                >
                  {surveyOrders.length ? (
                    surveyOrders.map((order) => (
                      <option key={order.id} value={order.id}>
                        {order.date} · {order.id}
                      </option>
                    ))
                  ) : (
                    <option value="">门户浏览体验（无订单）</option>
                  )}
                </select>
              </label>
              {satisfactionResult ? (
                <section
                  className="pt-info-banner"
                  aria-label="满意度问卷已提交结果"
                  style={{ display: "block" }}
                >
                  <h3>
                    <CheckCircle2 size={20} /> 本次满意度问卷已提交
                  </h3>
                  <p>
                    提交时间：{satisfactionResult.submittedAt} · 平均评分：
                    {satisfactionResult.average} / 5
                  </p>
                  {satisfactionQuestions.map((question) => (
                    <p key={question.key}>
                      {question.label}：
                      {satisfactionResult.scores?.[question.key]} 分
                    </p>
                  ))}
                  <p>合成建议：{satisfactionResult.suggestion || "未填写"}</p>
                  <small>已保存结果仅供本地演示，重复提交已关闭。</small>
                </section>
              ) : (
                <div>
                  {satisfactionQuestions.map((question, index) => (
                    <label
                      className="pt-survey-option"
                      key={question.key}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                      }}
                    >
                      <span>
                        {index + 1}. {question.label}{" "}
                        <b aria-hidden="true">*</b>
                      </span>
                      <select
                        required
                        aria-label={question.label}
                        value={surveyScores[question.key] || ""}
                        onChange={(e) =>
                          setSurveyScores({
                            ...surveyScores,
                            [question.key]: Number(e.target.value),
                          })
                        }
                      >
                        <option value="">请选择评分</option>
                        {[1, 2, 3, 4, 5].map((score) => (
                          <option key={score} value={score}>
                            {score} 分
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                  <label className="pt-field">
                    合成改进建议（选填）
                    <select
                      value={surveySuggestion}
                      onChange={(e) => setSurveySuggestion(e.target.value)}
                    >
                      <option value="">暂不填写</option>
                      {satisfactionSuggestions.map((suggestion) => (
                        <option key={suggestion}>{suggestion}</option>
                      ))}
                    </select>
                  </label>
                  <button className="pt-primary" onClick={submitSatisfaction}>
                    提交满意度问卷
                  </button>
                </div>
              )}
            </section>
          )}
          {view === "profile" && (
            <section className="pt-card">
              <div className="pt-profile-header">
                <span>{patient.name.slice(-1)}</span>
                <div>
                  <h2>{patient.name}</h2>
                  <p>
                    {patient.sex} · {patient.age} 岁 ·{" "}
                    {patient.company || "个人客户"}
                  </p>
                  <small>合成身份 · {patient.phone}</small>
                </div>
                <ShieldCheck size={28} />
              </div>
              <div className="pt-profile-shortcuts">
                <button onClick={() => go("orders")}>
                  <CalendarDays size={18} />
                  我的预约
                </button>
                <button onClick={() => go("reports")}>
                  <FileText size={18} />
                  体检报告
                </button>
                <button onClick={() => go("followup")}>
                  <Heart size={18} />
                  健康随访
                </button>
              </div>
              <h3 className="pt-subheading">合成身份切换</h3>
              {state.patients.map((p) => (
                <button
                  className={`pt-profile-person ${p.id === patient.id ? "selected" : ""}`}
                  key={p.id}
                  onClick={() => {
                    setPatientId(p.id);
                    setReportId("");
                    tell(`已切换到演示体检人 ${p.name}`);
                  }}
                >
                  <UserRound size={23} />
                  <div>
                    <b>{p.name}</b>
                    <small>
                      {p.sex} · {p.age} 岁 · {p.company || "个人"}
                    </small>
                  </div>
                  {p.id === patient.id ? (
                    <CheckCircle2 size={20} />
                  ) : (
                    <ChevronRight size={18} />
                  )}
                </button>
              ))}
              <h3 className="pt-subheading">我的常用体检人</h3>
              {state.patients
                .filter((p) => p.id !== accountId)
                .map((p) => (
                  <label className="pt-check-row" key={`common-${p.id}`}>
                    <input
                      type="checkbox"
                      aria-label={`常用体检人：${p.name}`}
                      checked={commonPeople.some(
                        (row) => row.patientId === p.id,
                      )}
                      onChange={(e) => saveCommon(p.id, e.target.checked)}
                    />
                    {p.name} · 保存为常用体检人
                  </label>
                ))}
              <p className="pt-note">
                取消勾选仅从当前演示账户的常用列表移除，已有体检记录保持完整。
              </p>
              <h3 className="pt-subheading">注册合成账户 / 新增常用体检人</h3>
              <p className="pt-muted">
                仅接受“演示”称呼与 DEMO 手机号标识，不进行真实实名或微信登录。
              </p>
              <div className="pt-form-grid">
                <label>
                  合成称呼
                  <input
                    value={personDraft.name}
                    onChange={(e) =>
                      setPersonDraft({ ...personDraft, name: e.target.value })
                    }
                    placeholder="演示小青"
                  />
                </label>
                <label>
                  合成手机号标识
                  <input
                    value={personDraft.phone}
                    onChange={(e) =>
                      setPersonDraft({ ...personDraft, phone: e.target.value })
                    }
                    placeholder="DEMO-1001"
                  />
                </label>
                <label>
                  演示性别
                  <select
                    value={personDraft.sex}
                    onChange={(e) =>
                      setPersonDraft({ ...personDraft, sex: e.target.value })
                    }
                  >
                    <option>男</option>
                    <option>女</option>
                  </select>
                </label>
                <label>
                  演示年龄
                  <input
                    type="number"
                    min={18}
                    max={99}
                    value={personDraft.age}
                    onChange={(e) =>
                      setPersonDraft({
                        ...personDraft,
                        age: Number(e.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <button
                className="pt-primary"
                style={{ marginTop: 15 }}
                onClick={registerPerson}
              >
                注册并保存合成体检人
              </button>
              <h3 className="pt-subheading">个人推广入口（本地演示）</h3>
              <label>
                演示推广人员
                <select
                  value={shareDistributor}
                  onChange={(e) => setShareDistributor(e.target.value)}
                >
                  {state.patients.map((p) => (
                    <option key={p.id} value={`D-${p.id}`}>
                      {p.name} · D-{p.id}
                    </option>
                  ))}
                </select>
              </label>
              <div className="pt-unit-qr">
                <QRCodeSVG
                  value={referralUrl}
                  size={128}
                  title="个人推广预约二维码"
                />
              </div>
              <a className="pt-group-link" href={referralUrl}>
                打开个人推广预约入口
              </a>
              <p className="pt-note">
                通过此推广入口创建的订单：
                {
                  state.appointments.filter(
                    (a) => a.distributorId === shareDistributor,
                  ).length
                }{" "}
                单；其中有效订单{" "}
                {
                  state.appointments.filter(
                    (a) =>
                      a.distributorId === shareDistributor &&
                      a.status !== "cancelled",
                  ).length
                }{" "}
                单。按已保存来源实时统计。
              </p>
              <div className="pt-result-row">
                <span>预约提醒（本地设置）</span>
                <button
                  className={`pt-toggle ${reminders ? "on" : ""}`}
                  aria-label="切换预约提醒"
                  aria-pressed={reminders}
                  onClick={() => setReminders(!reminders)}
                >
                  <i />
                </button>
              </div>
              <p className="pt-note">
                所有身份均为合成数据。请勿输入真实身份证号、健康信息或支付信息。
              </p>
            </section>
          )}
          {view === "article" && (
            <section className="pt-card pt-reading">
              <span className="pt-pill">健康课堂 · 科普示例</span>
              <h2>{article}</h2>
              {configuredArticle && (
                <p className="pt-info-banner">{configuredArticle.summary}</p>
              )}
              <p className="pt-muted">
                健康中心编辑部 · 2026 年 10 月 · 3 分钟
              </p>
              <div className="pt-article-cover">
                <HeartPulse size={70} strokeWidth={1} />
                <span>认真生活，好好照顾自己。</span>
              </div>
              <h3>提前准备，从容开启</h3>
              <p>
                预约完成后，请留意体检中心提供的项目清单与准备要求，确认到院时间、院区和需要携带的资料。如有正在使用的药物，请向专业人员咨询，不要自行停药。
              </p>
              <h3>把健康融入日常</h3>
              <p>
                规律的作息、适合自己的活动与均衡饮食，都是关心健康的起点。如果对检查结果有疑问，可以通过报告解读服务，与专业人员沟通。
              </p>
              <button
                className="pt-secondary"
                onClick={() => {
                  act({
                    type: "ADD_AUDIT",
                    payload: {
                      message: `${patient.name} 收藏健康课堂：${article}`,
                    },
                  });
                  tell("文章已加入演示收藏");
                }}
              >
                <Heart size={16} /> 收藏这篇文章
              </button>
            </section>
          )}
        </main>
        <aside className="pt-aside">
          <section className="pt-wellness-card">
            <div>
              <span>
                <HeartPulse size={23} />
              </span>
              <small>MY WELLNESS</small>
            </div>
            <h3>
              每一份健康
              <br />
              都值得认真守护。
            </h3>
            <p>
              从检前准备，到检后关怀
              <br />
              我们始终与您同行
            </p>
            <div className="pt-wellness-stats">
              <button onClick={() => go("orders")}>
                <b>{orders.filter((a) => a.status !== "cancelled").length}</b>
                <small>我的预约</small>
              </button>
              <button onClick={() => go("reports")}>
                <b>{reports.length}</b>
                <small>健康报告</small>
              </button>
            </div>
            <button className="pt-wellness-link" onClick={() => go("profile")}>
              管理我的健康档案 <ArrowRight size={17} />
            </button>
          </section>
          <section className="pt-card pt-quick-links">
            <h3>健康服务</h3>
            {(
              [
                {
                  title: "个性化健康问卷",
                  icon: ClipboardList,
                  target: "questionnaire",
                },
                { title: "健康随访计划", icon: Heart, target: "followup" },
                {
                  title: "专业咨询服务",
                  icon: Stethoscope,
                  target: "services",
                },
                { title: "健康生活好物", icon: ShoppingBag, target: "shop" },
                {
                  title: "留言与满意度",
                  icon: MessageCircle,
                  target: "messages",
                },
              ] as const
            ).map((s) => (
              <button key={s.title} onClick={() => go(s.target)}>
                <s.icon size={18} />
                {s.title}
                <ChevronRight size={15} />
              </button>
            ))}
          </section>
          <section className="pt-help-card">
            <MessageCircle size={24} />
            <h3>有问题，我们在这里</h3>
            <p>
              体检服务时间
              <br />
              {hospital.hours}
            </p>
            <button onClick={() => go("messages")}>
              联系健康管家 <ArrowRight size={15} />
            </button>
          </section>
          <p className="pt-disclaimer">
            <ShieldCheck size={14} /> 合成数据 · 本地模拟
            <br />
            不提供医疗诊断或真实支付
          </p>
        </aside>
      </div>
      <nav className="pt-bottom-nav">
        {(
          [
            { title: "首页", icon: Home, target: "home" },
            { title: "预约", icon: CalendarDays, target: "booking" },
            { title: "导检", icon: MapPin, target: "guide" },
            { title: "报告", icon: FileText, target: "reports" },
            { title: "我的", icon: UserRound, target: "profile" },
          ] as const
        ).map((n) => (
          <button
            className={view === n.target ? "active" : ""}
            key={n.title}
            onClick={() => go(n.target)}
          >
            <n.icon size={21} />
            <span>{n.title}</span>
          </button>
        ))}
      </nav>
      {toast && (
        <div className="pt-toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
      {payId && (
        <div className="pt-modal-backdrop">
          <section
            className="pt-modal"
            role="dialog"
            aria-modal="true"
            aria-label="模拟支付"
          >
            <button
              className="pt-modal-close"
              onClick={() => setPayId("")}
              aria-label="关闭支付"
            >
              <X size={20} />
            </button>
            <Wallet size={37} />
            <h2>确认模拟支付</h2>
            <p>不会打开支付渠道或扣款。</p>
            <strong className="pt-pay-total">
              ¥{payOrder?.selfPay ?? payOrder?.amount}
            </strong>
            {payOrder &&
              (payOrder.groupOrderId || payOrder.groupBudget > 0) && (
                <p>
                  订单总额 ¥{payOrder.amount} · 单位承担 ¥
                  {payOrder.amount - payOrder.selfPay} · 本次自费 ¥
                  {payOrder.selfPay}
                </p>
              )}
            <label>
              演示支付方式
              <select
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
              >
                <option>微信支付</option>
                <option>支付宝</option>
                <option>单位结算</option>
              </select>
            </label>
            <button
              className="pt-primary"
              onClick={() => {
                act({
                  type: "PAYMENT",
                  payload: {
                    id: payId,
                    method: payOrder?.groupBudget
                      ? `单位结算 + ${payMethod}（模拟）`
                      : `${payMethod}（模拟）`,
                  },
                });
                act({
                  type: "ADD_AUDIT",
                  payload: {
                    message: `H5 ${payMethod}模拟支付：${payId}，自费 ¥${payOrder?.selfPay ?? payOrder?.amount}，单位 ¥${payOrder?.groupBudget ? payOrder.amount - payOrder.selfPay : 0}`,
                  },
                });
                setPayId("");
                tell("模拟支付成功，可到院签到");
              }}
            >
              确认模拟付款
            </button>
          </section>
        </div>
      )}
      {cancelId && (
        <div className="pt-modal-backdrop">
          <section
            className="pt-modal"
            role="dialog"
            aria-modal="true"
            aria-label="取消预约"
          >
            <h2>确认取消这次预约？</h2>
            <p>
              {state.config.cancellationPolicy === "deleteBusiness"
                ? "取消后从业务列表移除此订单及限定关联记录，保留可恢复归档与审计；不影响其他体检人。"
                : "取消后保留演示订单与操作记录。"}
              已付订单仅记录模拟取消，不发生真实退款。
            </p>
            <div className="pt-modal-actions">
              <button className="pt-secondary" onClick={() => setCancelId("")}>
                保留预约
              </button>
              <button
                className="pt-primary"
                onClick={() => {
                  const order = state.appointments.find(
                    (row) =>
                      row.id === cancelId && row.patientId === patient.id,
                  );
                  if (
                    !order ||
                    order.locked ||
                    !["booked", "paid"].includes(order.status)
                  )
                    return tell("当前订单不可取消，请刷新订单状态");
                  act({
                    type: "CANCEL_PATIENT_APPOINTMENT",
                    payload: { id: cancelId, patientId: patient.id },
                  });
                  setCancelId("");
                  tell("预约已取消，操作记录已保留");
                }}
              >
                确认取消
              </button>
            </div>
          </section>
        </div>
      )}
      {editId && (
        <div className="pt-modal-backdrop">
          <section
            className="pt-modal"
            role="dialog"
            aria-modal="true"
            aria-label="预约改期"
          >
            <h2>调整预约时间</h2>
            <label>
              新预约日期
              <input
                type="date"
                min={new Date().toISOString().slice(0, 10)}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label>
              新预约时段
              <select value={time} onChange={(e) => setTime(e.target.value)}>
                {getBookingSlots(state).map((slot) => (
                  <option key={slot.time}>{slot.time}</option>
                ))}
              </select>
            </label>
            <div className="pt-modal-actions">
              <button className="pt-secondary" onClick={() => setEditId("")}>
                暂不修改
              </button>
              <button
                className="pt-primary"
                onClick={() => {
                  const nextAvailability = getBookingAvailability(
                    state,
                    date,
                    editId,
                    {
                      patientId: patient.id,
                      kind:
                        state.appointments.find((a) => a.id === editId)
                          ?.bookingKind ||
                        (state.appointments.find((a) => a.id === editId)
                          ?.groupBudget > 0
                          ? "group"
                          : "individual"),
                      company:
                        state.appointments.find((a) => a.id === editId)
                          ?.groupCompany || patient.company,
                      time,
                    },
                  );
                  if (!nextAvailability.allowed)
                    return tell(nextAvailability.error);
                  act({
                    type: "UPDATE_APPOINTMENT",
                    payload: { id: editId, date, time },
                  });
                  setEditId("");
                  tell("预约时间已更新");
                }}
              >
                确认改期
              </button>
            </div>
          </section>
        </div>
      )}
      {service && (
        <div className="pt-modal-backdrop">
          <section
            className="pt-modal"
            role="dialog"
            aria-modal="true"
            aria-label="预约健康服务"
          >
            <h2>预约{service}</h2>
            <p>为 {patient.name} 创建本地服务申请。</p>
            <label>
              期望日期
              <input
                type="date"
                min={new Date().toISOString().slice(0, 10)}
                value={serviceDate}
                onChange={(e) => setServiceDate(e.target.value)}
              />
            </label>
            <div className="pt-modal-actions">
              <button className="pt-secondary" onClick={() => setService("")}>
                取消
              </button>
              <button
                className="pt-primary"
                onClick={() => {
                  if (
                    !serviceDate ||
                    serviceDate < new Date().toISOString().slice(0, 10)
                  )
                    return tell("请选择有效日期");
                  act({
                    type: "ADD_TASK",
                    payload: {
                      title: service,
                      patientId: patient.id,
                      date: serviceDate,
                      status: "待处理",
                    },
                  });
                  setService("");
                  tell("服务申请已记录，等待工作人员处理");
                }}
              >
                提交申请
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

/** Shared calendar: read-only in H5; editable only when mounted by the demo control center. */
export function UnitBookingCalendar({
  editable = false,
  company,
  onSelectDate,
}: {
  editable?: boolean;
  company?: string;
  onSelectDate?: (date: string) => void;
}) {
  const { state, act } = useDemo();
  const schedules = getGroupBookingSchedules(state);
  const [selectedCompany, setSelectedCompany] = useState(
    company || schedules[0]?.company || "",
  );
  const selected =
    schedules.find((row) => row.company === selectedCompany) || schedules[0];
  const [draft, setDraft] = useState(selected);
  const [month, setMonth] = useState(bookingDateOffset(state).slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(bookingDateOffset(state));
  const [clockDraft, setClockDraft] = useState(
    String(state.config.bookingClock || "").slice(0, 16),
  );
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (company) setSelectedCompany(company);
  }, [company]);
  useEffect(() => {
    setDraft(selected);
  }, [selectedCompany]);
  if (!selected || !draft)
    return <p className="pt-note">暂无团检单位排期，请先建立演示单位。</p>;
  const days = new Date(
    Number(month.slice(0, 4)),
    Number(month.slice(5)),
    0,
  ).getDate();
  const offset = new Date(`${month}-01T12:00:00Z`).getUTCDay();
  const dayOrders = state.appointments.filter(
    (a) =>
      a.date === selectedDate &&
      a.status !== "cancelled" &&
      groupAppointmentCompany(state, a) === selected.company,
  );
  const moveMonth = (delta: number) => {
    const d = new Date(`${month}-01T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + delta);
    setMonth(d.toISOString().slice(0, 7));
  };
  const save = () => {
    if (
      draft.scheduled &&
      (!draft.startDate || !draft.endDate || draft.startDate > draft.endDate)
    )
      return setNotice("请填写正确的单位排期起止日期");
    if (
      !Number.isInteger(Number(draft.dailyCapacity)) ||
      Number(draft.dailyCapacity) < 0 ||
      Number(draft.reservedCapacity) < 0 ||
      Number(draft.reservedCapacity) > Number(draft.dailyCapacity)
    )
      return setNotice("单位容量须为非负整数，保留号源不能超过单位容量");
    act({
      type: "UPSERT_RECORD",
      payload: {
        collection: "groupBookingSchedules",
        record: {
          ...draft,
          dailyCapacity: Number(draft.dailyCapacity),
          reservedCapacity: Number(draft.reservedCapacity),
        },
      },
    });
    setNotice("单位排期已保存，患者端和自助机预约规则已同步");
  };
  return (
    <section
      className="pt-card"
      style={{ marginTop: 20 }}
      aria-label="单位预约日历"
    >
      <div className="pt-section-title compact">
        <h3>单位预约日历与排期</h3>
        <span className="pt-mini-tag">真实日期 · 本地容量联动</span>
      </div>
      <label>
        查看单位
        <select
          value={selected.company}
          disabled={!!company && !editable}
          onChange={(e) => setSelectedCompany(e.target.value)}
        >
          {schedules.map((row) => (
            <option key={row.id} value={row.company}>
              {row.company}
            </option>
          ))}
        </select>
      </label>
      <p className="pt-note">
        {selected.company} ·{" "}
        {selected.enabled === false ? "预约已关闭" : "预约已开启"} ·{" "}
        {selected.scheduled
          ? `${selected.startDate} 至 ${selected.endDate}`
          : "不设置单位日期限制"}{" "}
        · 每日 {selected.dailyCapacity} 人 / 保留{" "}
        {selected.reservedCapacity || 0} 个号源
      </p>
      <div className="pt-section-title compact">
        <button
          className="pt-secondary"
          aria-label="上个月"
          onClick={() => moveMonth(-1)}
        >
          ‹ 上个月
        </button>
        <h3>{month}</h3>
        <button
          className="pt-secondary"
          aria-label="下个月"
          onClick={() => moveMonth(1)}
        >
          下个月 ›
        </button>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7,minmax(0,1fr))",
          gap: 5,
        }}
      >
        {["日", "一", "二", "三", "四", "五", "六"].map((day) => (
          <small style={{ textAlign: "center", padding: 8 }} key={day}>
            {day}
          </small>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <span key={`blank${i}`} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const value = `${month}-${String(i + 1).padStart(2, "0")}`;
          const rule = getBookingAvailability(state, value, undefined, {
            company: selected.company,
            kind: "group",
            checkQuestionnaire: false,
          });
          return (
            <button
              key={value}
              aria-label={`查看 ${value} ${selected.company} 排期`}
              className="pt-secondary"
              style={{
                padding: "9px 2px",
                minHeight: 62,
                flexDirection: "column",
                gap: 3,
                fontSize: 11,
                background: value === selectedDate ? "#e4f1e8" : undefined,
                opacity: rule.allowed ? 1 : 0.6,
              }}
              onClick={() => {
                setSelectedDate(value);
                if (rule.allowed) onSelectDate?.(value);
              }}
            >
              <b>{i + 1}</b>
              <small>
                {rule.allowed
                  ? `余 ${Math.min(rule.remaining, rule.groupRemaining)}`
                  : rule.error.includes("过去")
                    ? "已过期"
                    : rule.error.includes("周末")
                      ? "休息"
                      : "不可约"}
              </small>
            </button>
          );
        })}
      </div>
      <h3 className="pt-subheading">
        {selectedDate} · {selected.company} · {dayOrders.length} 人
      </h3>
      <p className="pt-muted">
        {getBookingAvailability(state, selectedDate, undefined, {
          company: selected.company,
          kind: "group",
          checkQuestionnaire: false,
        }).error || "当日开放预约，点击可用日期可带入预约表单。"}
      </p>
      {dayOrders.length ? (
        dayOrders.map((a) => (
          <div className="pt-result-row" key={a.id}>
            <span>
              {state.patients.find((p) => p.id === a.patientId)?.name} ·{" "}
              {a.time}
            </span>
            <span>
              {a.id} · {statuses[a.status]}
            </span>
          </div>
        ))
      ) : (
        <p className="pt-note">该单位当日暂无有效预约。</p>
      )}
      {editable && (
        <>
          <h3 className="pt-subheading">编辑选中单位的预约规则</h3>
          <label className="pt-check-row">
            <input
              type="checkbox"
              checked={draft.allowRelatives !== false}
              onChange={(e) =>
                setDraft({ ...draft, allowRelatives: e.target.checked })
              }
            />
            允许亲属预约
          </label>
          <label className="pt-check-row">
            <input
              type="checkbox"
              checked={draft.enabled !== false}
              onChange={(e) =>
                setDraft({ ...draft, enabled: e.target.checked })
              }
            />
            开启单位预约
          </label>
          <label className="pt-check-row">
            <input
              type="checkbox"
              checked={draft.scheduled}
              onChange={(e) =>
                setDraft({ ...draft, scheduled: e.target.checked })
              }
            />
            为单位设置日期排期
          </label>
          <div className="pt-form-grid">
            <label>
              单位开始日期
              <input
                type="date"
                disabled={!draft.scheduled}
                value={draft.startDate}
                onChange={(e) =>
                  setDraft({ ...draft, startDate: e.target.value })
                }
              />
            </label>
            <label>
              单位结束日期
              <input
                type="date"
                disabled={!draft.scheduled}
                value={draft.endDate}
                onChange={(e) =>
                  setDraft({ ...draft, endDate: e.target.value })
                }
              />
            </label>
            <label>
              单位每日容量
              <input
                type="number"
                min={0}
                value={draft.dailyCapacity}
                onChange={(e) =>
                  setDraft({ ...draft, dailyCapacity: Number(e.target.value) })
                }
              />
            </label>
            <label>
              团检保留号源
              <input
                type="number"
                min={0}
                value={draft.reservedCapacity}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    reservedCapacity: Number(e.target.value),
                  })
                }
              />
            </label>
          </div>
          <label style={{ margin: "17px 0" }}>
            单位可预约时段（分号分隔，留空不限）
            <input
              value={draft.allowedTimes}
              placeholder="08:00-08:30;08:30-09:00"
              onChange={(e) =>
                setDraft({ ...draft, allowedTimes: e.target.value })
              }
            />
          </label>
          <button className="pt-primary" onClick={save}>
            保存单位排期
          </button>
          <h3 className="pt-subheading">预约规则模拟时钟</h3>
          <label>
            模拟业务时间（UTC）
            <input
              type="datetime-local"
              value={clockDraft}
              onChange={(e) => setClockDraft(e.target.value)}
            />
          </label>
          <div className="pt-modal-actions">
            <button
              className="pt-secondary"
              onClick={() => {
                act({ type: "UPDATE_CONFIG", payload: { bookingClock: "" } });
                setClockDraft("");
                setNotice("已恢复真实时钟");
              }}
            >
              使用真实时钟
            </button>
            <button
              className="pt-primary"
              disabled={!clockDraft}
              onClick={() => {
                if (!Number.isFinite(new Date(`${clockDraft}Z`).getTime()))
                  return setNotice("模拟时间无效");
                act({
                  type: "UPDATE_CONFIG",
                  payload: { bookingClock: `${clockDraft}:00Z` },
                });
                setMonth(clockDraft.slice(0, 7));
                setSelectedDate(clockDraft.slice(0, 10));
                setNotice("模拟时钟已生效，会实际改变日期与放号校验");
              }}
            >
              应用模拟时钟
            </button>
          </div>
          <p className="pt-note">
            当前业务时间：{getBookingNow(state).toISOString()}。次日号源按
            releaseHour 开放；团检剩余保留号源在预约当天 groupReleaseHour
            后释放，所有判断均使用此 UTC 时钟。
          </p>
          <p className="pt-muted">
            单位入口：{window.location.origin}
            {window.location.pathname}#/patient?group=
            {encodeURIComponent(selected.id)}
          </p>
        </>
      )}
      {notice && (
        <p role="status" className="pt-note">
          {notice}
        </p>
      )}
    </section>
  );
}

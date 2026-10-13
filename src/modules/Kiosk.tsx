import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CreditCard,
  FileCheck2,
  Fingerprint,
  HeartPulse,
  Home,
  Layers,
  MapPin,
  Printer,
  QrCode,
  RefreshCw,
  ScanLine,
  Settings2,
  ShieldCheck,
  Volume2,
  Wallet,
  X,
} from "lucide-react";
import { useDemo } from "../store";
import "./devices.css";
import {
  getBookingAvailability,
  getOnlineExtraCatalog,
  getGroupBookingSchedules,
  getBookingSlots,
  getBookingDates,
  bookingDateOffset,
  getBookingNow,
  hasCompletedQuestionnaire,
  QUESTIONNAIRE_OPTIONS,
  recommendedBookingItems,
} from "../bookingRules";
import {
  getOrderingIssues,
  packageIsApplicable,
  getOrderRules,
} from "../orderingRules";

type Screen =
  | "home"
  | "identify"
  | "appointment"
  | "payment"
  | "checkin"
  | "guide"
  | "report"
  | "printing"
  | "complete";
type Fault = "normal" | "offline" | "paper" | "jam";
export default function Kiosk() {
  const { state, act } = useDemo();
  const [mode, setMode] = useState(
    new URLSearchParams(
      window.location.hash.split("?")[1] || window.location.search,
    ).get("mode") === "report"
      ? "report"
      : "self",
  );
  const [screen, setScreen] = useState<Screen>("home");
  const [target, setTarget] = useState<Screen>("checkin");
  const [patientId, setPatientId] = useState(state.patients[0]?.id || "");
  const [identified, setIdentified] = useState(false);
  const [identityMethod, setIdentityMethod] = useState("电子健康码");
  const [orderId, setOrderId] = useState("");
  const [packId, setPackId] = useState(state.packages[0]?.id || "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("08:00-08:30");
  useEffect(() => {
    const slots = getBookingSlots(state);
    if (!slots.some((slot) => slot.time === time))
      setTime(slots[0]?.time || "");
  }, [state.config.timeSlots]);
  const [campus, setCampus] = useState(state.config.campus || "中心院区");
  const [countdown, setCountdown] = useState(120);
  const [fault, setFault] = useState<Fault>("normal");
  const [showTools, setShowTools] = useState(false);
  const [notice, setNotice] = useState("");
  const [printKind, setPrintKind] = useState<"guide" | "report">("guide");
  const [printStep, setPrintStep] = useState(0);
  const [binding, setBinding] = useState(true);
  const [copies, setCopies] = useState(1);
  const [voice, setVoice] = useState(true);
  const printId = useRef("");
  const bookingSubmitted = useRef(false);
  const [excludedItems, setExcludedItems] = useState<string[]>([]);
  const [addedItems, setAddedItems] = useState<string[]>([]);
  const [bookingKind, setBookingKind] = useState<"individual" | "group">(
    "individual",
  );
  const [groupCompany, setGroupCompany] = useState(
    state.patients[0]?.company || "",
  );
  const [questionAnswers, setQuestionAnswers] = useState<string[]>([]);
  const [questionContext, setQuestionContext] = useState({
    history: "",
    medication: "",
    family: "",
  });
  const patient = state.patients.find((p) => p.id === patientId);
  const orders = state.appointments.filter(
    (a) => a.patientId === patientId && a.status !== "cancelled",
  );
  const eligible =
    screen === "report" || target === "report"
      ? orders.filter((a) => ["approved", "printed"].includes(a.status))
      : orders;
  const order =
    orders.find((a) => a.id === orderId) ||
    (screen === "report"
      ? eligible[0]
      : orders.find((a) => !["approved", "printed"].includes(a.status))) ||
    orders[0];
  const applicablePackages = state.packages.filter(
    (p) =>
      patient &&
      packageIsApplicable(state, patient, p.id) &&
      (state.records.packageRules || []).find((r) => r.packageId === p.id)
        ?.onlineEnabled !== false &&
      p.onlineEnabled !== false,
  );
  const pack = applicablePackages.find((p) => p.id === packId);
  const requiredItems = getOrderRules(state)
    .filter((r) => r.required && r.enabled !== false && r.ruleEnabled !== false)
    .map((r) => r.item);
  const allowAdd = state.config.allowAdd !== false;
  const allowRemove = state.config.allowRemove !== false;
  const displayPrices =
    state.config.showPrices !== false && state.config.priceMode !== "不显示";
  const baseItems = (pack?.items || []).filter(
    (item) => !excludedItems.includes(item),
  );
  const kioskExtras = getOnlineExtraCatalog(state, patientId).filter(
    (extra) => !pack?.items.includes(extra.name),
  );
  const activeExtras = allowAdd
    ? addedItems.filter((name) => kioskExtras.some((row) => row.name === name))
    : [];
  const bookingTotal =
    (pack?.price || 0) +
    kioskExtras
      .filter((item) => activeExtras.includes(item.name))
      .reduce((sum, item) => sum + item.price, 0);
  const availability = getBookingAvailability(state, date, undefined, {
    patientId,
    kind: bookingKind,
    company: groupCompany,
    time,
  });
  useEffect(
    () =>
      setExcludedItems(
        state.config.defaultSelected === false
          ? (pack?.items || []).filter((item) => !requiredItems.includes(item))
          : [],
      ),
    [packId, state.config.defaultSelected],
  );
  useEffect(() => {
    setQuestionAnswers([]);
    setQuestionContext({ history: "", medication: "", family: "" });
  }, [patientId]);
  const reset = (text = "") => {
    bookingSubmitted.current = false;
    setBookingKind("individual");
    setIdentified(false);
    setOrderId("");
    setScreen("home");
    setCountdown(120);
    setNotice(text);
    setPrintStep(0);
  };
  useEffect(() => {
    const syncMode = () => {
      const nextMode =
        new URLSearchParams(
          window.location.hash.split("?")[1] || window.location.search,
        ).get("mode") === "report"
          ? "report"
          : "self";
      if (nextMode !== mode) {
        setMode(nextMode);
        reset();
      }
    };
    window.addEventListener("hashchange", syncMode);
    return () => window.removeEventListener("hashchange", syncMode);
  }, [mode]);
  useEffect(() => {
    if (!identified || screen === "printing") return;
    const timer = window.setInterval(() => setCountdown((n) => n - 1), 1000);
    return () => window.clearInterval(timer);
  }, [identified, screen]);
  useEffect(() => {
    if (identified && countdown <= 0)
      reset("本次会话已超时，演示身份已清除。请重新识别。");
  }, [countdown, identified]);
  useEffect(() => {
    if (screen !== "printing") return;
    const timer = window.setTimeout(() => {
      if (printStep < (printKind === "report" && binding ? 2 : 1))
        setPrintStep(printStep + 1);
      else {
        if (printKind === "report") {
          act({ type: "PRINT", payload: { id: printId.current } });
          act({
            type: "ADD_AUDIT",
            payload: {
              message: `报告自助终端完成模拟打印 ${printId.current}，${copies} 份，${binding ? "已模拟装订" : "不装订"}`,
            },
          });
        } else
          act({
            type: "ADD_AUDIT",
            payload: { message: `自助机模拟打印导检单 ${printId.current}` },
          });
        setScreen("complete");
      }
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [screen, printStep, printKind, binding, act]);
  const enter = (next: Screen) => {
    if (next === "appointment") bookingSubmitted.current = false;
    setNotice("");
    setTarget(next);
    if (identified) setScreen(next);
    else setScreen("identify");
    setCountdown(120);
  };
  const verify = () => {
    if (fault === "offline")
      return setNotice(
        "身份读取模拟失败：设备离线。请在演示控制中恢复设备后重试。",
      );
    if (!patient) return setNotice("请选择一个演示身份。");
    const selectedOrder =
      orders.find((a) => !["approved", "printed"].includes(a.status)) ||
      orders[0];
    setCampus(selectedOrder?.campus || state.config.campus || "中心院区");
    setGroupCompany(patient.company);
    setIdentified(true);
    setCountdown(120);
    setOrderId("");
    setNotice("");
    setScreen(target);
    act({
      type: "ADD_AUDIT",
      payload: {
        message: `自助终端模拟${identityMethod}识别 ${patient.name}；未调用真实读卡或人脸识别`,
      },
    });
  };
  const startPrint = (kind: "guide" | "report") => {
    if (!order) return setNotice("当前没有可打印的订单。");
    if (fault !== "normal")
      return setNotice(
        fault === "paper"
          ? "纸张余量不足，请补纸后重试。打印任务尚未创建。"
          : fault === "jam"
            ? "打印机卡纸，请排除故障后重试。打印任务尚未创建。"
            : "设备离线，请恢复后重试。",
      );
    if (kind === "report" && !["approved", "printed"].includes(order.status))
      return setNotice("报告尚未完成审核，暂不支持打印。");
    if (kind === "guide" && order.status === "paid" && order.locked)
      return setNotice(
        "订单已锁定，不能签到或打印导检单，请联系工作人员解锁。",
      );
    if (kind === "guide" && ["booked", "cancelled"].includes(order.status))
      return setNotice("请先完成缴费与到检签到。");
    printId.current = order.id;
    setPrintKind(kind);
    setPrintStep(0);
    setScreen("printing");
    setNotice("");
  };
  const createBooking = () => {
    if (bookingSubmitted.current) return;
    if (!availability.allowed) return setNotice(availability.error);
    if (!pack) return setNotice("请选择适合该体检人的线上套餐");
    const issues = getOrderingIssues(
      state,
      patientId,
      [...baseItems, ...activeExtras],
      [packId],
    );
    if (issues.length) return setNotice(issues.join("；"));
    if (!baseItems.length && !activeExtras.length)
      return setNotice("请至少保留一个检查项目");
    bookingSubmitted.current = true;
    act({
      type: "CREATE_APPOINTMENT",
      payload: {
        patientId,
        packageId: packId,
        date,
        time,
        campus,
        amount: bookingTotal,
        items: [...baseItems, ...activeExtras],
        source: bookingKind === "group" ? "自助机团检预约" : "自助机模拟预约",
        bookingKind,
        groupCompany: bookingKind === "group" ? groupCompany : "",
        questionnaireCompleted: hasCompletedQuestionnaire(state, patientId),
        questionnaireAnswers:
          state.records.bookingQuestionnaires?.find(
            (row) => row.patientId === patientId,
          )?.answers || [],
      },
    });
    setScreen("payment");
    setTarget("payment");
    setOrderId("");
    setNotice("预约已创建，请选择新订单完成模拟缴费。");
  };
  const actionCards =
    mode === "report"
      ? ([
          {
            title: "打印体检报告",
            sub: "已审核报告 · 自动装订",
            icon: Printer,
            target: "report",
            color: "teal",
          },
          {
            title: "查看报告状态",
            sub: "查询进度 · 了解领取时间",
            icon: FileCheck2,
            target: "report",
            color: "blue",
          },
        ] as const)
      : ([
          {
            title: "自助签到",
            sub: "已预约客户 · 快速办理到检",
            icon: ScanLine,
            target: "checkin",
            color: "teal",
          },
          {
            title: "体检预约",
            sub: "选择套餐 · 开启健康计划",
            icon: CalendarDays,
            target: "appointment",
            color: "blue",
          },
          {
            title: "自助缴费",
            sub: "查询待付订单 · 模拟支付",
            icon: Wallet,
            target: "payment",
            color: "orange",
          },
          {
            title: "打印导检单",
            sub: "检查项目 · 院内路线",
            icon: Printer,
            target: "guide",
            color: "purple",
          },
        ] as const);
  const title: Record<Screen, string> = {
    home: "让健康服务，更近一步",
    identify: "请识别您的身份",
    appointment: "选择体检计划",
    payment: "确认您的待付订单",
    checkin: "欢迎来到体检中心",
    guide: "您的导检单已准备好",
    report: "自助打印体检报告",
    printing: "正在为您准备，请稍候",
    complete: printKind === "report" ? "报告打印完成" : "导检单打印完成",
  };
  return (
    <div
      className="ks-root"
      onPointerDown={() => {
        if (identified) setCountdown(120);
      }}
      onKeyDown={() => {
        if (identified) setCountdown(120);
      }}
    >
      <header className="ks-header">
        <div className="ks-brand">
          <span>
            <HeartPulse size={32} />
          </span>
          <div>
            <b>红创健康体检中心</b>
            <small>HONGCHUANG HEALTH EXAMINATION CENTER</small>
          </div>
        </div>
        <div className="ks-header-right">
          <span>
            <MapPin size={17} />
            {campus} · {mode === "report" ? "报告终端 R01" : "自助终端 A01"}
          </span>
          <b>
            <i className={fault === "normal" ? "online" : "warning"} />
            {fault === "normal" ? "设备模拟就绪" : "设备模拟异常"}
          </b>
        </div>
      </header>
      <div className="ks-mode-tabs">
        <button
          className={mode === "self" ? "active" : ""}
          onClick={() => {
            setMode("self");
            reset();
          }}
        >
          体检自助服务
        </button>
        <button
          className={mode === "report" ? "active" : ""}
          onClick={() => {
            setMode("report");
            reset();
          }}
        >
          报告打印装订
        </button>
        <span>SIMULATED · 全流程硬件与支付演示</span>
      </div>
      <main className="ks-main">
        <div className="ks-title-row">
          <div>
            <p>WELCOME TO YOUR HEALTH JOURNEY</p>
            <h1>{title[screen]}</h1>
            <span>
              {screen === "home"
                ? "请选择您需要办理的业务，我们将一步步引导您完成。"
                : identified
                  ? `${patient?.name} · 演示身份已识别 · 操作完成后请及时退出`
                  : "仅使用合成身份进行流程演示，不读取真实证件或生物特征。"}
            </span>
          </div>
          {screen !== "home" && (
            <button className="ks-home-button" onClick={() => reset()}>
              <Home size={20} /> 返回首页
            </button>
          )}
        </div>
        {notice && (
          <div className="ks-notice" role="status">
            <AlertCircle size={22} />
            <span>{notice}</span>
            <button onClick={() => setNotice("")} aria-label="关闭提示">
              <X size={20} />
            </button>
          </div>
        )}
        {screen === "home" && (
          <>
            <div
              className={`ks-service-grid ${mode === "report" ? "report" : ""}`}
            >
              {actionCards.map((card) => (
                <button
                  key={card.title}
                  className={`ks-service-card ${card.color}`}
                  onClick={() => enter(card.target)}
                >
                  <span className="ks-service-icon">
                    <card.icon size={40} strokeWidth={1.5} />
                  </span>
                  <h2>{card.title}</h2>
                  <p>{card.sub}</p>
                  <span className="ks-card-arrow">
                    <ArrowRight size={23} />
                  </span>
                </button>
              ))}
            </div>
            <section className="ks-how">
              <div>
                <span>01</span>
                <div>
                  <b>识别身份</b>
                  <p>选择合成电子健康码或演示卡</p>
                </div>
              </div>
              <ChevronRight size={24} />
              <div>
                <span>02</span>
                <div>
                  <b>确认信息</b>
                  <p>核对您的预约与检查项目</p>
                </div>
              </div>
              <ChevronRight size={24} />
              <div>
                <span>03</span>
                <div>
                  <b>完成办理</b>
                  <p>
                    {mode === "report"
                      ? "领取模拟打印装订结果"
                      : "签到、缴费或领取导检单"}
                  </p>
                </div>
              </div>
            </section>
            <div className="ks-welcome-note">
              <ShieldCheck size={24} />
              <div>
                <b>便捷服务，安心相伴</b>
                <p>请勿在演示环境输入真实身份证号码、健康信息或支付信息。</p>
              </div>
              <span>服务时间 07:30—17:00</span>
            </div>
          </>
        )}
        {screen === "identify" && (
          <section className="ks-panel ks-identify">
            <div className="ks-identity-art">
              <div className="ks-scan-box">
                <ScanLine size={100} strokeWidth={1} />
              </div>
              <h2>请选择一种识别方式</h2>
              <p>
                真实读卡器、扫码器与摄像头未连接
                <br />
                以下操作仅在本地模拟
              </p>
              <div className="ks-methods">
                {[
                  { name: "电子健康码", icon: QrCode },
                  { name: "身份证读卡", icon: CreditCard },
                  { name: "人脸识别", icon: Fingerprint },
                ].map((item) => (
                  <button
                    key={item.name}
                    className={identityMethod === item.name ? "active" : ""}
                    onClick={() => setIdentityMethod(item.name)}
                  >
                    <item.icon size={26} />
                    {item.name}
                    <small>模拟</small>
                  </button>
                ))}
              </div>
            </div>
            <div className="ks-identity-form">
              <span className="ks-mini-label">DEMO IDENTITY</span>
              <h2>选择演示体检人</h2>
              <label>
                合成身份
                <select
                  value={patientId}
                  onChange={(e) => setPatientId(e.target.value)}
                >
                  {state.patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.sex} · {p.age} 岁 ·{" "}
                      {p.company || "个人客户"}
                    </option>
                  ))}
                </select>
              </label>
              <div className="ks-identity-preview">
                <span>{patient?.name.slice(-1)}</span>
                <div>
                  <b>{patient?.name}</b>
                  <p>证件编号：DEMO-{patient?.id}</p>
                  <small>仅用于本地演示的合成身份</small>
                </div>
                <ShieldCheck size={28} />
              </div>
              <button className="ks-primary" onClick={verify}>
                模拟识别并继续 <ArrowRight size={22} />
              </button>
              <p className="ks-safe-note">
                <ShieldCheck size={16} /> 不采集或传输真实身份、生物特征信息
              </p>
            </div>
          </section>
        )}
        {identified && screen === "appointment" && (
          <section className="ks-panel">
            <div className="ks-panel-heading">
              <h2>选择体检套餐</h2>
              <span>体检人：{patient?.name}</span>
            </div>
            <div className="ks-book-fields">
              <label>
                预约类型
                <select
                  value={bookingKind}
                  onChange={(e) =>
                    setBookingKind(e.target.value as "individual" | "group")
                  }
                >
                  <option value="individual">个人预约</option>
                  <option value="group">单位预约</option>
                </select>
              </label>
              {bookingKind === "group" && (
                <label>
                  团检单位
                  <select
                    value={groupCompany}
                    onChange={(e) => setGroupCompany(e.target.value)}
                  >
                    {getGroupBookingSchedules(state).map((row) => (
                      <option value={row.company} key={row.id}>
                        {row.company}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <div className="ks-package-grid">
              {applicablePackages.map((p) => (
                <button
                  key={p.id}
                  className={p.id === packId ? "selected" : ""}
                  onClick={() => setPackId(p.id)}
                >
                  <span className="ks-package-check">
                    {p.id === packId ? (
                      <CheckCircle2 size={23} />
                    ) : (
                      <HeartPulse size={23} />
                    )}
                  </span>
                  <h3>{p.name}</h3>
                  <p>
                    {p.items.length} 项检查 · {p.tag}
                  </p>
                  <strong>
                    {displayPrices ? `¥${p.price}` : "价格待咨询"}
                  </strong>
                </button>
              ))}
            </div>
            <h3 className="ks-project-title">套餐检查项目</h3>
            <p className="ks-rule-note">
              {allowRemove
                ? "可取消项目，套餐价保持不变（演示）。"
                : "当前配置不允许取消套餐项目。"}
            </p>
            <div className="ks-project-select">
              {pack?.items.map((item) => (
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
                      setExcludedItems(
                        excludedItems.includes(item)
                          ? excludedItems.filter((x) => x !== item)
                          : [...excludedItems, item],
                      );
                    }}
                  />
                  {item}
                </label>
              ))}
            </div>
            <h3 className="ks-project-title">增加检查项目</h3>
            <div className="ks-project-select">
              {kioskExtras.map((item) => (
                <label key={item.name}>
                  <input
                    type="checkbox"
                    aria-label={`增加项目：${item.name}`}
                    checked={activeExtras.includes(item.name)}
                    disabled={!allowAdd}
                    onChange={() =>
                      setAddedItems(
                        addedItems.includes(item.name)
                          ? addedItems.filter((x) => x !== item.name)
                          : [...addedItems, item.name],
                      )
                    }
                  />
                  {item.name}
                  {displayPrices && <small>+ ¥{item.price}</small>}
                </label>
              ))}
            </div>
            {!allowAdd && (
              <p className="ks-rule-note">当前配置不允许增加套餐外项目。</p>
            )}
            {state.config.questionnaireEnabled !== false && (
              <section
                className="ks-identity-preview"
                style={{ display: "block" }}
              >
                <h3>
                  检前问卷
                  {hasCompletedQuestionnaire(state, patientId)
                    ? " · 已完成"
                    : ""}
                </h3>
                <p className="ks-rule-note">
                  {state.config.questionnaireSkippable === false
                    ? "预约前必须完成，不允许跳过。"
                    : "可选填；不填写也可继续预约。"}
                  全部内容为合成问卷，非医学决策。
                </p>
                <div className="ks-book-fields">
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
                <div className="ks-project-select">
                  {QUESTIONNAIRE_OPTIONS.map((answer) => (
                    <label key={answer}>
                      <input
                        type="checkbox"
                        checked={questionAnswers.includes(answer)}
                        onChange={() =>
                          setQuestionAnswers(
                            questionAnswers.includes(answer)
                              ? questionAnswers.filter((a) => a !== answer)
                              : [...questionAnswers, answer],
                          )
                        }
                      />
                      {answer}
                    </label>
                  ))}
                </div>
                <button
                  className="ks-secondary"
                  disabled={!questionAnswers.length}
                  onClick={() => {
                    const recommended =
                      state.config.recommendationEnabled !== false
                        ? recommendedBookingItems(questionAnswers)
                        : [];
                    act({
                      type: "UPSERT_RECORD",
                      payload: {
                        collection: "bookingQuestionnaires",
                        record: {
                          id: `Q-${patientId}`,
                          patientId,
                          ...questionContext,
                          answers: questionAnswers,
                          status: "completed",
                          completedAt: getBookingNow(state).toISOString(),
                          recommended,
                        },
                      },
                    });
                    if (
                      state.config.recommendationEnabled !== false &&
                      allowAdd
                    )
                      setAddedItems(recommended);
                    setNotice(
                      recommended.length
                        ? `问卷已保存，已添加演示参考项目：${recommended.join("、")}`
                        : "问卷已保存；未增加参考项目。",
                    );
                  }}
                >
                  提交自助机问卷
                </button>
                {state.config.questionnaireSkippable !== false && (
                  <button
                    className="ks-secondary"
                    style={{ marginLeft: 10 }}
                    onClick={() => {
                      act({
                        type: "UPSERT_RECORD",
                        payload: {
                          collection: "bookingQuestionnaires",
                          record: {
                            id: `Q-${patientId}`,
                            patientId,
                            history: "",
                            medication: "",
                            family: "",
                            recommended: [],
                            answers: [],
                            status: "skipped",
                          },
                        },
                      });
                      setNotice("已记录跳过问卷，可继续预约");
                    }}
                  >
                    跳过自助机问卷
                  </button>
                )}
              </section>
            )}
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                margin: "18px 0",
              }}
            >
              {getBookingDates(state).map((day) => (
                <button
                  key={day}
                  className="ks-secondary"
                  style={{ minHeight: 40, fontSize: 11, padding: "8px 12px" }}
                  onClick={() => setDate(day)}
                >
                  {day.slice(5)}
                </button>
              ))}
            </div>
            <div className="ks-book-fields">
              <label>
                预约院区
                <select
                  value={campus}
                  onChange={(e) => setCampus(e.target.value)}
                >
                  <option>中心院区</option>
                  <option>东院区</option>
                </select>
              </label>
              <label>
                预约日期
                <input
                  type="date"
                  min={bookingDateOffset(state)}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <label>
                预约时段
                <select value={time} onChange={(e) => setTime(e.target.value)}>
                  {getBookingSlots(state).map((slot) => (
                    <option key={slot.time}>{slot.time}</option>
                  ))}
                </select>
              </label>
            </div>
            <div
              className={`ks-capacity ${availability.allowed ? "" : "blocked"}`}
              role="note"
            >
              {availability.error ||
                `当日全院剩余 ${availability.remaining} / ${availability.capacity} 个预约名额`}
            </div>
            <div className="ks-action-row">
              <p>
                已选 {[...baseItems, ...activeExtras].length} 项{" "}
                {displayPrices
                  ? ` · 合计 ¥${bookingTotal}`
                  : " · 价格展示已关闭"}
              </p>
              <button
                className="ks-primary"
                disabled={!availability.allowed}
                onClick={createBooking}
              >
                创建模拟预约 <ArrowRight size={21} />
              </button>
            </div>
          </section>
        )}
        {identified &&
          (screen === "payment" ||
            screen === "checkin" ||
            screen === "guide") && (
            <section className="ks-panel">
              <div className="ks-panel-heading">
                <h2>
                  {screen === "payment"
                    ? "选择待付订单"
                    : screen === "checkin"
                      ? "核对预约并到检签到"
                      : "打印电子导检信息"}
                </h2>
                <span>
                  <ShieldCheck size={18} />
                  身份已核验（模拟）
                </span>
              </div>
              {orders.length ? (
                <>
                  <div className="ks-orders">
                    {orders.map((a) => (
                      <button
                        className={a.id === order?.id ? "selected" : ""}
                        key={a.id}
                        onClick={() => {
                          setOrderId(a.id);
                          setCampus(a.campus);
                        }}
                      >
                        <span>
                          {state.packages.find((p) => p.id === a.packageId)
                            ?.name || "个性化体检"}
                        </span>
                        <small>
                          {a.date} · {a.time} · {a.campus}
                        </small>
                        <b>
                          {
                            {
                              booked: "待缴费",
                              paid: "待签到",
                              checked: "已签到",
                              in_exam: "检查中",
                              review: "报告审核中",
                              approved: "报告已审核",
                              printed: "已打印报告",
                              cancelled: "已取消",
                            }[a.status]
                          }
                        </b>
                        {a.id === order?.id && <CheckCircle2 size={23} />}
                      </button>
                    ))}
                  </div>
                  {order && (
                    <div className="ks-order-detail">
                      <div className="ks-detail-info">
                        <span className="ks-mini-label">
                          APPOINTMENT DETAILS
                        </span>
                        <h2>{patient?.name}的体检预约</h2>
                        <p>
                          <CalendarDays size={20} />
                          {order.date} · {order.time}
                        </p>
                        <p>
                          <MapPin size={20} />
                          {order.campus}
                        </p>
                        <small>预约编号：{order.id}</small>
                        <div className="ks-project-tags">
                          {order.items.map((item, i) => (
                            <span key={`${item}-${i}`}>{item}</span>
                          ))}
                        </div>
                      </div>
                      <div className="ks-order-action">
                        {screen === "payment" ? (
                          <>
                            <span>订单金额</span>
                            <strong>¥{order.amount}</strong>
                            <p>演示支付 · 不产生真实扣款</p>
                            <button
                              disabled={
                                order.status !== "booked" || fault === "offline"
                              }
                              className="ks-primary"
                              onClick={() => {
                                act({
                                  type: "PAYMENT",
                                  payload: {
                                    id: order.id,
                                    method: "自助机模拟扫码",
                                  },
                                });
                                setNotice("模拟支付成功，您可以继续办理签到。");
                                setScreen("checkin");
                              }}
                            >
                              确认模拟支付 <Wallet size={21} />
                            </button>
                            {order.status !== "booked" && (
                              <button
                                className="ks-secondary"
                                onClick={() => setScreen("checkin")}
                              >
                                继续办理签到
                              </button>
                            )}
                          </>
                        ) : screen === "checkin" ? (
                          <>
                            <ScanLine size={50} />
                            <h3>
                              {order.status === "booked"
                                ? "请先完成缴费"
                                : ["paid"].includes(order.status)
                                  ? "准备好开始了吗？"
                                  : "已完成到检登记"}
                            </h3>
                            <p>签到后可领取导检单</p>
                            {order.locked && (
                              <p className="ks-locked">
                                订单已锁定，不能重复签到，请联系工作人员。
                              </p>
                            )}
                            <label>
                              到检院区
                              <select
                                value={campus}
                                onChange={(e) => setCampus(e.target.value)}
                              >
                                <option>中心院区</option>
                                <option>东院区</option>
                              </select>
                            </label>
                            {order.status === "booked" ? (
                              <button
                                className="ks-primary"
                                onClick={() => setScreen("payment")}
                              >
                                前往模拟缴费
                              </button>
                            ) : order.status === "paid" ? (
                              <button
                                className="ks-primary"
                                disabled={fault === "offline" || order.locked}
                                onClick={() => {
                                  if (order.locked)
                                    return setNotice("订单已锁定，无法签到");
                                  act({
                                    type: "CHECKIN",
                                    payload: { id: order.id, campus },
                                  });
                                  setScreen("guide");
                                  setNotice("到检签到成功，已同步医护工作台。");
                                }}
                              >
                                确认签到 <CheckCircle2 size={21} />
                              </button>
                            ) : (
                              <button
                                className="ks-primary"
                                onClick={() => setScreen("guide")}
                              >
                                查看导检单 <ArrowRight size={21} />
                              </button>
                            )}
                          </>
                        ) : (
                          <>
                            <Printer size={50} />
                            <h3>A4 导检单 · 1 页</h3>
                            {order.status === "paid" && order.locked && (
                              <p className="ks-locked">
                                订单已锁定，无法签到或打印导检单。
                              </p>
                            )}
                            <p>
                              包含检查项目和科室位置
                              <br />
                              纸质输出仅为模拟效果
                            </p>
                            <button
                              className="ks-primary"
                              disabled={
                                order.status === "booked" ||
                                (order.status === "paid" && order.locked)
                              }
                              onClick={() => {
                                if (order.status === "paid" && order.locked)
                                  return setNotice(
                                    "订单已锁定，不能签到或打印导检单",
                                  );
                                if (order.status === "paid") {
                                  act({
                                    type: "CHECKIN",
                                    payload: { id: order.id, campus },
                                  });
                                }
                                startPrint("guide");
                              }}
                            >
                              模拟打印导检单 <Printer size={21} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="ks-empty">
                  <CalendarDays size={55} />
                  <h2>当前没有有效预约</h2>
                  <p>您可以先选择一个适合自己的体检套餐。</p>
                  <button
                    className="ks-primary"
                    onClick={() => setScreen("appointment")}
                  >
                    开始预约 <ArrowRight size={21} />
                  </button>
                </div>
              )}
            </section>
          )}
        {identified && screen === "report" && (
          <section className="ks-panel">
            <div className="ks-panel-heading">
              <h2>可领取的体检报告</h2>
              <span>仅审核通过的报告可打印</span>
            </div>
            {eligible.length ? (
              <>
                <div className="ks-orders">
                  {eligible.map((a) => (
                    <button
                      key={a.id}
                      className={a.id === order?.id ? "selected" : ""}
                      onClick={() => {
                        setOrderId(a.id);
                        setCampus(a.campus);
                      }}
                    >
                      <span>{a.date} 体检报告</span>
                      <small>
                        {patient?.name} · {a.campus} · {a.id}
                      </small>
                      <b>
                        {a.status === "printed"
                          ? "已领取 · 可补打"
                          : "已审核 · 可领取"}
                      </b>
                      {a.id === order?.id && <CheckCircle2 size={23} />}
                    </button>
                  ))}
                </div>
                <div className="ks-report-preview">
                  <div className="ks-paper">
                    <div>
                      <HeartPulse size={24} />
                      <b>红创健康体检中心</b>
                    </div>
                    <h3>健康体检报告</h3>
                    <small>HEALTH EXAMINATION REPORT</small>
                    <div className="ks-paper-line" />
                    <p>姓名：{patient?.name}</p>
                    <p>体检日期：{order?.date}</p>
                    <p>院区：{order?.campus}</p>
                    <span>合成报告 · 演示专用</span>
                    <div className="ks-paper-line short" />
                    <div className="ks-paper-line" />
                    <div className="ks-paper-line" />
                  </div>
                  <div className="ks-report-settings">
                    <span className="ks-mini-label">READY FOR COLLECTION</span>
                    <h2>每一份关怀，妥帖呈现</h2>
                    <p>双面打印 · A4 纸张 · 预计 8 页（模拟）</p>
                    <label>
                      打印份数
                      <select
                        value={copies}
                        onChange={(e) => setCopies(Number(e.target.value))}
                      >
                        <option value={1}>1 份</option>
                        <option value={2}>2 份</option>
                      </select>
                    </label>
                    <label className="ks-check-row">
                      <input
                        type="checkbox"
                        checked={binding}
                        onChange={(e) => setBinding(e.target.checked)}
                      />{" "}
                      完成打印后自动装订（模拟）
                    </label>
                    <button
                      className="ks-primary"
                      onClick={() => startPrint("report")}
                    >
                      开始模拟打印{binding ? "与装订" : ""}{" "}
                      <Printer size={22} />
                    </button>
                    <small>未连接真实打印机，报告不会输出纸张。</small>
                  </div>
                </div>
              </>
            ) : (
              <div className="ks-empty">
                <FileCheck2 size={58} />
                <h2>您的报告暂未完成审核</h2>
                <p>
                  审核完成后即可领取。演示可选择「沈砚秋」或「江月白」查看已审核报告。
                </p>
                <button
                  className="ks-primary"
                  onClick={() => {
                    setIdentified(false);
                    setScreen("identify");
                  }}
                >
                  切换演示身份
                </button>
              </div>
            )}
          </section>
        )}
        {screen === "printing" && (
          <section className="ks-panel ks-printing">
            <div className="ks-print-animation">
              <Printer size={75} strokeWidth={1.3} />
              <span />
            </div>
            <h2>
              {
                ["正在生成打印任务", "正在输出模拟纸张", "正在模拟自动装订"][
                  printStep
                ]
              }
            </h2>
            <p>
              请勿离开，系统正在处理您的
              {printKind === "report" ? "体检报告" : "导检单"}。
            </p>
            <div className="ks-print-progress">
              <i
                style={{
                  width: `${((printStep + 1) / (printKind === "report" && binding ? 3 : 2)) * 100}%`,
                }}
              />
            </div>
            <div className="ks-print-steps">
              {[
                "生成文件",
                "模拟打印",
                ...(printKind === "report" && binding ? ["模拟装订"] : []),
              ].map((step, i) => (
                <span key={step} className={i <= printStep ? "active" : ""}>
                  {i < printStep ? (
                    <CheckCircle2 size={21} />
                  ) : (
                    <Clock3 size={21} />
                  )}{" "}
                  {step}
                </span>
              ))}
            </div>
            <small>模拟任务 · 不调用实际硬件设备</small>
          </section>
        )}
        {screen === "complete" && (
          <section className="ks-panel ks-complete">
            <span>
              <Check size={66} />
            </span>
            <h2>
              {printKind === "report"
                ? "您的报告已完成模拟打印"
                : "导检单已完成模拟打印"}
            </h2>
            <p>
              {printKind === "report"
                ? `${copies} 份 · ${binding ? "模拟装订已完成" : "未装订"} · 打印记录已同步`
                : "到检记录与导检单打印记录已同步到工作台。"}
            </p>
            {printKind === "guide" && (
              <div className="ks-next-location">
                <MapPin size={30} />
                <div>
                  <b>建议下一站：一层采血区</b>
                  <p>请以现场医护人员指引为准，路线为演示内容。</p>
                </div>
              </div>
            )}
            <p className="ks-complete-note">
              这是本地模拟结果，没有纸张输出或真实支付。
            </p>
            <button className="ks-primary" onClick={() => reset()}>
              完成并退出 <ArrowRight size={22} />
            </button>
          </section>
        )}
      </main>
      <footer className="ks-footer">
        <button
          onClick={() => {
            setVoice(!voice);
            setNotice(
              voice
                ? "模拟语音提示已关闭。"
                : "模拟语音提示已开启，未接入真实语音播报。",
            );
          }}
        >
          <Volume2 size={21} />
          {voice ? "语音提示已开启" : "语音提示已关闭"}（模拟）
        </button>
        <span>
          {identified ? (
            <>
              <Clock3 size={19} />
              会话将在 {countdown} 秒后自动退出
            </>
          ) : (
            <>
              <ShieldCheck size={20} />
              全程本地模拟 · 合成身份 · 隐私保护
            </>
          )}
        </span>
        <button onClick={() => setShowTools(!showTools)}>
          <Settings2 size={20} />
          演示控制
        </button>
      </footer>
      {showTools && (
        <div className="ks-tools">
          <div>
            <h3>设备异常模拟</h3>
            <button
              onClick={() => setShowTools(false)}
              aria-label="关闭演示控制"
            >
              <X size={20} />
            </button>
          </div>
          <p>仅改变前端状态，不能证明真实设备符合采购参数。</p>
          <div className="ks-fault-buttons">
            {(
              [
                { value: "normal", label: "正常" },
                { value: "offline", label: "设备离线" },
                { value: "paper", label: "纸张不足" },
                { value: "jam", label: "卡纸故障" },
              ] as const
            ).map((f) => (
              <button
                className={fault === f.value ? "active" : ""}
                disabled={screen === "printing"}
                key={f.value}
                onClick={() => {
                  setFault(f.value);
                  setNotice(
                    f.value === "normal"
                      ? "设备已模拟恢复，可以重试原操作。"
                      : `已启用「${f.label}」模拟。`,
                  );
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button
            className="ks-secondary"
            onClick={() => {
              reset("已模拟身份会话超时，请重新识别。");
              setShowTools(false);
            }}
          >
            <Clock3 size={18} />
            模拟身份超时
          </button>
          <button
            className="ks-secondary"
            disabled={screen === "printing"}
            onClick={() => {
              setFault("normal");
              setNotice("设备已恢复，您的订单未被重复处理，可继续办理。");
            }}
          >
            <RefreshCw size={18} />
            恢复设备并重试
          </button>
        </div>
      )}
    </div>
  );
}

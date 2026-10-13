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
  Star,
  Stethoscope,
  UserRound,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useDemo } from "../store";
import "./devices.css";
import { getBookingAvailability } from "../bookingRules";

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
  | "article";
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
const extras = [
  { name: "甲状腺彩超", price: 120, detail: "了解甲状腺形态与结构" },
  { name: "糖化血红蛋白", price: 65, detail: "评估近期血糖整体水平" },
  { name: "骨密度检查", price: 95, detail: "了解骨量变化情况" },
];
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
  const [view, setView] = useState<View>(entranceGroup ? "group" : "home");
  const [bookingReturn, setBookingReturn] = useState<"booking" | "group">(
    entranceGroup ? "group" : "booking",
  );
  const [patientId, setPatientId] = useState(state.patients[0]?.id || "");
  const patient =
    state.patients.find((p) => p.id === patientId) || state.patients[0];
  const orders = state.appointments.filter((a) => a.patientId === patient?.id);
  const upcoming = orders.find(
    (a) => !["cancelled", "approved", "printed"].includes(a.status),
  );
  const reports = orders.filter((a) =>
    ["approved", "printed"].includes(a.status),
  );
  const [packageId, setPackageId] = useState(state.packages[0]?.id || "");
  const selectedPackage = state.packages.find((p) => p.id === packageId);
  const [date, setDate] = useState(upcomingDate());
  const [time, setTime] = useState("08:00-08:30");
  const [campus, setCampus] = useState(state.config.campus || "中心院区");
  const [simple, setSimple] = useState(false);
  const [selectedExtras, setSelectedExtras] = useState<string[]>([]);
  const [excludedItems, setExcludedItems] = useState<string[]>([]);
  const bookingSubmitted = useRef(false);
  const allowAdd = state.config.allowAdd !== false;
  const allowRemove = state.config.allowRemove !== false;
  const displayPrices =
    state.config.showPrices !== false &&
    !["不显示", "不显示价格"].includes(state.config.priceMode);
  const baseItems = (selectedPackage?.items || []).filter(
    (item) => !allowRemove || !excludedItems.includes(item),
  );
  const activeExtras = allowAdd && !simple ? selectedExtras : [];
  const availability = getBookingAvailability(state, date);
  useEffect(() => {
    setExcludedItems([]);
  }, [packageId]);
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
  const [questionDone, setQuestionDone] = useState(false);
  const [consent, setConsent] = useState(false);
  const [groupVerified, setGroupVerified] = useState(
    entranceGroup === "xingchen-2026",
  );
  const [groupCode, setGroupCode] = useState("DEMO2026");
  const [groupMode, setGroupMode] = useState("定额自选");
  const [groupRelative, setGroupRelative] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<string[]>([]);
  const [rating, setRating] = useState(0);
  const [healthDays, setHealthDays] = useState<string[]>([]);
  const [cart, setCart] = useState(0);
  const [article, setArticle] = useState("体检前，这些准备请记好");
  const [service, setService] = useState("");
  const [serviceDate, setServiceDate] = useState(upcomingDate());
  const [reminders, setReminders] = useState(true);
  const groupUrl = `${window.location.origin}${window.location.pathname}#/patient?group=xingchen-2026`;
  useEffect(() => {
    const enterGroup = () => {
      const group = new URLSearchParams(window.location.hash.split("?")[1]).get(
        "group",
      );
      if (group) {
        setView("group");
        setGroupVerified(group === "xingchen-2026");
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
  const addPrice = extras
    .filter((e) => activeExtras.includes(e.name))
    .reduce((sum, e) => sum + e.price, 0);
  const total = (simple ? 0 : selectedPackage?.price || 0) + addPrice;
  const createOrder = (isGroup = false) => {
    if (bookingSubmitted.current) return;
    if (!consent) return tell("请先确认已阅读预约须知");
    if (!patient || (!simple && !selectedPackage))
      return tell("请选择体检人和套餐");
    if (!availability.allowed) return tell(availability.error);
    if (!simple && baseItems.length + activeExtras.length === 0)
      return tell("请至少保留一个检查项目");
    if (
      isGroup &&
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
        packageId: simple ? "simple" : packageId,
        date,
        time,
        campus,
        amount: total,
        items: [...(simple ? [] : baseItems), ...activeExtras],
        results: {},
        conclusion: "",
        source: isGroup ? "H5团检" : "H5个检",
        groupBudget: isGroup ? 800 : 0,
        selfPay: isGroup
          ? groupRelative
            ? total
            : Math.max(0, total - 800)
          : total,
      },
    });
    setConsent(false);
    go("orders");
    tell("预约成功，已同步到体检工作台。短信为模拟记录。");
  };
  const payOrder = state.appointments.find((a) => a.id === payId);
  const currentReport =
    reports.find((r) => r.id === reportId) || reports[reports.length - 1];
  const commonServices = [
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
            <b>青禾 · 健康中心</b>
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
                {state.packages.slice(0, 3).map((p, i) => (
                  <button
                    className="pt-package-card"
                    key={p.id}
                    onClick={() => {
                      setPackageId(p.id);
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
                        <b>星辰科技 · 年度体检福利</b>
                        <p>
                          单位额度 ¥800 /
                          人，超额自费。亲属使用演示专属套餐并全额自费。
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
                    <button onClick={() => go("questionnaire")}>
                      <Sparkles size={16} /> 问卷推荐
                    </button>
                  </div>
                  <label className="pt-check-row">
                    <input
                      type="checkbox"
                      checked={simple}
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
                      <div className="pt-package-options">
                        {state.packages
                          .filter((p) => p.name.includes(query))
                          .map((p) => (
                            <div
                              className={`pt-package-option ${p.id === packageId ? "selected" : ""}`}
                              key={p.id}
                            >
                              <button onClick={() => setPackageId(p.id)}>
                                <span className="pt-radio">
                                  {p.id === packageId && <Check size={13} />}
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
                          value={groupMode}
                          onChange={(e) => setGroupMode(e.target.value)}
                        >
                          <option>固定套餐</option>
                          <option>定额自选</option>
                          <option>N 选 M</option>
                        </select>
                      </label>
                      <label className="pt-check-row">
                        <input
                          type="checkbox"
                          checked={groupRelative}
                          onChange={(e) => setGroupRelative(e.target.checked)}
                        />{" "}
                        亲属预约（专属价自费）
                      </label>
                    </div>
                  )}
                  {!simple && (
                    <>
                      <h3 className="pt-subheading">套餐检查项目</h3>
                      <p className="pt-muted">
                        {allowRemove
                          ? "可取消不需要的检查项目，套餐价保持不变（演示规则）。"
                          : "当前配置不允许取消套餐项目。"}
                      </p>
                      <div className="pt-item-checks">
                        {selectedPackage?.items.map((item) => (
                          <label key={item}>
                            <input
                              type="checkbox"
                              aria-label={`套餐项目：${item}`}
                              checked={baseItems.includes(item)}
                              disabled={!allowRemove}
                              onChange={() =>
                                toggle(excludedItems, item, setExcludedItems)
                              }
                            />
                            {item}
                          </label>
                        ))}
                      </div>
                      <h3 className="pt-subheading">
                        按需增加检查项目{" "}
                        {view === "group" && groupMode === "N 选 M" && (
                          <small>3 选 2</small>
                        )}
                      </h3>
                      {extras.map((e) => (
                        <label className="pt-extra" key={e.name}>
                          <input
                            type="checkbox"
                            disabled={!allowAdd}
                            checked={activeExtras.includes(e.name)}
                            onChange={() =>
                              toggle(selectedExtras, e.name, setSelectedExtras)
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
                      ))}
                      {!allowAdd && (
                        <p className="pt-note">
                          当前配置不允许增加套餐外项目。
                        </p>
                      )}
                    </>
                  )}
                  <h3 className="pt-subheading">预约时间</h3>
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
                        <option>08:00-08:30</option>
                        <option>08:30-09:00</option>
                        <option>09:00-09:30</option>
                        <option>09:30-10:00</option>
                      </select>
                    </label>
                  </div>
                  <div
                    className={`pt-capacity ${availability.allowed ? "" : "blocked"}`}
                    role="note"
                  >
                    {availability.error ||
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
                  <div className="pt-checkout">
                    <div>
                      <small>
                        {!displayPrices
                          ? "价格展示已关闭"
                          : view === "group"
                            ? `单位承担 ¥${groupRelative ? 0 : Math.min(total, 800)} / 自费 ¥${groupRelative ? total : Math.max(0, total - 800)}`
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
                      disabled={!availability.allowed}
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
                                setPackageId(p.id);
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
                <Sparkles size={15} /> 1 个基础套餐 + X 个个性项目
              </span>
              <h2>先了解您，再选择检查</h2>
              <p className="pt-muted">
                以下为规则演示，不构成医学诊断或临床建议。实际项目由医生结合情况确认。
              </p>
              {[
                "日常久坐，运动较少",
                "经常熬夜或作息不规律",
                "希望了解血糖情况",
                "关注甲状腺健康",
                "关注骨骼健康",
              ].map((a) => (
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
                onClick={() => {
                  setQuestionDone(true);
                  act({
                    type: "ADD_AUDIT",
                    payload: {
                      message: `${patient.name} 完成 H5 个性化问卷（演示），选择 ${answers.length} 项`,
                    },
                  });
                }}
              >
                生成推荐方案 <Sparkles size={17} />
              </button>
              {questionDone && (
                <div className="pt-recommendation">
                  <h3>为您整理的参考组合</h3>
                  <p>基础套餐：{selectedPackage?.name}</p>
                  <p>
                    可向医生咨询：
                    {answers.length
                      ? extras
                          .filter((_, i) =>
                            answers.some((a) =>
                              a.includes(["甲状腺", "血糖", "骨骼"][i]),
                            ),
                          )
                          .map((e) => e.name)
                          .join("、") || "生活方式评估"
                      : "基础健康检查"}
                  </p>
                  <button
                    className="pt-secondary"
                    onClick={() => {
                      setSelectedExtras(
                        extras
                          .filter((_, i) =>
                            answers.some((a) =>
                              a.includes(["甲状腺", "血糖", "骨骼"][i]),
                            ),
                          )
                          .map((e) => e.name),
                      );
                      go(bookingReturn);
                    }}
                  >
                    使用方案继续预约
                  </button>
                </div>
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
                    {state.packages.find((p) => p.id === a.packageId)?.name ||
                      "个性化 / 简单预约"}
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
                  <h3>您的检查进度</h3>
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
              {[
                "体检报告解读",
                "健康生活方式咨询",
                "体检项目咨询",
                "到院无障碍协助",
              ].map((name, i) => (
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
                    <p>专业人员协助 · 预约后联系</p>
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
              <h3 className="pt-subheading">本次体验，您还满意吗？</h3>
              <div className="pt-stars">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    aria-label={`${n} 星`}
                    onClick={() => setRating(n)}
                  >
                    <Star fill={n <= rating ? "currentColor" : "none"} />
                  </button>
                ))}
              </div>
              <button
                className="pt-secondary"
                disabled={!rating}
                onClick={() => {
                  act({
                    type: "ADD_AUDIT",
                    payload: {
                      message: `${patient.name} 提交满意度评价 ${rating} 星`,
                    },
                  });
                  tell(`感谢您的 ${rating} 星评价，已记录。`);
                }}
              >
                提交评价
              </button>
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
              <h3 className="pt-subheading">常用体检人 / 演示身份切换</h3>
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
              周一至周六 07:30—17:00
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
            {payOrder && payOrder.groupBudget > 0 && (
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
              取消后保留演示订单与操作记录，已付订单仅记录模拟取消，不发生真实退款。
            </p>
            <div className="pt-modal-actions">
              <button className="pt-secondary" onClick={() => setCancelId("")}>
                保留预约
              </button>
              <button
                className="pt-primary"
                onClick={() => {
                  act({
                    type: "UPDATE_APPOINTMENT",
                    payload: { id: cancelId, status: "cancelled" },
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
                <option>08:00-08:30</option>
                <option>08:30-09:00</option>
                <option>09:00-09:30</option>
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

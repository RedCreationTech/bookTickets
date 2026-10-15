import { resolveMenuPresentation } from "./modules/UiResources";
import { useEffect, useState, useRef, lazy, Suspense } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  Bell,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  FileHeart,
  FileText,
  HeartPulse,
  LayoutDashboard,
  LifeBuoy,
  Menu,
  MessageSquare,
  Monitor,
  Package,
  PanelLeftClose,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Stethoscope,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useDemo } from "./store";
import {
  Dashboard,
  Appointments,
  Exam,
  Review,
  Reports,
  Queue,
  Finance,
  Quality,
} from "./modules/Core";
const ControlTodoList = lazy(() =>
  import("./modules/ControlCenter").then((m) => ({
    default: m.ControlTodoList,
  })),
);
const ControlCenter = lazy(() => import("./modules/ControlCenter"));
const Analytics = lazy(() =>
  import("./modules/Advanced").then((m) => ({ default: m.Analytics })),
);
const Health = lazy(() => import("./modules/Health"));
import Operations from "./modules/Operations";
const Patient = lazy(() => import("./modules/Patient"));
const Kiosk = lazy(() => import("./modules/Kiosk"));
const Coverage = lazy(() => import("./modules/Coverage"));
import { Badge, Empty, Modal, PageTitle } from "./ui";
const navigation = [
  {
    group: "体检运营",
    items: [
      { path: "/dashboard", name: "运营概览", icon: LayoutDashboard },
      { path: "/appointments", name: "预约与登记", icon: CalendarDays },
      { path: "/queue", name: "智能导检", icon: Activity },
      { path: "/exam", name: "分检工作站", icon: Stethoscope },
      { path: "/review", name: "总检审核", icon: ClipboardCheck },
      { path: "/reports", name: "报告中心", icon: FileText },
    ],
  },
  {
    group: "健康与服务",
    items: [
      { path: "/health", name: "健康管理", icon: HeartPulse },
      { path: "/enterprise", name: "企业健康", icon: Users },
      { path: "/services", name: "医生与服务", icon: FileHeart },
      { path: "/commerce", name: "健康商城", icon: ShoppingBag },
      { path: "/content", name: "内容与消息", icon: MessageSquare },
    ],
  },
  {
    group: "管理与保障",
    items: [
      { path: "/finance", name: "财务结算", icon: Wallet },
      { path: "/analytics", name: "工作量统计", icon: Activity },
      { path: "/support", name: "客户服务", icon: LifeBuoy },
      { path: "/quality", name: "质控与追踪", icon: ShieldCheck },
      { path: "/settings", name: "系统配置", icon: Settings },
      { path: "/controls", name: "通知与专项质控", icon: ShieldCheck },
      { path: "/coverage", name: "需求覆盖", icon: BookOpen },
    ],
  },
];
export const roles: Record<
  string,
  { name: string; title: string; paths: string[]; home: string }
> = {
  admin: {
    name: "平台管理员",
    title: "运营管理工作台",
    paths: navigation.flatMap((g) => g.items.map((i) => i.path)),
    home: "/dashboard",
  },
  reception: {
    name: "前台登记员",
    title: "检前服务工作台",
    paths: ["/dashboard", "/appointments", "/queue", "/reports", "/support"],
    home: "/appointments",
  },
  doctor: {
    name: "分检医生",
    title: "分检医生工作台",
    paths: ["/exam", "/queue", "/reports", "/quality"],
    home: "/exam",
  },
  reviewer: {
    name: "总检医生",
    title: "总检审核工作台",
    paths: ["/review", "/reports", "/health", "/quality"],
    home: "/review",
  },
  manager: {
    name: "健康管理师",
    title: "健康管理工作台",
    paths: ["/health", "/enterprise", "/services", "/content", "/support"],
    home: "/health",
  },
  finance: {
    name: "财务人员",
    title: "财务结算工作台",
    paths: ["/finance", "/appointments", "/reports", "/analytics"],
    home: "/finance",
  },
  enterprise: {
    name: "企业 HR",
    title: "企业健康工作台",
    paths: ["/enterprise"],
    home: "/enterprise",
  },
  service: {
    name: "客服人员",
    title: "客户服务工作台",
    paths: ["/support", "/content", "/services"],
    home: "/support",
  },
};
export default function App() {
  const { state, act } = useDemo();
  const [location, setLocation] = useState(
    window.location.hash.slice(1) || "/dashboard",
  );
  const [mobile, setMobile] = useState(false);
  const [reset, setReset] = useState(false);
  const [help, setHelp] = useState(false);
  const guideVideo = useRef<HTMLVideoElement>(null);
  const [notifications, setNotifications] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [processing, setProcessing] = useState("");
  const [follow, setFollow] = useState(true);
  const [method, setMethod] = useState("电话联系（模拟）");
  const [globalSearch, setGlobalSearch] = useState("");
  const route = location.split("?")[0];
  const configuredRole = (state.records.roles || []).find(
    (r) => r.id === state.config.customRoleId,
  );
  const presetRole = roles[state.config.role] || roles.admin;
  const role = configuredRole
    ? {
        ...presetRole,
        name: configuredRole.name,
        title: configuredRole.name + " · 自定义权限",
        paths: (configuredRole.menuPaths || []).filter((p: string) =>
          navigation.some((g) => g.items.some((i) => i.path === p)),
        ),
        home: configuredRole.menuPaths?.[0] || "/dashboard",
      }
    : presetRole;
  useEffect(() => {
    const listen = () => {
      setLocation(window.location.hash.slice(1) || "/dashboard");
      setMobile(false);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", listen);
    return () => window.removeEventListener("hashchange", listen);
  }, []);
  const alert = (state.records.alerts || []).find(
    (a) => a.status === "待处理" && !dismissed.includes(a.id),
  );
  const current = navigation
    .flatMap((g) => g.items)
    .find((i) => i.path === route);
  if (route === "/patient")
    return (
      <Suspense fallback={<div className="empty">正在加载患者端…</div>}>
        <Patient />
      </Suspense>
    );
  if (route === "/kiosk")
    return (
      <Suspense fallback={<div className="empty">正在加载自助机…</div>}>
        <Kiosk />
      </Suspense>
    );
  const body = () => {
    if (!role.paths.includes(route))
      return (
        <section className="panel access-denied">
          <ShieldCheck size={50} />
          <h1>当前角色无此页面权限</h1>
          <p>
            {role.name}
            可以访问自己的工作台。此为前端访问控制演示，生产授权须服务端强制执行。
          </p>
          <a className="btn btn-primary" href={"#" + role.home}>
            返回工作台
          </a>
        </section>
      );
    switch (route) {
      case "/dashboard":
        return <Dashboard />;
      case "/appointments":
        return <Appointments />;
      case "/exam":
        return <Exam />;
      case "/review":
        return <Review />;
      case "/reports":
        return <Reports />;
      case "/queue":
        return <Queue screen={location.includes("screen=1")} />;
      case "/finance":
        return <Finance />;
      case "/analytics":
        return <Analytics />;
      case "/quality":
        return <Quality />;
      case "/health":
      case "/enterprise":
        return <Health section={route.slice(1)} />;
      case "/controls":
        return (
          <ControlCenter
            key={location}
            section={
              new URLSearchParams(location.split("?")[1] || "").get(
                "section",
              ) || undefined
            }
          />
        );
      case "/coverage":
        return <Coverage />;
      default:
        return <Operations section={route.slice(1)} />;
    }
  };
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <a className="brand" href={"#" + role.home}>
          <span className="brand-icon">
            <HeartPulse size={25} />
          </span>
          <div>
            <strong>
              红创<span> HEALTH</span>
            </strong>
            <small>智慧体检一体化平台</small>
          </div>
        </a>
        <div className="workspace-label">
          <span className="live-dot" />
          {role.title}
          <ChevronDown size={14} />
        </div>
        <nav>
          {navigation.map((g) => {
            const items = g.items
              .filter((i) => role.paths.includes(i.path))
              .map((i) => ({
                ...i,
                presentation: resolveMenuPresentation(state, i.path, i.name),
              }))
              .filter((i) => i.presentation.visible)
              .sort((a, b) => a.presentation.order - b.presentation.order);
            return (
              !!items.length && (
                <div className="nav-group" key={g.group}>
                  <div className="nav-label">{g.group}</div>
                  {items.map((i) => (
                    <a
                      key={i.path}
                      href={"#" + i.path}
                      className={route === i.path ? "active" : ""}
                    >
                      <i.icon size={18} />
                      {i.presentation.label}
                      {i.path === "/review" && (
                        <span className="nav-count">
                          {
                            state.appointments.filter(
                              (a) => a.status === "review",
                            ).length
                          }
                        </span>
                      )}
                    </a>
                  ))}
                </div>
              )
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="demo-label">
            <ShieldCheck size={15} />
            演示环境
          </div>
          <p>合成数据 · 非真实诊疗系统</p>
          <button onClick={() => setHelp(true)}>
            <BookOpen size={16} />
            演示指南 <ArrowUpRight size={14} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-btn mobile-toggle"
            onClick={() => setMobile(!mobile)}
            aria-label="展开导航"
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            工作空间 <span>/</span>
            <strong>
              {current
                ? resolveMenuPresentation(state, current.path, current.name)
                    .label
                : "工作台"}
            </strong>
          </div>
          <div className="topbar-controls">
            <select
              aria-label="选择院区"
              className="campus-select"
              value={state.config.campus}
              onChange={(e) =>
                act({
                  type: "UPDATE_CONFIG",
                  payload: { campus: e.target.value },
                })
              }
            >
              <option>中心院区</option>
              <option>东院区</option>
            </select>
            <button
              className="icon-btn notification-button"
              onClick={() => setNotifications(true)}
              aria-label="消息通知"
            >
              <Bell size={19} />
              {(state.tasks.some((t) => t.status !== "已完成") ||
                state.appointments.some((a) => a.status === "review") ||
                (state.records.controlNotifications || []).some(
                  (n) => n.status === "模拟失败",
                )) && <i />}
            </button>
            <div className="top-divider" />
            {configuredRole && (
              <button
                className="btn"
                onClick={() =>
                  act({
                    type: "UPDATE_CONFIG",
                    payload: { customRoleId: null, discountMin: 0.8 },
                  })
                }
              >
                退出自定义权限
              </button>
            )}
            <span className="avatar small">演示</span>
            <select
              aria-label="切换演示角色"
              className="role-select"
              value={state.config.role}
              onChange={(e) => {
                act({
                  type: "UPDATE_CONFIG",
                  payload: { role: e.target.value, customRoleId: null },
                });
                window.location.hash = roles[e.target.value].home;
              }}
            >
              {Object.entries(roles).map(([k, r]) => (
                <option key={k} value={k}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        </header>
        <div className="surface-switch">
          <span>
            <span className="live-dot" />
            工作台在线 <small>本地演示</small>
          </span>
          <div>
            <a href="#/patient">
              <Smartphone size={15} />
              患者小程序 H5
            </a>
            <a href="#/kiosk">
              <Monitor size={15} />
              体检自助机
            </a>
            <a href="#/kiosk?mode=report">
              <FileText size={15} />
              报告自助机
            </a>
            <button onClick={() => setReset(true)}>
              <RefreshCw size={14} />
              重置演示
            </button>
          </div>
        </div>
        <main className="main-content" key={route}>
          <Suspense fallback={<div className="empty">正在加载工作台…</div>}>
            {body()}
          </Suspense>
        </main>
        <footer className="main-footer">
          <span>红创智慧体检 · 让健康管理有温度</span>
          <span>纯前端交互展示 / 所有数据均为合成样例</span>
        </footer>
      </div>
      {reset && (
        <Modal title="重置全部演示数据？" onClose={() => setReset(false)}>
          <p>
            这会清除当前浏览器中的预约、结果、任务和设置，恢复初始合成样例。不会影响任何真实系统。
          </p>
          <div className="modal-actions">
            <button className="btn" onClick={() => setReset(false)}>
              取消
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                act({ type: "RESET" });
                setDismissed([]);
                setReset(false);
                window.location.hash = "/dashboard";
              }}
            >
              确认重置
            </button>
          </div>
        </Modal>
      )}
      {help && (
        <Modal
          title="10 分钟串联一次完整体检"
          onClose={() => setHelp(false)}
          wide
        >
          <section className="training-video">
            <h3>操作引导短片 · 36 秒静音流程示意</h3>
            <video
              ref={guideVideo}
              controls
              preload="metadata"
              poster={`${import.meta.env.BASE_URL}media/workflow-poster.png`}
              style={{ width: "100%", borderRadius: 8 }}
              aria-label="体检全流程操作引导"
            >
              <source
                src={`${import.meta.env.BASE_URL}media/workflow-guide.mp4`}
                type="video/mp4"
              />
              <track
                default
                kind="captions"
                srcLang="zh"
                label="简体中文"
                src={`${import.meta.env.BASE_URL}media/workflow-captions.vtt`}
              />
              您的浏览器不支持视频，可阅读下方文字步骤。
            </video>
            <div className="actions" style={{ marginTop: 10 }}>
              {[
                "检前预约",
                "到检登记",
                "科室分检",
                "三级审核",
                "报告流转",
                "健康随访",
              ].map((label, i) => (
                <button
                  className="btn"
                  key={label}
                  onClick={() => {
                    if (guideVideo.current)
                      guideVideo.current.currentTime = i * 6;
                  }}
                >
                  {i + 1}. {label}
                </button>
              ))}
            </div>
            <p className="muted" style={{ marginTop: 10 }}>
              这段短片是流程教学示意，不是实际界面录屏、视觉测试或验收证据。
            </p>
          </section>
          <div className="guide-steps">
            {[
              [
                "01",
                "患者预约",
                "打开患者小程序 H5，选择套餐、问卷和院区，创建预约并完成模拟支付。",
              ],
              [
                "02",
                "现场到检",
                "切换自助机，通过合成身份验证，选择订单到检；或使用后台前台登记员。",
              ],
              [
                "03",
                "导检与分检",
                "从智能导检呼叫，再进入分检工作站，录入结果；空腹血糖需输入数值。",
              ],
              [
                "04",
                "审核与打印",
                "总检工作站逐级通过审核，报告中心预览历年对比；报告机模拟打印装订。",
              ],
              [
                "05",
                "检后管理",
                "健康管理师记录异常处置、随访计划与任务完成；企业端看聚合健康趋势。",
              ],
            ].map(([n, t, d]) => (
              <div key={n}>
                <span>{n}</span>
                <div>
                  <h3>{t}</h3>
                  <p>{d}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="notice">
            点击右上角色可体验不同导航和工作台。所有数据存于
            localStorage，多标签页同步；可随时重置。支付、短信、AI、医院集成和硬件不会执行真实操作。
          </div>
          <a
            className="btn btn-primary"
            href="#/coverage"
            onClick={() => setHelp(false)}
          >
            逐条查看需求与边界
          </a>
        </Modal>
      )}
      {notifications && (
        <Modal title="消息与待办" onClose={() => setNotifications(false)}>
          <Suspense fallback={<p>加载待办…</p>}>
            <ControlTodoList onNavigate={() => setNotifications(false)} />
          </Suspense>
          {state.audit.slice(0, 8).map((a) => (
            <div className="notification" key={a.id}>
              <CheckCircle2 size={18} />
              <div>
                <strong>{a.message}</strong>
                <small>{new Date(a.time).toLocaleString("zh-CN")}</small>
              </div>
            </div>
          ))}
          <div className="notice">
            所有提醒均在当前浏览器内显示，未实际发送短信、微信或电话。
          </div>
        </Modal>
      )}
      {alert && (
        <Modal
          title="重大异常全局提醒 · 模拟"
          onClose={() => setDismissed([...dismissed, alert.id])}
        >
          <div className="callout alert">
            <HeartPulse />
            <div>
              <strong>
                {state.patients.find((p) => p.id === alert.patientId)?.name} ·{" "}
                {alert.title}
              </strong>
              <p>
                {alert.value} · 请记录处理方式与结果，不将演示阈值用于医疗判断。
              </p>
            </div>
          </div>
          <label className="field">
            处理方式
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option>电话联系（模拟）</option>
              <option>现场复核（模拟）</option>
              <option>转专科评估（模拟）</option>
            </select>
          </label>
          <label className="field">
            处理结果（必填）
            <textarea
              value={processing}
              onChange={(e) => setProcessing(e.target.value)}
            />
          </label>
          <label className="check-line">
            <input
              type="checkbox"
              checked={follow}
              onChange={(e) => setFollow(e.target.checked)}
            />
            进入随访系统持续跟踪
          </label>
          <div className="modal-actions">
            <button
              className="btn"
              onClick={() => setDismissed([...dismissed, alert.id])}
            >
              稍后处理
            </button>
            <button
              className="btn btn-primary"
              disabled={!processing.trim()}
              onClick={() => {
                act({
                  type: "UPSERT_RECORD",
                  payload: {
                    collection: "alerts",
                    record: {
                      ...alert,
                      status: "已处理",
                      method,
                      result: processing,
                      handler: role.name,
                      handledAt: new Date().toISOString(),
                    },
                  },
                });
                if (follow)
                  act({
                    type: "ADD_TASK",
                    payload: {
                      patientId: alert.patientId,
                      title: "重大异常后续随访",
                      risk: "A类",
                      owner: role.name,
                    },
                  });
                setProcessing("");
              }}
            >
              保存处置
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

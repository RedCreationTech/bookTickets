import { useMemo, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  BarChart3,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileText,
  Heart,
  HeartPulse,
  Plus,
  Search,
  ShieldCheck,
  Target,
  TrendingDown,
  Users,
  X,
} from "lucide-react";
import { useDemo } from "../store";
import {
  Banner,
  downloadCsv,
  FormFields,
  Metrics,
  RecordWorkspace,
  Tag,
} from "./Operations";
import type { FieldSpec, Row, WorkspaceSpec } from "./Operations";
import "./operations.css";
const dateNow = () => new Date().toISOString().slice(0, 10);
const fid = () =>
  `H${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const field = (
  key: string,
  label: string,
  type: FieldSpec["type"] = "text" as any,
  options?: string[],
  required = true,
): FieldSpec => ({ key, label, type, options, required });
const planSpec: WorkspaceSpec = {
  key: "healthPlans",
  label: "健康计划",
  description: "将目标分解为可执行的教育与随访任务，追踪每个计划的执行情况。",
  clauses: "2.2.4.7 / 18–19",
  fields: [
    field("name", "计划名称"),
    field("patient", "服务对象"),
    field("category", "计划类型", "select", [
      "成人健康管理",
      "儿童健康管理",
      "孕产妇健康管理",
      "精神卫生健康管理",
      "运动教育",
      "膳食教育",
      "用药记录（医生制定）",
      "非药物教育",
    ]),
    field("owner", "负责人"),
    field("date", "开始日期", "date"),
    field("period", "随访周期", "select", ["30 天", "60 天", "90 天", "1 年"]),
    field("description", "目标与计划内容", "textarea"),
  ],
  statuses: ["草稿", "进行中", "已完成", "已终止"],
  transitions: {
    草稿: ["进行中", "已终止"],
    进行中: ["已完成", "已终止"],
    已完成: [],
    已终止: ["草稿"],
  },
  seeds: [
    {
      id: "HP1001",
      name: "年度健康管理与报告复访",
      patient: "林知远（演示）",
      category: "成人健康管理",
      owner: "陈晓",
      date: "2026-10-13",
      period: "30 天",
      description: "按计划完成健康知识学习及随访记录，示例计划不提供医疗建议。",
      status: "进行中",
    },
    {
      id: "HP1002",
      name: "规律作息教育计划",
      patient: "苏清禾（演示）",
      category: "非药物教育",
      owner: "王医生",
      date: "2026-10-12",
      period: "60 天",
      description: "记录日常习惯与自评感受，正式干预需由合格医护人员制定。",
      status: "草稿",
    },
  ],
};
const templatesSpec: WorkspaceSpec = {
  key: "healthTemplates",
  label: "方案与词条库",
  description:
    "维护计划单元、方案模板、处方词条与再检常用语，供专业人员审核后使用。",
  clauses: "2.2.4.20–26",
  fields: [
    field("name", "模板 / 词条名称"),
    field("category", "资源类型", "select", [
      "计划单元",
      "健康计划模板",
      "健康处方模板",
      "处方词条",
      "干预词条",
      "评估医嘱",
      "再检推荐",
    ]),
    field("population", "适用人群", "select", [
      "成人",
      "儿童",
      "孕产妇",
      "精神卫生管理",
      "通用",
    ]),
    field("owner", "维护人员"),
    field("description", "模板内容", "textarea"),
  ],
  statuses: ["草稿", "待审核", "已启用", "已停用"],
  transitions: {
    草稿: ["待审核"],
    待审核: ["已启用", "草稿"],
    已启用: ["已停用"],
    已停用: ["草稿"],
  },
  seeds: [
    {
      id: "HT1001",
      name: "基础健康教育 · 30 天",
      category: "健康计划模板",
      population: "成人",
      owner: "健康管理科",
      description:
        "第 1 天：登记基线。第 7 天：健康知识教育。第 30 天：回访与记录。仅为演示流程。",
      status: "已启用",
    },
    {
      id: "HT1002",
      name: "报告复核提醒",
      category: "再检推荐",
      population: "通用",
      owner: "健康管理科",
      description:
        "请由合格医生结合报告与病史评估是否需要复检。本模板不能自动作出诊疗决定。",
      status: "待审核",
    },
    {
      id: "HT1003",
      name: "日常活动教育单元",
      category: "计划单元",
      population: "成人",
      owner: "健康教育组",
      description: "介绍日常活动记录方法，记录由专业人员确认的个体目标。",
      status: "已启用",
    },
  ],
};
const groupSpec: WorkspaceSpec = {
  key: "healthGroups",
  label: "人群与工作分组",
  description:
    "维护人群分类、工作分组与干预负责人。自动分组在企业分析中按条件计算。",
  clauses: "2.2.4.11–13",
  fields: [
    field("name", "分组名称"),
    field("category", "人群类型", "select", [
      "成人",
      "儿童",
      "孕产妇",
      "精神卫生管理",
      "工作分组",
      "慢病管理",
    ]),
    field("condition", "入组条件"),
    field("owner", "负责人"),
    field("description", "分组干预说明", "textarea"),
  ],
  statuses: ["已启用", "已停用"],
  seeds: [
    {
      id: "GR1001",
      name: "年度重点关注人群",
      category: "慢病管理",
      condition: "A 类 / B 类异常标识",
      owner: "陈晓",
      description: "合成数据分组，用于追踪复核与随访流程。",
      status: "已启用",
    },
    {
      id: "GR1002",
      name: "星辰科技健康服务组",
      category: "工作分组",
      condition: "工作单位为星辰科技",
      owner: "周医生",
      description: "企业员工健康服务工作分组。",
      status: "已启用",
    },
  ],
};
const familySpec: WorkspaceSpec = {
  key: "families",
  label: "家庭账户",
  description: "维护家庭成员与服务关系，仅保存虚构人物关系。",
  clauses: "2.2.4.1 / 3",
  fields: [
    field("name", "家庭账户名称"),
    field("owner", "主要联系人"),
    field("members", "家庭成员"),
    field("relationship", "成员关系"),
    field("description", "家庭服务备注", "textarea"),
  ],
  statuses: ["已启用", "已停用"],
  seeds: [
    {
      id: "FAM1001",
      name: "林先生家庭（演示）",
      owner: "林知远",
      members: "林知远、林小远（均为合成人物）",
      relationship: "父子",
      description: "家庭关系展示，不包含真实个人资料。",
      status: "已启用",
    },
  ],
};
const unitSpec: WorkspaceSpec = {
  key: "companyUnits",
  label: "工作单位与子单位",
  description: "维护组织层级、单位信息与企业服务负责人。",
  clauses: "2.2.4.2",
  fields: [
    field("name", "单位名称"),
    field("parent", "上级单位"),
    field("owner", "服务负责人"),
    field("contact", "企业联系人"),
    field("description", "单位备注", "textarea"),
  ],
  statuses: ["已启用", "已停用"],
  seeds: [
    {
      id: "COMP1001",
      name: "星辰科技",
      parent: "集团总部",
      owner: "陈晓",
      contact: "演示行政联系人",
      description: "合成企业客户。",
      status: "已启用",
    },
    {
      id: "COMP1002",
      name: "星辰科技 · 研发中心",
      parent: "星辰科技",
      owner: "周医生",
      contact: "演示研发中心联系人",
      description: "子单位可独立维护健康服务。",
      status: "已启用",
    },
    {
      id: "COMP1003",
      name: "远帆制造",
      parent: "集团总部",
      owner: "刘营养师",
      contact: "演示制造企业联系人",
      description: "合成企业客户。",
      status: "已启用",
    },
  ],
};
const medicalSpec: WorkspaceSpec = {
  key: "medicalRecords",
  label: "病历与处方记录",
  description: "仅用于维护合成病历和医生既有处方，不自动生成诊疗方案。",
  clauses: "2.2.4.4 / 6–7 / 19",
  fields: [
    field("name", "记录标题"),
    field("patient", "客户姓名"),
    field("category", "记录类型", "select", [
      "个人病历",
      "儿童档案",
      "孕产妇档案",
      "精神卫生档案",
      "用药处方记录",
      "非药物处方记录",
      "运动处方记录",
      "膳食处方记录",
    ]),
    field("owner", "记录人员"),
    field("date", "记录日期", "date"),
    field("description", "既有资料 / 记录内容", "textarea"),
  ],
  statuses: ["草稿", "已复核", "已归档"],
  transitions: { 草稿: ["已复核"], 已复核: ["已归档"], 已归档: ["草稿"] },
  seeds: [
    {
      id: "MR1001",
      name: "年度健康资料补充",
      patient: "林知远（演示）",
      category: "个人病历",
      owner: "王医生",
      date: "2026-10-13",
      description: "虚构资料，用于展示病历维护与复核流程。",
      status: "已复核",
    },
  ],
};
const monitorSpec: WorkspaceSpec = {
  key: "healthMetrics",
  label: "指标监测与预警",
  description: "维护指标记录与复核状态，全部数值为合成样本，不能作为诊断依据。",
  clauses: "2.2.4.15–17",
  fields: [
    field("name", "记录名称"),
    field("patient", "客户姓名"),
    field("category", "指标类型", "select", [
      "血压",
      "血糖",
      "体重",
      "腰围",
      "日常活动",
    ]),
    field("value", "测量值"),
    field("date", "记录日期", "date"),
    field("owner", "记录人员"),
    field("description", "预警 / 复核说明", "textarea"),
  ],
  statuses: ["待复核", "已复核", "需跟进", "已关闭"],
  transitions: {
    待复核: ["已复核", "需跟进"],
    需跟进: ["已复核"],
    已复核: ["已关闭"],
    已关闭: [],
  },
  seeds: [
    {
      id: "HM1001",
      name: "年度体检血压记录",
      patient: "林知远（演示）",
      category: "血压",
      value: "128/82 mmHg",
      date: "2026-10-13",
      owner: "健康管理师",
      description: "仅供界面演示，由合格医生确认临床意义。",
      status: "已复核",
    },
    {
      id: "HM1002",
      name: "血糖结果复核",
      patient: "陈映山（演示）",
      category: "血糖",
      value: "8.9 mmol/L",
      date: "2026-10-13",
      owner: "健康管理师",
      description: "使用合成数值演示异常复核工作流。",
      status: "需跟进",
    },
  ],
};
const assetSpec: WorkspaceSpec = {
  key: "healthAssets",
  label: "报告与个人设备",
  description: "登记报告资料、物联设备及服务人员；接口与实际文件存储待接入。",
  clauses: "2.2.4.1",
  fields: [
    field("name", "资料 / 设备名称"),
    field("patient", "客户姓名"),
    field("category", "资料类型", "select", [
      "体检报告登记",
      "物联设备",
      "服务人员分配",
      "短信草稿",
      "邮件草稿",
    ]),
    field("owner", "服务人员"),
    field("code", "文件 / 设备标识"),
    field("description", "资料说明", "textarea"),
  ],
  statuses: ["已登记", "已核对", "已停用"],
  seeds: [
    {
      id: "AS1001",
      name: "年度体检报告资料",
      patient: "林知远（演示）",
      category: "体检报告登记",
      owner: "陈晓",
      code: "EXAM-DEMO-1001",
      description: "报告内容来自体检流程，外部文件仅登记元数据。",
      status: "已登记",
    },
    {
      id: "AS1002",
      name: "家庭血压设备",
      patient: "林知远（演示）",
      category: "物联设备",
      owner: "陈晓",
      code: "BP-DEMO-001",
      description: "未连接实际设备，不接收真实测量数据。",
      status: "已登记",
    },
  ],
};
const profileFields = [
  field("name", "姓名"),
  field("sex", "性别", "select", ["男", "女"]),
  field("age", "年龄", "number"),
  field("phone", "演示联系标识"),
  field("company", "工作单位"),
  field("risk", "风险标识", "select", ["低风险", "C类", "B类", "A类"]),
  field("profileType", "档案类型", "select", [
    "成人档案",
    "儿童档案",
    "孕产妇档案",
    "精神卫生档案",
  ]),
  field("owner", "服务人员"),
  field("notes", "档案说明", "textarea", undefined, false),
];
function MiniLine({
  values,
  color = "#16857b",
}: {
  values: number[];
  color?: string;
}) {
  const max = Math.max(...values) + 1,
    min = Math.min(...values) - 1;
  const points = values
    .map(
      (v, i) =>
        `${12 + i * (216 / Math.max(1, values.length - 1))},${65 - ((v - min) / (max - min)) * 50}`,
    )
    .join(" ");
  return (
    <svg
      viewBox="0 0 240 82"
      role="img"
      aria-label="合成指标历史趋势"
      className="health-spark"
    >
      <path d="M12 65H228M12 40H228M12 15H228" stroke="#e9eeed" fill="none" />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {values.map((v, i) => (
        <circle
          key={i}
          cx={12 + i * (216 / Math.max(1, values.length - 1))}
          cy={65 - ((v - min) / (max - min)) * 50}
          r="3"
          fill={color}
        />
      ))}
      <text x="10" y="80">
        上上次
      </text>
      <text x="105" y="80">
        上次
      </text>
      <text x="210" y="80">
        本次
      </text>
    </svg>
  );
}
function Profiles() {
  const { state, act } = useDemo() as any;
  const [selected, setSelected] = useState(state.patients[0]?.id);
  const [query, setQuery] = useState("");
  const [risk, setRisk] = useState("全部风险");
  const [tab, setTab] = useState("overview");
  const [editor, setEditor] = useState<Row | null>(null);
  const [notice, setNotice] = useState("");
  const [uploadError, setUploadError] = useState("");
  const patients = state.patients.filter(
    (p: Row) =>
      (risk === "全部风险" || p.risk === risk) &&
      `${p.name}${p.company}${p.id}`.includes(query),
  );
  const p = patients.find((x: Row) => x.id === selected) || patients[0];
  const exams = state.appointments.filter((a: Row) => a.patientId === p?.id);
  const tasks = state.tasks.filter((t: Row) => t.patientId === p?.id);
  const latest = exams[0];
  const bp = latest?.results?.["一般检查"];
  const glucose = latest?.results?.["空腹血糖"];
  const metricValues = [
    {
      name: "收缩压",
      value: bp && /^\d+/.test(bp) ? bp.split("/")[0] : "—",
      unit: "mmHg",
      values: (latest?.history?.["一般检查"] || [])
        .map((x: string) => Number(x.split("/")[0]))
        .filter(Number.isFinite),
    },
    {
      name: "空腹血糖",
      value: glucose && Number.isFinite(Number(glucose)) ? glucose : "—",
      unit: "mmol/L",
      values: (latest?.history?.["空腹血糖"] || [])
        .map(Number)
        .filter(Number.isFinite),
    },
    {
      name: "体重指数",
      value: p?.bmi || "—",
      unit: "kg/m²",
      values: p?.bmiHistory || [],
    },
  ];
  const recordTabs: Record<string, WorkspaceSpec> = {
    medical: medicalSpec,
    metrics: monitorSpec,
    assets: assetSpec,
    families: familySpec,
  };
  return (
    <>
      <div className="health-profile-tools">
        <label className="ops-search">
          <Search size={16} />
          <input
            aria-label="搜索健康客户"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索姓名、单位或档案编号"
          />
        </label>
        <select
          aria-label="按风险筛选客户"
          value={risk}
          onChange={(e) => setRisk(e.target.value)}
        >
          {["全部风险", "低风险", "C类", "B类", "A类"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <button
          className="btn btn-primary"
          onClick={() =>
            setEditor({
              id: fid(),
              name: "",
              sex: "女",
              age: 30,
              phone: "演示 ",
              company: "个检",
              risk: "低风险",
              profileType: "成人档案",
              owner: "陈晓",
            })
          }
        >
          <Plus size={16} />
          新建客户档案
        </button>
      </div>
      {notice && (
        <div className="ops-feedback">
          <CheckCircle2 size={16} />
          {notice}
        </div>
      )}
      <div className="health-profile-layout">
        <aside className="panel health-patient-list">
          <div className="health-list-title">
            客户档案 <span>{patients.length}</span>
          </div>
          {patients.map((x: Row) => (
            <button
              key={x.id}
              className={p?.id === x.id ? "active" : ""}
              onClick={() => setSelected(x.id)}
            >
              <span className={`ops-avatar ${x.sex === "女" ? "purple" : ""}`}>
                {x.name.slice(-2)}
              </span>
              <div>
                <b>
                  {x.name}
                  <small>
                    {x.sex} · {x.age} 岁
                  </small>
                </b>
                <span>{x.company}</span>
              </div>
              <i
                className={`health-risk-dot ${x.risk === "A类" ? "red" : x.risk === "B类" ? "amber" : ""}`}
              />
            </button>
          ))}
          {!patients.length && <p className="ops-muted">暂无匹配客户</p>}
        </aside>
        <div className="health-profile-main">
          {p && (
            <>
              <section className="panel health-person-card">
                <div className="health-person-top">
                  <span className="health-large-avatar">
                    {p.name.slice(-2)}
                  </span>
                  <div>
                    <div className="health-person-title">
                      <h2>{p.name}</h2>
                      <Tag value={p.risk} />
                      <span className="health-person-type">
                        {p.profileType || "成人档案"}
                      </span>
                    </div>
                    <p>
                      {p.sex} · {p.age} 岁 <i /> {p.company} <i /> 档案 {p.id}
                    </p>
                    <small>
                      服务人员：{p.owner || "陈晓 · 健康管理师"} · {p.phone}
                    </small>
                  </div>
                  <button
                    className="btn"
                    onClick={() =>
                      setEditor({
                        ...p,
                        profileType: p.profileType || "成人档案",
                        owner: p.owner || "陈晓",
                      })
                    }
                  >
                    维护档案
                  </button>
                </div>
                <div className="health-person-bottom">
                  <span>
                    <CalendarDays size={15} />
                    最近体检 {exams[0]?.date || "暂无记录"}
                  </span>
                  <span>
                    <FileText size={15} />
                    {exams.length} 份体检档案
                  </span>
                  <span>
                    <ClipboardList size={15} />
                    {
                      tasks.filter((t: Row) => t.status !== "已完成").length
                    }{" "}
                    项待完成随访
                  </span>
                </div>
              </section>
              <div className="health-profile-tabs">
                {[
                  ["overview", "健康概览"],
                  ["timeline", "诊疗与体检时间线"],
                  ["medical", "病历与处方"],
                  ["metrics", "指标与预警"],
                  ["assets", "资料与设备"],
                  ["families", "家庭账户"],
                ].map(([key, label]) => (
                  <button
                    className={tab === key ? "active" : ""}
                    key={key}
                    onClick={() => setTab(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {tab === "overview" && (
                <>
                  <div className="health-vital-grid">
                    {metricValues.map((v) => (
                      <section className="panel health-vital" key={v.name}>
                        <div>
                          <span>{v.name}</span>
                          <span className="health-sample">合成趋势</span>
                        </div>
                        <strong>
                          {v.value}
                          <small>{v.unit}</small>
                        </strong>
                        {v.values.length ? (
                          <MiniLine values={v.values} />
                        ) : (
                          <div className="health-metric-empty">
                            暂无历史记录
                          </div>
                        )}
                      </section>
                    ))}
                  </div>
                  <div className="health-overview-bottom">
                    <section className="panel ops-panel">
                      <div className="ops-panel-title">
                        <div>
                          <h2>体检记录</h2>
                          <p>与预约及检中工作台实时关联</p>
                        </div>
                        <FileText size={20} />
                      </div>
                      {exams.map((a: Row) => (
                        <div className="health-exam-row" key={a.id}>
                          <span className="ops-soft-icon">
                            <FileText size={20} />
                          </span>
                          <div>
                            <b>
                              {state.packages.find(
                                (pk: Row) => pk.id === a.packageId,
                              )?.name || "健康体检"}
                            </b>
                            <small>
                              {a.date} · {a.campus} · {a.id}
                            </small>
                            <p>
                              {a.conclusion ||
                                "报告尚未审核完成，等待专业人员处理。"}
                            </p>
                          </div>
                        </div>
                      ))}
                      {!exams.length && (
                        <p className="ops-muted">
                          暂无体检记录，可在预约工作台创建体检订单。
                        </p>
                      )}
                    </section>
                    <section className="panel ops-panel">
                      <div className="ops-panel-title">
                        <div>
                          <h2>正在关注</h2>
                          <p>从报告到持续管理</p>
                        </div>
                        <Heart size={20} />
                      </div>
                      {tasks.map((t: Row) => (
                        <div className="health-attention-row" key={t.id}>
                          <div>
                            <b>{t.title}</b>
                            <small>
                              {t.owner} · {t.date}
                            </small>
                          </div>
                          <Tag value={t.status} />
                        </div>
                      ))}
                      {!tasks.length && (
                        <p className="ops-muted">当前客户暂无随访任务。</p>
                      )}
                      <button
                        className="btn health-full"
                        onClick={() => {
                          act({
                            type: "ADD_TASK",
                            payload: {
                              title: "年度报告教育与复访",
                              patientId: p.id,
                              owner: p.owner || "陈晓",
                              risk: p.risk,
                              date: dateNow(),
                            },
                          });
                          setNotice(
                            `已为 ${p.name} 创建随访任务，可在干预随访中处理。`,
                          );
                        }}
                      >
                        <Plus size={15} />
                        创建关联随访
                      </button>
                    </section>
                  </div>
                </>
              )}
              {tab === "timeline" && (
                <section className="panel ops-panel">
                  <div className="ops-panel-title">
                    <div>
                      <h2>全周期健康时间线</h2>
                      <p>体检、健康计划与随访记录按日期汇集</p>
                    </div>
                    <Activity size={20} />
                  </div>
                  <div className="health-timeline">
                    {[
                      ...exams.map((a: Row) => ({
                        date: a.date,
                        title: "年度体检",
                        text:
                          a.conclusion || `${a.id} · ${a.campus} · 报告处理中`,
                        kind: "体检",
                      })),
                      ...tasks.map((t: Row) => ({
                        date: t.date,
                        title: t.title,
                        text: `${t.owner} · ${t.status}${t.note ? " · " + t.note : ""}`,
                        kind: "随访",
                      })),
                      ...(state.records.healthPlans || [])
                        .filter((x: Row) => x.patient?.includes(p.name))
                        .map((x: Row) => ({
                          date: x.date,
                          title: x.name,
                          text: x.description,
                          kind: "计划",
                        })),
                    ]
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .map((e, i) => (
                        <div className="health-timeline-item" key={i}>
                          <div className="health-timeline-date">
                            {e.date}
                            <span>{e.kind}</span>
                          </div>
                          <div>
                            <h3>{e.title}</h3>
                            <p>{e.text}</p>
                          </div>
                        </div>
                      ))}
                  </div>
                </section>
              )}
              {tab === "assets" && (
                <section className="panel ops-panel health-upload">
                  <div className="ops-panel-title">
                    <div>
                      <h2>本地报告文件</h2>
                      <p>
                        报告仅保存在当前浏览器；支持 PDF / TXT / CSV，每份最大
                        512 KB，最多 4 份。
                      </p>
                    </div>
                    <label className="btn">
                      选择演示报告
                      <input
                        aria-label="选择报告文件"
                        type="file"
                        accept=".pdf,.txt,.csv"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (!/\.(pdf|txt|csv)$/i.test(file.name)) {
                            setUploadError("仅支持 PDF、TXT 和 CSV 格式。");
                            return;
                          }
                          if (file.size > 512 * 1024) {
                            setUploadError(
                              "文件超过 512 KB，请使用更小的合成报告。",
                            );
                            return;
                          }
                          if (
                            (state.records.healthAttachments || []).length >= 4
                          ) {
                            setUploadError(
                              "本地演示最多保存 4 份文件，请先删除不需要的报告。",
                            );
                            return;
                          }
                          const reader = new FileReader();
                          reader.onerror = () =>
                            setUploadError("读取文件失败，请重试。");
                          reader.onload = () => {
                            act({
                              type: "UPSERT_RECORD",
                              payload: {
                                collection: "healthAttachments",
                                record: {
                                  id: fid(),
                                  patientId: p.id,
                                  name: file.name,
                                  size: file.size,
                                  type: file.type,
                                  data: reader.result,
                                  date: dateNow(),
                                },
                              },
                            });
                            setUploadError("");
                            setNotice(
                              `已在本地保存 ${p.name} 的演示报告文件。`,
                            );
                          };
                          reader.readAsDataURL(file);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                  <Banner>
                    请只选择虚构报告。文件不会上传到任何服务器，也不会自动解读为医学结论。
                  </Banner>
                  {uploadError && (
                    <p className="ops-error" role="alert">
                      {uploadError}
                    </p>
                  )}
                  {(state.records.healthAttachments || [])
                    .filter((r: Row) => r.patientId === p.id)
                    .map((r: Row) => (
                      <div className="health-attention-row" key={r.id}>
                        <div>
                          <b>{r.name}</b>
                          <small>
                            {Math.ceil(r.size / 1024)} KB · {r.date}
                          </small>
                        </div>
                        <div>
                          <a
                            className="ops-text-btn"
                            href={r.data}
                            download={r.name}
                          >
                            下载原文件
                          </a>
                          <button
                            className="ops-text-btn"
                            onClick={() => {
                              act({
                                type: "DELETE_RECORD",
                                payload: {
                                  collection: "healthAttachments",
                                  id: r.id,
                                },
                              });
                              setNotice("本地报告文件已删除");
                            }}
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    ))}
                  {!(state.records.healthAttachments || []).some(
                    (r: Row) => r.patientId === p.id,
                  ) && <p className="ops-muted">该客户尚无本地报告文件。</p>}
                </section>
              )}
              {recordTabs[tab] && (
                <RecordWorkspace
                  key={tab}
                  spec={{
                    ...recordTabs[tab],
                    description: `当前聚焦 ${p.name}。列表包含全体客户，可通过姓名搜索关联记录。`,
                  }}
                  compact
                />
              )}
            </>
          )}
        </div>
      </div>
      {editor && (
        <div className="ops-overlay">
          <section
            className="ops-modal"
            role="dialog"
            aria-modal="true"
            aria-label="健康档案编辑"
          >
            <div className="ops-modal-head">
              <div>
                <h2>
                  {state.patients.some((x: Row) => x.id === editor.id)
                    ? "维护"
                    : "新建"}
                  健康档案
                </h2>
                <p>演示环境请仅录入虚构资料</p>
              </div>
              <button
                className="ops-icon-btn"
                aria-label="关闭档案编辑"
                onClick={() => setEditor(null)}
              >
                <X />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (editor.age > 120) {
                  setNotice("年龄需在 0–120 岁之间");
                  return;
                }
                act({ type: "UPSERT_PATIENT", payload: editor });
                setSelected(editor.id);
                setNotice("健康档案已保存，信息已同步至共享客户数据。");
                setEditor(null);
              }}
            >
              <div className="ops-form-grid">
                <FormFields
                  fields={profileFields}
                  draft={editor}
                  setDraft={setEditor}
                />
              </div>
              <div className="ops-modal-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setEditor(null)}
                >
                  取消
                </button>
                <button className="btn btn-primary" type="submit">
                  保存档案
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
function Followup() {
  const { state, act } = useDemo() as any;
  const [filter, setFilter] = useState("全部客户");
  const [period, setPeriod] = useState("30 天");
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<Row | null>(null);
  const [detail, setDetail] = useState<Row | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const tasks = state.tasks.filter(
    (t: Row) =>
      (filter === "全部客户" || t.patientId === filter) &&
      `${t.title}${state.patients.find((p: Row) => p.id === t.patientId)?.name || ""}`.includes(
        query,
      ),
  );
  const statuses = ["待处理", "进行中", "已完成"];
  const selected = detail
    ? state.tasks.find((t: Row) => t.id === detail.id)
    : null;
  const update = (t: Row, status: string) => {
    if (status === "已完成" && !note.trim()) {
      setDetail(t);
      setError("完成前请记录本次随访结果。");
      return;
    }
    act({
      type: "UPDATE_TASK",
      payload: {
        id: t.id,
        status,
        note: note.trim() || t.note,
        history: [
          ...(t.history || []),
          { date: dateNow(), text: `${status}${note ? "：" + note : ""}` },
        ],
        completedAt: status === "已完成" ? dateNow() : undefined,
      },
    });
    setNote("");
    setError("");
  };
  return (
    <>
      <Metrics
        items={[
          {
            label: "随访任务",
            value: tasks.length,
            note: "与异常追踪共享任务",
          },
          {
            label: "等待联系",
            value: tasks.filter((x: Row) => x.status === "待处理").length,
          },
          {
            label: "持续跟进",
            value: tasks.filter((x: Row) => x.status === "进行中").length,
          },
          {
            label: "完成率",
            value: `${tasks.length ? Math.round((tasks.filter((x: Row) => x.status === "已完成").length / tasks.length) * 100) : 0}%`,
            note: "当前筛选任务完成比例",
          },
        ]}
      />
      <section className="panel ops-panel">
        <div className="ops-panel-title">
          <div>
            <h2>随访工作台</h2>
            <p>分配责任人，记录每一步进展，形成干预闭环。</p>
          </div>
          <button
            className="btn btn-primary"
            onClick={() =>
              setEditor({
                title: "",
                patientId: state.patients[0]?.id,
                owner: "陈晓",
                date: dateNow(),
                period: "30 天",
                risk: "低风险",
              })
            }
          >
            <Plus size={16} />
            创建随访任务
          </button>
        </div>
        <div className="ops-toolbar">
          <label className="ops-search">
            <Search size={16} />
            <input
              aria-label="搜索随访任务"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索客户或任务"
            />
          </label>
          <select
            aria-label="筛选随访客户"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option>全部客户</option>
            {state.patients.map((p: Row) => (
              <option value={p.id} key={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            className="btn"
            onClick={() =>
              downloadCsv("随访任务", tasks, [
                field("title", "任务"),
                field("patientId", "客户编号"),
                field("owner", "责任人"),
                field("date", "计划日期"),
                field("status", "状态"),
                field("note", "随访结果"),
              ])
            }
          >
            <ArrowDownToLine size={15} />
            导出任务
          </button>
        </div>
        <div className="health-kanban">
          {statuses.map((s, i) => (
            <section className={`health-kanban-col col-${i}`} key={s}>
              <h3>
                <span />
                {s}
                <b>{tasks.filter((x: Row) => x.status === s).length}</b>
              </h3>
              {tasks
                .filter((x: Row) => x.status === s)
                .map((t: Row) => (
                  <article className="health-task" key={t.id}>
                    <div>
                      <Tag value={t.risk || "常规随访"} />
                      <button
                        className="ops-text-btn"
                        onClick={() => {
                          setDetail(t);
                          setNote("");
                          setError("");
                        }}
                      >
                        详情
                      </button>
                    </div>
                    <h4>{t.title}</h4>
                    <p>
                      {state.patients.find((p: Row) => p.id === t.patientId)
                        ?.name || "未关联客户"}{" "}
                      · {t.owner}
                    </p>
                    <div className="health-task-foot">
                      <span>
                        <CalendarDays size={12} />
                        {t.date}
                      </span>
                      {s !== "已完成" ? (
                        <button
                          onClick={() =>
                            update(t, s === "待处理" ? "进行中" : "已完成")
                          }
                        >
                          {s === "待处理" ? "开始跟进" : "完成随访"}
                          <ArrowRight size={13} />
                        </button>
                      ) : (
                        <CheckCircle2 size={16} />
                      )}
                    </div>
                  </article>
                ))}
              {!tasks.some((x: Row) => x.status === s) && (
                <div className="health-kanban-empty">暂无{s}任务</div>
              )}
            </section>
          ))}
        </div>
      </section>
      <section className="panel ops-panel health-effect">
        <div className="ops-panel-title">
          <div>
            <h2>干预效果追踪</h2>
            <p>查看不同随访节点的计划与执行记录，不推断临床疗效。</p>
          </div>
          <div className="health-periods">
            {["30 天", "60 天", "90 天", "1 年"].map((v) => (
              <button
                className={period === v ? "active" : ""}
                key={v}
                onClick={() => setPeriod(v)}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        <div className="health-effect-row">
          <div>
            <span>观察节点</span>
            <strong>{period}</strong>
          </div>
          <div>
            <span>节点匹配任务</span>
            <strong>
              {
                tasks.filter((t: Row) => (t.period || "30 天") === period)
                  .length
              }
            </strong>
          </div>
          <div>
            <span>已完成任务</span>
            <strong>
              {
                tasks.filter(
                  (t: Row) =>
                    (t.period || "30 天") === period && t.status === "已完成",
                ).length
              }
            </strong>
          </div>
          <p>任务完成代表流程执行情况；指标变化、健康评价需由专业人员确认。</p>
        </div>
      </section>
      {editor && (
        <div className="ops-overlay">
          <section
            className="ops-modal"
            role="dialog"
            aria-modal="true"
            aria-label="创建随访"
          >
            <div className="ops-modal-head">
              <h2>创建随访任务</h2>
              <button
                className="ops-icon-btn"
                aria-label="关闭创建随访"
                onClick={() => setEditor(null)}
              >
                <X />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                act({ type: "ADD_TASK", payload: editor });
                setEditor(null);
              }}
            >
              <div className="ops-form-grid">
                <label className="ops-field">
                  <span>服务客户 *</span>
                  <select
                    value={editor.patientId}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        patientId: e.target.value,
                        risk: state.patients.find(
                          (p: Row) => p.id === e.target.value,
                        )?.risk,
                      })
                    }
                  >
                    {state.patients.map((p: Row) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <FormFields
                  fields={[
                    field("title", "任务名称"),
                    field("owner", "责任人"),
                    field("date", "计划日期", "date"),
                    field("period", "评估节点", "select", [
                      "30 天",
                      "60 天",
                      "90 天",
                      "1 年",
                    ]),
                    field(
                      "description",
                      "执行说明",
                      "textarea",
                      undefined,
                      false,
                    ),
                  ]}
                  draft={editor}
                  setDraft={setEditor}
                />
              </div>
              <div className="ops-modal-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setEditor(null)}
                >
                  取消
                </button>
                <button className="btn btn-primary" type="submit">
                  创建任务
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {selected && (
        <div className="ops-overlay">
          <section
            className="ops-modal"
            role="dialog"
            aria-modal="true"
            aria-label="随访详情"
          >
            <div className="ops-modal-head">
              <div>
                <h2>{selected.title}</h2>
                <p>
                  {
                    state.patients.find((p: Row) => p.id === selected.patientId)
                      ?.name
                  }{" "}
                  · {selected.owner} · {selected.date}
                </p>
              </div>
              <button
                className="ops-icon-btn"
                aria-label="关闭随访详情"
                onClick={() => {
                  setDetail(null);
                  setError("");
                }}
              >
                <X />
              </button>
            </div>
            <div className="health-task-detail">
              <Tag value={selected.status} />
              <p>
                {selected.description || "按流程联系客户，完成后填写执行结果。"}
              </p>
              {selected.note && (
                <div className="ops-inline-box">
                  <h3>上次跟进记录</h3>
                  <p>{selected.note}</p>
                </div>
              )}
              <label className="ops-field">
                <span>本次随访结果</span>
                <textarea
                  rows={4}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="仅填写合成随访结果，不记录真实患者信息。"
                />
              </label>
              {error && <p className="ops-error">{error}</p>}
              <div className="ops-history">
                {(selected.history || []).map((h: Row, i: number) => (
                  <div className="ops-history-item" key={i}>
                    <span />
                    <div>
                      <b>{h.text}</b>
                      <small>{h.date}</small>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="ops-modal-actions">
              <button
                className="btn"
                onClick={() => {
                  if (!note.trim()) {
                    setError("请填写本次记录。");
                    return;
                  }
                  update(selected, selected.status);
                }}
              >
                保存记录
              </button>
              {selected.status !== "已完成" && (
                <button
                  className="btn btn-primary"
                  onClick={() => update(selected, "已完成")}
                >
                  记录并完成随访
                </button>
              )}
              {selected.status === "已完成" && (
                <button
                  className="btn"
                  onClick={() => update(selected, "进行中")}
                >
                  重新跟进
                </button>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
function Assessments() {
  const { state, act } = useDemo() as any;
  const [patient, setPatient] = useState(state.patients[0]?.id);
  const [type, setType] = useState("慢病风险教育");
  const [answers, setAnswers] = useState<Row>({
    activity: "偶尔",
    sleep: "一般",
    diet: "一般",
    smoke: "否",
    followup: "是",
  });
  const [generated, setGenerated] = useState<Row | null>(null);
  const [saved, setSaved] = useState(false);
  const questions = [
    ["activity", "日常活动频率", ["规律", "偶尔", "较少"]],
    ["sleep", "近期自评睡眠", ["良好", "一般", "待改善"]],
    ["diet", "自评饮食规律", ["规律", "一般", "不规律"]],
    ["smoke", "是否有吸烟习惯", ["否", "是"]],
    ["followup", "是否了解报告随访安排", ["是", "否"]],
  ];
  const reports = (state.records.assessments || []).filter(
    (r: Row) => r.patientId === patient,
  );
  return (
    <div className="health-assess-grid">
      <section className="panel ops-panel">
        <div className="ops-panel-title">
          <div>
            <h2>风险评估工作台</h2>
            <p>按客户与人群选择问卷，演示采集与报告存档流程</p>
          </div>
          <ClipboardList size={22} />
        </div>
        <div className="health-assess-form">
          <div className="ops-form-grid">
            <label className="ops-field">
              <span>评估客户</span>
              <select
                value={patient}
                onChange={(e) => {
                  setPatient(e.target.value);
                  setGenerated(null);
                  setSaved(false);
                }}
              >
                {state.patients.map((p: Row) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.profileType || "成人档案"}
                  </option>
                ))}
              </select>
            </label>
            <label className="ops-field">
              <span>评估类型</span>
              <select
                value={type}
                onChange={(e) => {
                  setType(e.target.value);
                  setGenerated(null);
                  setSaved(false);
                }}
              >
                {[
                  "慢病风险教育",
                  "心理健康自评流程",
                  "中医体质辨识流程",
                  "设备慢病评估套餐",
                  "机构团检报告",
                ].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
          </div>
          <Banner>
            此简化问卷不属于临床量表，不生成疾病风险评分、心理诊断或中医体质结论。
          </Banner>
          {questions.map(([key, label, opts], i) => (
            <div className="health-question" key={String(key)}>
              <label>
                <span>{String(i + 1).padStart(2, "0")}</span>
                {label}
              </label>
              <div>
                {(opts as string[]).map((o) => (
                  <button
                    className={answers[String(key)] === o ? "selected" : ""}
                    key={o}
                    onClick={() => {
                      setAnswers({ ...answers, [String(key)]: o });
                      setGenerated(null);
                      setSaved(false);
                    }}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <button
            className="btn btn-primary health-full"
            onClick={() => {
              setGenerated({
                id: fid(),
                name: `${type} · ${state.patients.find((p: Row) => p.id === patient)?.name}`,
                patientId: patient,
                category: type,
                date: dateNow(),
                status: "待专业复核",
                answers,
                description:
                  "已完成 5 项示例问卷。此结果仅证明数据采集流程完成，不代表医学评估结论。",
              });
              setSaved(false);
            }}
          >
            生成教育性流程报告
            <ArrowRight size={16} />
          </button>
        </div>
      </section>
      <div>
        <section className="panel ops-panel health-assess-result">
          <div className="ops-panel-title">
            <div>
              <h2>评估报告</h2>
              <p>采集结果与专业复核分开管理</p>
            </div>
            <ShieldCheck size={21} />
          </div>
          {generated ? (
            <div className="health-generated">
              <div className="health-completion-ring">
                <Check size={38} />
              </div>
              <h3>问卷采集完成</h3>
              <p>{generated.description}</p>
              <div className="health-answer-summary">
                {questions.map(([key, label]) => (
                  <div key={String(key)}>
                    <span>{label}</span>
                    <b>{answers[String(key)]}</b>
                  </div>
                ))}
              </div>
              <button
                className="btn btn-primary health-full"
                disabled={saved}
                onClick={() => {
                  act({
                    type: "UPSERT_RECORD",
                    payload: { collection: "assessments", record: generated },
                  });
                  setSaved(true);
                }}
              >
                {saved ? "已存入客户评估档案" : "保存报告，等待专业复核"}
              </button>
              {saved && (
                <button
                  className="btn health-full"
                  style={{ marginTop: 10 }}
                  onClick={() => {
                    const updated = {
                      ...generated,
                      status: "已复核（模拟）",
                      reviewedAt: dateNow(),
                    };
                    act({
                      type: "UPSERT_RECORD",
                      payload: { collection: "assessments", record: updated },
                    });
                    setGenerated(updated);
                  }}
                  disabled={generated.status === "已复核（模拟）"}
                >
                  {generated.status === "已复核（模拟）"
                    ? "已完成模拟复核"
                    : "记录专业复核（模拟）"}
                </button>
              )}
            </div>
          ) : (
            <div className="ops-empty">
              <ClipboardList size={38} />
              <h3>等待采集结果</h3>
              <p>填写左侧问卷后可生成演示报告</p>
            </div>
          )}
        </section>
        <section className="panel ops-panel health-previous">
          <div className="ops-panel-title">
            <h2>历次评估记录</h2>
            <span>{reports.length} 份</span>
          </div>
          {reports.map((r: Row) => (
            <div className="health-attention-row" key={r.id}>
              <div>
                <b>{r.category}</b>
                <small>{r.date}</small>
              </div>
              <button
                className="ops-text-btn"
                onClick={() => {
                  setGenerated(r);
                  setAnswers(r.answers);
                  setType(r.category);
                  setSaved(true);
                }}
              >
                查看
              </button>
            </div>
          ))}
          {!reports.length && (
            <p className="ops-muted">该客户暂无已保存评估报告</p>
          )}
        </section>
      </div>
    </div>
  );
}
const dimensions = [
  "危险因素",
  "年龄",
  "性别",
  "血压",
  "血脂",
  "血糖",
  "吸烟",
  "体重",
  "慢病分类",
  "建档情况",
  "职业",
  "文化程度",
  "膳食",
  "运动",
  "饮酒",
];
function cohortLabel(p: Row, i: number, dimension: string, previous = false) {
  const n = i + (previous ? 1 : 0);
  switch (dimension) {
    case "年龄":
      return p.age < 35 ? "35 岁以下" : p.age < 50 ? "35–49 岁" : "50 岁及以上";
    case "性别":
      return p.sex;
    case "危险因素":
    case "慢病分类":
      return p.risk === "A类"
        ? "重点复核"
        : p.risk === "B类"
          ? "持续关注"
          : "一般管理";
    case "血压":
      return n % 4 === 0 ? "待复核" : "已记录";
    case "血脂":
      return n % 3 === 0 ? "待复核" : "已记录";
    case "血糖":
      return n % 5 === 0 ? "待复核" : "已记录";
    case "吸烟":
      return n % 3 === 0 ? "有吸烟记录" : "无吸烟记录";
    case "体重":
      return ["一般区间", "偏高区间", "一般区间", "待补充"][n % 4];
    case "建档情况":
      return n % 6 === 0 ? "资料待补充" : "已建档";
    case "职业":
      return ["技术人员", "行政人员", "生产人员"][n % 3];
    case "文化程度":
      return ["本科", "专科", "研究生"][n % 3];
    case "膳食":
      return n % 3 === 0 ? "自评待改善" : "自评规律";
    case "运动":
      return n % 3 === 0 ? "较少" : n % 3 === 1 ? "偶尔" : "规律";
    case "饮酒":
      return n % 3 === 0 ? "偶尔饮酒" : "无饮酒记录";
    default:
      return "未分类";
  }
}
function Enterprise() {
  const { state, act } = useDemo() as any;
  const [tab, setTab] = useState("analytics");
  const [company, setCompany] = useState("所有单位");
  const [sex, setSex] = useState("全部性别");
  const [age, setAge] = useState("所有年龄");
  const [dimension, setDimension] = useState("危险因素");
  const [compare, setCompare] = useState(true);
  const [notice, setNotice] = useState("");
  const [generated, setGenerated] = useState(false);
  const [report, setReport] = useState<Row | null>(null);
  const people = state.patients.filter(
    (p: Row) =>
      (company === "所有单位" || p.company === company) &&
      (sex === "全部性别" || p.sex === sex) &&
      (age === "所有年龄" ||
        (age === "35 岁以下"
          ? p.age < 35
          : age === "35–49 岁"
            ? p.age >= 35 && p.age < 50
            : p.age >= 50)),
  );
  const counts: Record<string, number> = {},
    prior: Record<string, number> = {};
  people.forEach((p: Row, i: number) => {
    const label = cohortLabel(
        p,
        state.patients.findIndex((x: Row) => x.id === p.id),
        dimension,
      ),
      prev = cohortLabel(
        p,
        state.patients.findIndex((x: Row) => x.id === p.id),
        dimension,
        true,
      );
    counts[label] = (counts[label] || 0) + 1;
    prior[prev] = (prior[prev] || 0) + 1;
  });
  const series = Object.keys({ ...counts, ...prior }).map((label) => ({
    name: label,
    count: counts[label] || 0,
    previous: prior[label] || 0,
    share: people.length
      ? Math.round(((counts[label] || 0) / people.length) * 100)
      : 0,
  }));
  const high = people.filter((p: Row) => p.risk === "A类" || p.risk === "B类");
  const completed = state.tasks.filter(
    (t: Row) =>
      people.some((p: Row) => p.id === t.patientId) && t.status === "已完成",
  ).length;
  return (
    <div className="ops-page">
      <div className="ops-page-heading">
        <div>
          <span className="ops-eyebrow">ENTERPRISE HEALTH INSIGHTS</span>
          <h1>
            企业健康分析
            <span className="ops-title-dot" />
          </h1>
          <p>看见人群的健康全貌，让健康管理更有方向。</p>
        </div>
        <div className="ops-heading-icon">
          <BarChart3 size={28} />
        </div>
      </div>
      <Banner>
        所有客户与指标均为合成演示数据。生活方式、职业等维度为预置样本，图表不能用于临床或真实企业决策。
      </Banner>
      <div className="ops-tabbar">
        {[
          ["analytics", "人群健康分析"],
          ["units", "工作单位管理"],
          ["groups", "工作分组"],
          ["families", "家庭客户"],
        ].map(([key, title]) => (
          <button
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
          >
            {title}
          </button>
        ))}
      </div>
      {tab !== "analytics" ? (
        <RecordWorkspace
          spec={
            tab === "units"
              ? unitSpec
              : tab === "groups"
                ? groupSpec
                : familySpec
          }
        />
      ) : (
        <>
          <div className="health-cohort-filters">
            <label>
              <Building2 size={16} />
              <select
                aria-label="筛选企业"
                value={company}
                onChange={(e) => {
                  setCompany(e.target.value);
                  setGenerated(false);
                }}
              >
                <option>所有单位</option>
                {[
                  ...new Set<string>(state.patients.map((p: Row) => p.company)),
                ].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <select
              aria-label="筛选性别"
              value={sex}
              onChange={(e) => {
                setSex(e.target.value);
                setGenerated(false);
              }}
            >
              {["全部性别", "男", "女"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <select
              aria-label="筛选年龄"
              value={age}
              onChange={(e) => {
                setAge(e.target.value);
                setGenerated(false);
              }}
            >
              {["所有年龄", "35 岁以下", "35–49 岁", "50 岁及以上"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <span />
            <button
              className="btn"
              onClick={() =>
                downloadCsv(`${company}_${dimension}人群分析`, series, [
                  field("name", "分类"),
                  field("count", "本期人数"),
                  field("previous", "上期合成人数"),
                  field("share", "本期占比百分比"),
                ])
              }
            >
              <ArrowDownToLine size={16} />
              导出报表
            </button>
            <button
              className="btn btn-primary"
              onClick={() =>
                setReport({
                  date: dateNow(),
                  company,
                  dimension,
                  people: people.length,
                  series,
                  high: high.length,
                  sex,
                  age,
                })
              }
            >
              <FileText size={16} />
              生成分析报告
            </button>
          </div>
          <Metrics
            items={[
              {
                label: "纳入分析人群",
                value: people.length,
                note: company,
                icon: Users,
              },
              {
                label: "重点关注人群",
                value: high.length,
                note: "A / B 类合成标识",
                icon: HeartPulse,
              },
              {
                label: "已建立体检记录",
                value: people.filter((p: Row) =>
                  state.appointments.some((a: Row) => a.patientId === p.id),
                ).length,
                note: "来自共享体检订单",
                icon: FileText,
              },
              {
                label: "已完成随访",
                value: completed,
                note: "对应人群的完成任务",
                icon: CheckCircle2,
              },
            ]}
          />
          <div className="health-analytics-grid">
            <section className="panel ops-panel">
              <div className="ops-panel-title">
                <div>
                  <h2>人群分布洞察</h2>
                  <p>选择分析维度，图表与名单随筛选条件联动</p>
                </div>
                <label className="health-compare">
                  <input
                    type="checkbox"
                    checked={compare}
                    onChange={(e) => setCompare(e.target.checked)}
                  />
                  对比上期样本
                </label>
              </div>
              <div className="health-dimensions">
                {dimensions.map((d) => (
                  <button
                    key={d}
                    className={dimension === d ? "active" : ""}
                    onClick={() => setDimension(d)}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <div className="health-chart">
                <div className="health-chart-legend">
                  <span>
                    <i />
                    本期合成样本
                  </span>
                  {compare && (
                    <span>
                      <i />
                      上期合成样本
                    </span>
                  )}
                </div>
                {series.map((s) => (
                  <div className="health-bar-row" key={s.name}>
                    <span>{s.name}</span>
                    <div>
                      <div className="health-bar-track">
                        <div
                          style={{
                            width: `${s.share}%`,
                            minWidth: s.count ? "8px" : "0",
                          }}
                        />
                        <b>{s.count} 人</b>
                      </div>
                      {compare && (
                        <div className="health-bar-track previous">
                          <div
                            style={{
                              width: `${people.length ? (s.previous / people.length) * 100 : 0}%`,
                              minWidth: s.previous ? "8px" : "0",
                            }}
                          />
                          <b>{s.previous} 人</b>
                        </div>
                      )}
                    </div>
                    <strong>{s.share}%</strong>
                  </div>
                ))}
                {!people.length && (
                  <div className="ops-empty">
                    <BarChart3 size={36} />
                    <h3>当前筛选无数据</h3>
                  </div>
                )}
                <p className="health-chart-note">
                  样本量：{people.length} 人 · 同一客户仅计入一次 ·
                  演示对比不代表真实趋势
                </p>
              </div>
            </section>
            <aside className="panel health-insight-card">
              <div className="health-insight-icon">
                <Target size={27} />
              </div>
              <span className="ops-eyebrow">COHORT WORKSPACE</span>
              <h2>把洞察转为行动</h2>
              <p>
                当前筛选中有 <strong>{high.length}</strong>{" "}
                位客户带有重点关注标识。可一键为尚无开放任务的客户建立随访。
              </p>
              <div className="health-insight-number">
                {people.length
                  ? Math.round((high.length / people.length) * 100)
                  : 0}
                <small>%</small>
              </div>
              <small>重点关注人群占比</small>
              <button
                className="btn btn-primary health-full"
                disabled={generated || !high.length}
                onClick={() => {
                  const target = high.filter(
                    (p: Row) =>
                      !state.tasks.some(
                        (t: Row) =>
                          t.patientId === p.id && t.status !== "已完成",
                      ),
                  );
                  target.forEach((p: Row) =>
                    act({
                      type: "ADD_TASK",
                      payload: {
                        title: `${company === "所有单位" ? "企业" : company}健康随访`,
                        patientId: p.id,
                        owner: "陈晓",
                        risk: p.risk,
                        date: dateNow(),
                        period: "30 天",
                      },
                    }),
                  );
                  setNotice(
                    target.length
                      ? `已为 ${target.length} 人创建关联随访任务`
                      : "所有重点客户已有开放随访任务，无需重复创建",
                  );
                  setGenerated(true);
                }}
              >
                <Plus size={16} />
                {generated ? "已核对随访任务" : "为重点人群创建随访"}
              </button>
              {notice && <div className="ops-feedback">{notice}</div>}
              <div className="health-insight-foot">
                <ShieldCheck size={17} />
                <p>分组依据为演示规则，正式随访需由服务团队确认。</p>
              </div>
            </aside>
          </div>
          <section className="panel ops-panel health-cohort-table">
            <div className="ops-panel-title">
              <div>
                <h2>筛选人群明细</h2>
                <p>与本期图表口径保持一致</p>
              </div>
              <Tag value={`${people.length} 位客户`} />
            </div>
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>客户</th>
                    <th>性别 / 年龄</th>
                    <th>工作单位</th>
                    <th>{dimension}</th>
                    <th>关注标识</th>
                    <th>随访任务</th>
                  </tr>
                </thead>
                <tbody>
                  {people.map((p: Row, i: number) => (
                    <tr key={p.id}>
                      <td>
                        <b>{p.name}</b>
                        <small className="ops-block">{p.id}</small>
                      </td>
                      <td>
                        {p.sex} / {p.age} 岁
                      </td>
                      <td>{p.company}</td>
                      <td>
                        {cohortLabel(
                          p,
                          state.patients.findIndex((x: Row) => x.id === p.id),
                          dimension,
                        )}
                      </td>
                      <td>
                        <Tag value={p.risk} />
                      </td>
                      <td>
                        {
                          state.tasks.filter((t: Row) => t.patientId === p.id)
                            .length
                        }{" "}
                        项
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
      {report && (
        <div className="ops-overlay">
          <section
            className="ops-modal health-report"
            role="dialog"
            aria-modal="true"
            aria-label="人群分析报告"
          >
            <div className="ops-modal-head">
              <div>
                <span className="ops-eyebrow">HEALTH POPULATION REPORT</span>
                <h2>{report.company} · 人群分析报告</h2>
                <p>
                  {report.date} · {report.sex} · {report.age}
                </p>
              </div>
              <button
                className="ops-icon-btn"
                aria-label="关闭分析报告"
                onClick={() => setReport(null)}
              >
                <X />
              </button>
            </div>
            <div className="health-task-detail">
              <Banner>
                合成数据报告，仅用于功能演示，不构成医疗建议或真实人群风险结论。
              </Banner>
              <h3>分析摘要</h3>
              <p>
                按当前条件纳入 {report.people} 人。分析维度为「
                {report.dimension}」，重点关注标识客户 {report.high} 人。
              </p>
              {report.series.map((s: Row) => (
                <div className="health-answer-summary" key={s.name}>
                  <div>
                    <span>{s.name}</span>
                    <b>
                      {s.count} 人 / {s.share}%
                    </b>
                  </div>
                </div>
              ))}
              <h3>统计口径</h3>
              <p>
                本期来自当前浏览器中的客户样本。非基础档案维度及上期数据使用预置合成分类。小样本不宜外推，正式分析需经数据核验。
              </p>
            </div>
            <div className="ops-modal-actions">
              <button
                className="btn"
                onClick={() =>
                  downloadCsv("企业健康分析报告", report.series, [
                    field("name", "分类"),
                    field("count", "人数"),
                    field("share", "占比"),
                  ])
                }
              >
                <ArrowDownToLine size={16} />
                下载报告数据
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  act({
                    type: "UPSERT_RECORD",
                    payload: {
                      collection: "cohortReports",
                      record: {
                        ...report,
                        id: fid(),
                        name: `${report.company} · ${report.dimension}`,
                      },
                    },
                  });
                  setReport(null);
                  setNotice("分析报告已保存到本地演示数据");
                }}
              >
                保存分析报告
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
export default function Health({ section = "health" }: { section?: string }) {
  const [tab, setTab] = useState("profiles");
  if (section.replace(/^\//, "").startsWith("enterprise"))
    return <Enterprise />;
  return (
    <div className="ops-page">
      <div className="ops-page-heading">
        <div>
          <span className="ops-eyebrow">CONTINUOUS HEALTH MANAGEMENT</span>
          <h1>
            健康管理
            <span className="ops-title-dot" />
          </h1>
          <p>一份档案，持续守护。从体检发现到全周期健康管理。</p>
        </div>
        <div className="ops-heading-icon">
          <HeartPulse size={29} />
        </div>
      </div>
      <Banner>
        合成档案与教育性演示 ·
        不使用真实患者资料，不生成真实临床评估、诊断或处方。
      </Banner>
      <div className="ops-tabbar">
        {[
          ["profiles", "客户健康档案"],
          ["followup", "干预随访"],
          ["assessments", "风险评估"],
          ["plans", "健康计划"],
          ["templates", "方案与词条"],
          ["groups", "人群分组"],
        ].map(([key, title]) => (
          <button
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
          >
            {title}
          </button>
        ))}
      </div>
      {tab === "profiles" ? (
        <Profiles />
      ) : tab === "followup" ? (
        <Followup />
      ) : tab === "assessments" ? (
        <Assessments />
      ) : (
        <RecordWorkspace
          spec={
            tab === "plans"
              ? planSpec
              : tab === "templates"
                ? templatesSpec
                : groupSpec
          }
        />
      )}
    </div>
  );
}

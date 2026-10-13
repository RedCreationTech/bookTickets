import { useEffect, useMemo, useRef, useState } from "react";
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
  useCollection,
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
    field("version", "模板版本", "text" as any, undefined, false),
    field("population", "适用人群", "select", [
      "成人",
      "儿童",
      "孕产妇",
      "精神卫生管理",
      "通用",
    ]),
    field("owner", "维护人员"),
    field("description", "模板内容", "textarea"),
    field(
      "unitsText",
      "执行单元（每行：天数|任务标题）",
      "textarea",
      undefined,
      false,
    ),
    field(
      "recheckItems",
      "再检资料项目（逗号分隔）",
      "textarea",
      undefined,
      false,
    ),
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
      unitsText: "0|登记基线\n7|健康知识教育\n30|回访与记录",
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
      unitsText: "0|日常活动教育记录",
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
templatesSpec.seeds.push(
  {
    id: "HT1004",
    name: "个体目标记录词条",
    category: "处方词条",
    population: "通用",
    owner: "健康管理科",
    description: "按专业人员已经确认的个体目标记录执行情况；仅作教育演示。",
    status: "已启用",
  },
  {
    id: "HT1005",
    name: "随访沟通词条",
    category: "干预词条",
    population: "通用",
    owner: "健康管理科",
    description:
      "询问计划执行情况并记录本人反馈，无法确认的事项交专业人员复核。",
    status: "已启用",
  },
  {
    id: "HT1006",
    name: "资料专业复核提醒",
    category: "评估医嘱",
    population: "通用",
    owner: "健康管理科",
    description: "本地合成资料需由专业人员复核，不自动推导临床决定。",
    status: "已启用",
  },
  {
    id: "HT1007",
    name: "报告资料再核对",
    category: "再检推荐",
    population: "通用",
    owner: "健康管理科",
    description: "为专业人员创建资料复核任务，不代表实际推荐检查。",
    recheckItems: "历史报告核对,指标记录复核",
    status: "已启用",
  },
  {
    id: "HT1008",
    name: "非药物健康教育处方模板",
    category: "健康处方模板",
    population: "成人",
    owner: "健康管理科",
    description:
      "合成非药物教育模板；记录医护人员确认的目标及执行反馈，不给出实际剂量或强度。",
    unitsText: "0|确认教育目标\n30|复核执行记录",
    status: "已启用",
  },
);
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
                if (editor.knownConditionsText !== undefined)
                  editor.health = {
                    ...(editor.health ?? getPatientHealth(editor)),
                    knownConditions: String(editor.knownConditionsText)
                      .split(/[，,]/)
                      .map((x: string) => x.trim())
                      .filter(Boolean),
                  };
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
                <div className="ops-span2">
                  <h3 style={{ fontSize: 13 }}>合成指标与生活方式档案</h3>
                  <p style={{ fontSize: 11, color: "#8a9b90" }}>
                    以下字段直接用于企业人群统计；留空表示缺失。
                  </p>
                </div>
                <FormFields
                  fields={healthFields.map((f) => {
                    const category =
                      f.key === "occupation"
                        ? "职业"
                        : f.key === "education"
                          ? "教育程度"
                          : null;
                    const custom = category
                      ? (state.records.dictionaries || [])
                          .filter(
                            (d: Row) =>
                              d.category === category && d.status !== "已停用",
                          )
                          .map((d: Row) =>
                            String(d.name).split("·").at(-1)?.trim(),
                          )
                      : [];
                    return custom.length
                      ? {
                          ...f,
                          options: [
                            ...new Set([...(f.options || []), ...custom]),
                          ],
                        }
                      : f;
                  })}
                  draft={editor.health ?? getPatientHealth(editor)}
                  setDraft={(health) => setEditor({ ...editor, health })}
                />
                <label className="ops-field">
                  <span>档案完整性</span>
                  <select
                    value={String(
                      (editor.health ?? getPatientHealth(editor))
                        .archiveComplete ?? false,
                    )}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        health: {
                          ...(editor.health ?? getPatientHealth(editor)),
                          archiveComplete: e.target.value === "true",
                        },
                      })
                    }
                  >
                    <option value="false">资料待补充</option>
                    <option value="true">档案完整</option>
                  </select>
                </label>
                <label className="ops-field">
                  <span>既往状况记录（合成，逗号分隔）</span>
                  <input
                    aria-label="既往状况记录"
                    value={
                      editor.knownConditionsText ??
                      (getPatientHealth(editor).knownConditions || []).join(",")
                    }
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        knownConditionsText: e.target.value,
                      })
                    }
                  />
                </label>
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
  const statuses = ["待处理", "进行中", "已完成", "已取消"];
  const selected = detail
    ? state.tasks.find((t: Row) => t.id === detail.id)
    : null;
  const update = (t: Row, status: string) => {
    const actor = state.config.operatorName || state.config.role || "admin";
    const lock = (state.records.followupLocks || []).find(
      (l: Row) => l.patientId === t.patientId && l.status === "locked",
    );
    if (lock && lock.owner !== actor) {
      setDetail(t);
      setError(`客户已由 ${lock.owner} 锁定，当前人员不能处理。`);
      return;
    }
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
                      {!["已完成", "已取消"].includes(s) ? (
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
const healthSeed: Record<string, Row> = {
  P001: {
    systolic: 128,
    diastolic: 82,
    totalCholesterol: 5.4,
    fastingGlucose: 5.8,
    bmi: 23.6,
    smoking: "无吸烟记录",
    occupation: "技术人员",
    education: "本科",
    diet: "规律",
    exercise: "偶尔",
    alcohol: "偶尔",
    archiveComplete: true,
    archiveCount: 3,
    knownConditions: [],
  },
  P002: {
    systolic: 118,
    diastolic: 76,
    totalCholesterol: 4.6,
    fastingGlucose: 5.1,
    bmi: 21.8,
    smoking: "无吸烟记录",
    occupation: "设计人员",
    education: "本科",
    diet: "规律",
    exercise: "规律",
    alcohol: "无",
    archiveComplete: true,
    archiveCount: 2,
    knownConditions: [],
  },
  P003: {
    systolic: 148,
    diastolic: 94,
    totalCholesterol: 6.2,
    fastingGlucose: 8.9,
    bmi: 27.2,
    smoking: "有吸烟记录",
    occupation: "管理人员",
    education: "专科",
    diet: "待改善",
    exercise: "较少",
    alcohol: "偶尔",
    archiveComplete: true,
    archiveCount: 4,
    knownConditions: ["合成既往状况记录A"],
  },
  P004: {
    systolic: 112,
    diastolic: 72,
    totalCholesterol: 4.5,
    fastingGlucose: 4.9,
    bmi: 19.6,
    smoking: "无吸烟记录",
    occupation: "行政人员",
    education: "研究生",
    diet: "规律",
    exercise: "规律",
    alcohol: "无",
    archiveComplete: false,
    archiveCount: 1,
    knownConditions: [],
  },
  P005: {
    systolic: 138,
    diastolic: 86,
    totalCholesterol: 5.8,
    fastingGlucose: 6.4,
    bmi: 25.4,
    smoking: "无吸烟记录",
    occupation: "生产人员",
    education: "专科",
    diet: "待改善",
    exercise: "较少",
    alcohol: "无",
    archiveComplete: true,
    archiveCount: 3,
    knownConditions: ["合成既往状况记录B"],
  },
  P006: {
    systolic: 126,
    diastolic: 80,
    totalCholesterol: 4.8,
    fastingGlucose: 5.3,
    bmi: 23.1,
    smoking: "有吸烟记录",
    occupation: "生产人员",
    education: "专科",
    diet: "规律",
    exercise: "偶尔",
    alcohol: "偶尔",
    archiveComplete: true,
    archiveCount: 2,
    knownConditions: [],
  },
  P007: {
    systolic: 134,
    diastolic: 84,
    totalCholesterol: 5.2,
    fastingGlucose: 6.1,
    bmi: 24.6,
    smoking: "无吸烟记录",
    occupation: "设计人员",
    education: "本科",
    diet: "待改善",
    exercise: "偶尔",
    alcohol: "偶尔",
    archiveComplete: false,
    archiveCount: 2,
    knownConditions: [],
  },
  P008: {
    systolic: 116,
    diastolic: 74,
    totalCholesterol: 4.4,
    fastingGlucose: 5,
    bmi: 21.2,
    smoking: "无吸烟记录",
    occupation: "行政人员",
    education: "本科",
    diet: "规律",
    exercise: "规律",
    alcohol: "无",
    archiveComplete: true,
    archiveCount: 1,
    knownConditions: [],
  },
};
export const getPatientHealth = (p: Row) => p.health ?? healthSeed[p.id] ?? {};
const healthFields: FieldSpec[] = [
  field("systolic", "收缩压 / mmHg", "number", undefined, false),
  field("diastolic", "舒张压 / mmHg", "number", undefined, false),
  field("totalCholesterol", "总胆固醇 / mmol/L", "number", undefined, false),
  field("fastingGlucose", "空腹血糖 / mmol/L", "number", undefined, false),
  field("bmi", "体重指数 BMI", "number", undefined, false),
  field(
    "smoking",
    "吸烟记录",
    "select",
    ["无吸烟记录", "有吸烟记录", "已戒烟"],
    false,
  ),
  field(
    "occupation",
    "职业",
    "select",
    ["技术人员", "设计人员", "行政人员", "生产人员", "管理人员"],
    false,
  ),
  field(
    "education",
    "文化程度",
    "select",
    ["高中", "专科", "本科", "研究生"],
    false,
  ),
  field("diet", "膳食自评", "select", ["规律", "待改善"], false),
  field("exercise", "运动频率", "select", ["规律", "偶尔", "较少"], false),
  field("alcohol", "饮酒记录", "select", ["无", "偶尔", "经常"], false),
  field("archiveCount", "建档次数", "number", undefined, false),
];
type DemoQuestion = [string, string, string[]];
const assessmentForms: Record<string, DemoQuestion[]> = {
  慢病风险教育: [
    ["activity", "日常活动频率", ["规律", "偶尔", "较少"]],
    ["sleep", "近期自评睡眠", ["良好", "一般", "待改善"]],
    ["diet", "自评饮食规律", ["规律", "一般", "不规律"]],
    ["smoke", "是否有吸烟习惯", ["否", "是"]],
    ["followup", "是否了解报告随访安排", ["是", "否"]],
  ],
  心理健康自评流程: [
    [
      "mood",
      "近一周情绪舒适感",
      ["总是舒适", "大多舒适", "偶尔舒适", "很少舒适"],
    ],
    ["stress", "近一周压力感受频率", ["无", "偶尔", "多次", "几乎每天"]],
    ["energy", "日常精力自评", ["充足", "一般", "偏少", "很少"]],
    ["connection", "可获得的交流支持", ["充分", "基本充分", "较少", "暂无"]],
  ],
  中医体质辨识流程: [
    ["cold", "怕冷感受频率", ["无", "偶尔", "经常"]],
    ["warm", "怕热感受频率", ["无", "偶尔", "经常"]],
    ["tired", "容易疲倦感受", ["无", "偶尔", "经常"]],
    ["digest", "餐后舒适感变化", ["无", "偶尔", "经常"]],
    ["dry", "口干感受频率", ["无", "偶尔", "经常"]],
    ["rest", "休息后精力恢复", ["充分", "一般", "较少"]],
  ],
  设备慢病评估套餐: [
    ["deviceSource", "测量资料来源", ["演示血压设备", "演示综合设备"]],
    ["measurementState", "本次测量资料完整性", ["完整", "缺少部分字段"]],
    ["deviceConfirmed", "已核对合成设备编号", ["是", "否"]],
  ],
  机构团检报告: [
    ["scope", "机构汇总口径", ["全体样本", "重点关注样本"]],
    ["archiveCheck", "档案完整性复核", ["已核对", "待核对"]],
  ],
};
export function scoreDemoAssessment(
  type: string,
  answers: Row,
  metrics: Row = {},
) {
  const qs = assessmentForms[type] || [];
  const raw = qs.map(([key, , options]) =>
    Math.max(0, options.indexOf(answers[key])),
  );
  let dimensions: Row[];
  if (type === "中医体质辨识流程")
    dimensions = [
      { name: "寒热感受演示维度", value: raw[0] + raw[1], max: 4 },
      { name: "精力作息演示维度", value: raw[2] + raw[5], max: 4 },
      { name: "消化与口干感受演示维度", value: raw[3] + raw[4], max: 4 },
    ];
  else if (type === "心理健康自评流程")
    dimensions = [
      { name: "情绪与压力演示分值", value: raw[0] + raw[1], max: 6 },
      { name: "精力与支持演示分值", value: raw[2] + raw[3], max: 6 },
    ];
  else if (type === "设备慢病评估套餐")
    dimensions = [
      {
        name: "测量字段已采集数",
        value: ["systolic", "diastolic", "fastingGlucose", "bmi"].filter(
          (k) =>
            metrics[k] !== "" &&
            metrics[k] !== undefined &&
            Number.isFinite(Number(metrics[k])),
        ).length,
        max: 4,
      },
    ];
  else if (type === "机构团检报告")
    dimensions = [
      {
        name: "纳入客户数",
        value: Number(metrics.people || 0),
        max: Number(metrics.people || 0),
      },
      {
        name: "完整档案数",
        value: Number(metrics.complete || 0),
        max: Number(metrics.people || 0),
      },
    ];
  else
    dimensions = [
      {
        name: "生活方式教育关注项",
        value: raw.reduce((a, b) => a + (b > 0 ? 1 : 0), 0),
        max: qs.length,
      },
    ];
  return {
    modelVersion: "SYNTHETIC-EDU-2",
    total: dimensions.reduce((s, d) => s + d.value, 0),
    max: dimensions.reduce((s, d) => s + d.max, 0),
    dimensions,
    disclaimer:
      "独立合成演示计分，不是已验证临床量表，不代表医学评估结论，不输出心理诊断或中医体质诊断。",
  };
}
function Assessments() {
  const { state, act } = useDemo() as any;
  const [patient, setPatient] = useState(state.patients[0]?.id);
  const [type, setType] = useState("慢病风险教育");
  const defaultAnswers = (t: string) =>
    Object.fromEntries(
      assessmentForms[t].map(([key, , opts]) => [
        key,
        t === "慢病风险教育" && ["activity", "sleep", "diet"].includes(key)
          ? opts[1]
          : opts[0],
      ]),
    );
  const [answers, setAnswers] = useState<Row>(defaultAnswers("慢病风险教育"));
  const [metrics, setMetrics] = useState<Row>(
    getPatientHealth(state.patients[0] || {}),
  );
  const [company, setCompany] = useState(state.patients[0]?.company || "");
  const [generated, setGenerated] = useState<Row | null>(null);
  const [saved, setSaved] = useState(false);
  const [review, setReview] = useState("");
  const questions = assessmentForms[type];
  const reports = (state.records.assessments || []).filter(
    (r: Row) => r.patientId === patient,
  );
  const changeType = (t: string) => {
    setType(t);
    setAnswers(defaultAnswers(t));
    setGenerated(null);
    setSaved(false);
  };
  return (
    <div className="health-assess-grid">
      <section className="panel ops-panel">
        <div className="ops-panel-title">
          <div>
            <h2>风险评估工作台</h2>
            <p>不同评估类型使用独立字段、演示维度与计分版本。</p>
          </div>
          <ClipboardList size={22} />
        </div>
        <div className="health-assess-form">
          <div className="ops-form-grid">
            <label className="ops-field">
              <span>评估客户</span>
              <select
                aria-label="评估客户"
                value={patient}
                onChange={(e) => {
                  setPatient(e.target.value);
                  setMetrics(
                    getPatientHealth(
                      state.patients.find(
                        (p: Row) => p.id === e.target.value,
                      ) || {},
                    ),
                  );
                  setGenerated(null);
                  setSaved(false);
                }}
              >
                {state.patients.map((p: Row) => (
                  <option value={p.id} key={p.id}>
                    {p.name} · {p.profileType || "成人档案"}
                  </option>
                ))}
              </select>
            </label>
            <label className="ops-field">
              <span>评估类型</span>
              <select
                aria-label="评估类型"
                value={type}
                onChange={(e) => changeType(e.target.value)}
              >
                {Object.keys(assessmentForms).map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
          </div>
          <Banner>
            心理、中医、慢病计分均为明确标注的非临床模型，只验证不同表单、算法、存档与复核流程。
          </Banner>
          {type === "设备慢病评估套餐" && (
            <div className="ops-form-grid">
              <FormFields
                fields={healthFields
                  .slice(0, 5)
                  .filter((f) => f.key !== "totalCholesterol")}
                draft={metrics}
                setDraft={(m) => {
                  setMetrics(m);
                  setGenerated(null);
                  setSaved(false);
                }}
              />
            </div>
          )}
          {type === "机构团检报告" && (
            <label className="ops-field" style={{ marginTop: 16 }}>
              <span>团检机构</span>
              <select
                aria-label="评估团检机构"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              >
                {[
                  ...new Set<string>(state.patients.map((p: Row) => p.company)),
                ].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          )}
          {questions.map(([key, label, opts], i) => (
            <div className="health-question" key={key}>
              <label>
                <span>{String(i + 1).padStart(2, "0")}</span>
                {label}
              </label>
              <div style={{ flexWrap: "wrap" }}>
                {opts.map((o) => (
                  <button
                    key={o}
                    className={answers[key] === o ? "selected" : ""}
                    onClick={() => {
                      setAnswers({ ...answers, [key]: o });
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
              const cohort = state.patients.filter(
                (p: Row) =>
                  p.company === company &&
                  (answers.scope !== "重点关注样本" ||
                    ["A类", "B类"].includes(p.risk)),
              );
              const snapshot =
                type === "机构团检报告"
                  ? {
                      people: cohort.length,
                      complete: cohort.filter(
                        (p: Row) => getPatientHealth(p).archiveComplete,
                      ).length,
                      company,
                      patientIds: cohort.map((p: Row) => p.id),
                    }
                  : metrics;
              const score = scoreDemoAssessment(type, answers, snapshot);
              setGenerated({
                id: fid(),
                name: `${type} · ${state.patients.find((p: Row) => p.id === patient)?.name}`,
                patientId: patient,
                category: type,
                date: dateNow(),
                status: "待专业复核",
                answers: { ...answers },
                metricSnapshot: { ...snapshot },
                score,
                questionSnapshot: questions,
                description: `已完成 ${questions.length} 项 ${type} 数据采集。${score.disclaimer}`,
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
        <section className="panel ops-panel">
          <div className="ops-panel-title">
            <div>
              <h2>评估报告</h2>
              <p>表单答案、输入指标及演示算法结果均保存快照</p>
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
                {(generated.score?.dimensions || []).map((d: Row) => (
                  <div key={d.name}>
                    <span>{d.name}</span>
                    <b>
                      {d.value} / {d.max}
                    </b>
                  </div>
                ))}
                {(generated.questionSnapshot || questions).map(
                  ([key, label]: DemoQuestion) => (
                    <div key={key}>
                      <span>{label}</span>
                      <b>{generated.answers[key]}</b>
                    </div>
                  ),
                )}
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
                <>
                  <label
                    className="ops-field"
                    style={{ marginTop: 16, textAlign: "left" }}
                  >
                    <span>专业复核记录（合成）</span>
                    <textarea
                      aria-label="评估复核记录"
                      value={review}
                      onChange={(e) => setReview(e.target.value)}
                      placeholder="记录资料核验结果，不自动添加诊疗建议"
                    />
                  </label>
                  <button
                    className="btn health-full"
                    disabled={!review.trim()}
                    style={{ marginTop: 10 }}
                    onClick={() => {
                      const next = {
                        ...generated,
                        status: "已复核（模拟）",
                        review,
                        reviewedAt: dateNow(),
                      };
                      act({
                        type: "UPSERT_RECORD",
                        payload: { collection: "assessments", record: next },
                      });
                      setGenerated(next);
                      setReview("");
                    }}
                  >
                    保存专业复核记录
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="ops-empty">
              <ClipboardList size={38} />
              <h3>等待采集结果</h3>
              <p>完成左侧独立表单后生成演示报告</p>
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
                <small>
                  {r.date} · {r.score?.modelVersion || "旧版"} · {r.status}
                </small>
              </div>
              <button
                className="ops-text-btn"
                onClick={() => {
                  setGenerated(r);
                  setType(r.category);
                  setAnswers(r.answers);
                  setSaved(true);
                }}
              >
                查看
              </button>
            </div>
          ))}
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
export function cohortLabel(
  p: Row,
  _index: number,
  dimension: string,
  previous = false,
) {
  const h = previous ? p.healthPrevious : getPatientHealth(p);
  if (previous && !h) return "无上期数据";
  if (dimension === "年龄")
    return p.age < 35 ? "35 岁以下" : p.age < 50 ? "35–49 岁" : "50 岁及以上";
  if (dimension === "性别") return p.sex || "待补充";
  if (dimension === "危险因素")
    return p.risk === "A类"
      ? "重点复核"
      : p.risk === "B类"
        ? "持续关注"
        : "一般管理";
  if (!h) return "待补充";
  const num = (key: string) =>
    h[key] !== undefined && h[key] !== "" && Number.isFinite(Number(h[key]))
      ? Number(h[key])
      : null;
  switch (dimension) {
    case "血压":
      return num("systolic") === null || num("diastolic") === null
        ? "待补充"
        : num("systolic")! >= 140 || num("diastolic")! >= 90
          ? "≥140/90 数值组"
          : "＜140/90 数值组";
    case "血脂":
      return num("totalCholesterol") === null
        ? "待补充"
        : num("totalCholesterol")! < 5
          ? "＜5.0 mmol/L"
          : num("totalCholesterol")! < 6
            ? "5.0–5.9 mmol/L"
            : "≥6.0 mmol/L";
    case "血糖":
      return num("fastingGlucose") === null
        ? "待补充"
        : num("fastingGlucose")! < 6
          ? "＜6.0 mmol/L"
          : num("fastingGlucose")! < 7
            ? "6.0–6.9 mmol/L"
            : "≥7.0 mmol/L";
    case "体重":
      return num("bmi") === null
        ? "待补充"
        : num("bmi")! < 20
          ? "BMI ＜20"
          : num("bmi")! < 25
            ? "BMI 20–24.9"
            : "BMI ≥25";
    case "吸烟":
      return h.smoking || "待补充";
    case "慢病分类":
      return !Array.isArray(h.knownConditions)
        ? "待补充"
        : h.knownConditions.length
          ? h.knownConditions.join("、")
          : "未记录既往状况";
    case "建档情况":
      return h.archiveComplete === undefined
        ? "待补充"
        : h.archiveComplete
          ? "档案完整"
          : "资料待补充";
    case "职业":
      return h.occupation || "待补充";
    case "文化程度":
      return h.education || "待补充";
    case "膳食":
      return h.diet || "待补充";
    case "运动":
      return h.exercise || "待补充";
    case "饮酒":
      return h.alcohol || "待补充";
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
        所有客户与指标均为合成演示数据。图表按客户档案中稳定保存的指标和生活方式字段分类；数值区间仅为演示统计分箱，不是临床判断。
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
                    <th>建档次数</th>
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
                      <td>{getPatientHealth(p).archiveCount ?? "未记录"}</td>
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
                本期来自当前浏览器中的客户样本。所有维度来自客户档案字段；未提供字段或上期记录时明确列为缺失。分箱是描述性统计，不代表临床风险，小样本不可外推。
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
const shiftDay = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
export function parsePlanUnits(text: string) {
  return text
    .split(/\r?\n/)
    .filter((s) => s.trim())
    .map((line, i) => {
      const [day, ...title] = line.split("|");
      return {
        id: `U${i + 1}`,
        day: Number(day),
        title: title.join("|").trim(),
      };
    });
}
function PlanComposer() {
  const { state, act } = useDemo() as any;
  const templates = useCollection(templatesSpec).rows;
  useCollection(planSpec);
  const [patientId, setPatientId] = useState(state.patients[0]?.id || "");
  const [templateId, setTemplateId] = useState("HT1001");
  const [terms, setTerms] = useState<string[]>([]);
  const [start, setStart] = useState(dateNow());
  const [owner, setOwner] = useState("陈晓");
  const [confirmed, setConfirmed] = useState(false);
  const [applicationComplete, setApplicationComplete] = useState(false);
  // React batches state updates; this synchronous latch also guards stale handlers.
  const applicationSubmitted = useRef(false);
  const [notice, setNotice] = useState("");
  const [selectedPlan, setSelectedPlan] = useState("");
  const [reason, setReason] = useState("");
  const person = state.patients.find((p: Row) => p.id === patientId);
  const template = templates.find((t) => t.id === templateId);
  const termRows = templates.filter(
    (t) =>
      ["处方词条", "干预词条", "评估医嘱", "再检推荐"].includes(t.category) &&
      t.status === "已启用",
  );
  const units = parsePlanUnits(
    template?.unitsText || "0|登记基线\n30|计划结果回访",
  );
  const chosenTerms = termRows.filter((t) => terms.includes(t.id));
  const rechecks = [
    ...new Set<string>(
      chosenTerms.flatMap((t) =>
        String(t.recheckItems || "")
          .split(/[，,]/)
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ),
  ];
  const plans = (state.records.healthPlans || []).filter(
    (p: Row) => p.patientId === patientId,
  );
  const selected = plans.find((p: Row) => p.id === selectedPlan) || plans[0];
  const linked = state.tasks.filter((t: Row) => t.planId === selected?.id);
  const allowedPopulation = person?.profileType?.includes("儿童")
    ? "儿童"
    : person?.profileType?.includes("孕产")
      ? "孕产妇"
      : person?.profileType?.includes("精神")
        ? "精神卫生管理"
        : "成人";
  const valid =
    !!template &&
    template.status === "已启用" &&
    [allowedPopulation, "通用"].includes(template.population) &&
    units.length > 0 &&
    units.every(
      (u) => Number.isInteger(u.day) && u.day >= 0 && u.day <= 365 && u.title,
    );
  const create = () => {
    if (applicationSubmitted.current) return;
    if (!valid || !confirmed || !owner.trim() || !start) {
      setNotice("请核对适用人群、执行单元、负责人及专业复核确认。");
      return;
    }
    applicationSubmitted.current = true;
    setApplicationComplete(true);
    const id = fid(),
      allUnits = [
        ...units,
        ...rechecks.map((title, i) => ({
          id: `R${i + 1}`,
          day: 30,
          title: `再检资料复核 · ${title}`,
        })),
      ];
    const snapshot = JSON.parse(JSON.stringify(template));
    const plan = {
      id,
      name: `${template.name} · ${person.name}`,
      patient: person.name,
      patientId,
      category:
        template.category === "健康处方模板" ? "非药物教育" : "成人健康管理",
      owner,
      date: start,
      period: `${Math.max(...allUnits.map((u) => u.day))} 天`,
      description: [
        template.description,
        ...chosenTerms.map((t) => `${t.category}：${t.description}`),
      ].join("\n"),
      status: "进行中",
      templateId,
      sourceVersion: template.updatedAt || "seed-v1",
      templateSnapshot: snapshot,
      termsSnapshot: JSON.parse(JSON.stringify(chosenTerms)),
      units: allUnits.map((u) => ({
        ...u,
        date: shiftDay(start, u.day),
        taskId: `${id}-${u.id}`,
      })),
      history: [{ at: dateNow(), text: "由启用模板应用，已确认合成专业复核" }],
    };
    act({
      type: "UPSERT_RECORD",
      payload: { collection: "healthPlans", record: plan },
    });
    allUnits.forEach((u) =>
      act({
        type: "ADD_TASK",
        payload: {
          id: `${id}-${u.id}`,
          planId: id,
          unitId: u.id,
          title: `${template.name} · ${u.title}`,
          patientId,
          owner,
          date: shiftDay(start, u.day),
          period: `${u.day} 天`,
          risk: person.risk,
          description: plan.description,
        },
      }),
    );
    if (
      template.category === "健康处方模板" ||
      chosenTerms.some((t) => t.category === "处方词条")
    )
      act({
        type: "UPSERT_RECORD",
        payload: {
          collection: "medicalRecords",
          record: {
            id: `RX-${id}`,
            name: `${person.name} · 模板应用记录`,
            patient: person.name,
            patientId,
            category: "非药物处方记录",
            owner,
            date: start,
            description: plan.description,
            status: "已复核",
            sourcePlanId: id,
            templateSnapshot: snapshot,
          },
        },
      });
    setSelectedPlan(id);
    setConfirmed(false);
    setNotice(
      `已应用模板，生成 1 项计划、${allUnits.length} 项关联任务${template.category === "健康处方模板" || chosenTerms.some((t) => t.category === "处方词条") ? "和 1 份处方资料记录" : ""}。`,
    );
  };
  return (
    <section className="panel ops-panel" style={{ marginBottom: 24 }}>
      <div className="ops-panel-title">
        <div>
          <h2>模板应用与执行工作台</h2>
          <p>模板、词条、再检项目会保存快照，并生成客户计划与实际随访任务。</p>
        </div>
        <Target size={22} />
      </div>
      <Banner>
        计划内容为教育性合成模板。用药、运动强度和诊疗决定必须由专业人员在真实系统另行确认。
      </Banner>
      <div className="ops-form-grid">
        <label className="ops-field">
          <span>计划服务客户</span>
          <select
            aria-label="计划服务客户"
            value={patientId}
            onChange={(e) => {
              setPatientId(e.target.value);
              setSelectedPlan("");
              setConfirmed(false);
            }}
          >
            {state.patients.map((p: Row) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="ops-field">
          <span>应用模板</span>
          <select
            aria-label="应用计划模板"
            value={templateId}
            onChange={(e) => {
              setTemplateId(e.target.value);
              setConfirmed(false);
            }}
          >
            {templates
              .filter((t) =>
                ["健康计划模板", "健康处方模板", "计划单元"].includes(
                  t.category,
                ),
              )
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {t.status} · {t.population}
                </option>
              ))}
          </select>
        </label>
        <label className="ops-field">
          <span>计划开始日期</span>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            aria-label="计划开始日期"
          />
        </label>
        <label className="ops-field">
          <span>任务负责人</span>
          <input
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            aria-label="计划任务负责人"
          />
        </label>
        <div className="ops-span2">
          <h3 style={{ fontSize: 13 }}>选择可应用词条与再检推荐</h3>
          <div className="ops-permissions">
            {termRows.map((t) => (
              <label key={t.id}>
                <input
                  type="checkbox"
                  checked={terms.includes(t.id)}
                  onChange={(e) =>
                    setTerms(
                      e.target.checked
                        ? [...terms, t.id]
                        : terms.filter((id) => id !== t.id),
                    )
                  }
                />
                {t.name} · {t.category}
              </label>
            ))}
          </div>
        </div>
      </div>
      <div className="ops-table-wrap">
        <table className="ops-table" aria-label="计划任务预览">
          <thead>
            <tr>
              <th>执行节点</th>
              <th>生成任务</th>
              <th>日期</th>
            </tr>
          </thead>
          <tbody>
            {units.map((u) => (
              <tr key={u.id}>
                <td>第 {u.day} 天</td>
                <td>{u.title || "未填写"}</td>
                <td>
                  {Number.isFinite(u.day) && u.day >= 0 && u.day <= 365 && start
                    ? shiftDay(start, u.day)
                    : "无效"}
                </td>
              </tr>
            ))}
            {rechecks.map((r) => (
              <tr key={r}>
                <td>第 30 天</td>
                <td>再检资料复核 · {r}</td>
                <td>{start ? shiftDay(start, 30) : "未设置"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!valid && (
        <p className="ops-error" role="alert">
          模板须启用且适合当前人群；执行单元格式为「0|任务名称」，天数为 0–365
          的整数。
        </p>
      )}
      <div className="ops-modal-actions">
        <label
          style={{
            fontSize: 11,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <input
            type="checkbox"
            checked={confirmed}
            disabled={applicationComplete}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          已确认模板及词条适合本次合成演示
        </label>
        <button
          className="btn btn-primary"
          disabled={applicationComplete || !valid || !confirmed}
          onClick={create}
        >
          应用模板并生成计划任务
        </button>
        {applicationComplete && (
          <button
            className="btn"
            onClick={() => {
              applicationSubmitted.current = false;
              setApplicationComplete(false);
              setConfirmed(false);
              setNotice("已开始新的模板应用，请重新核对并确认。");
            }}
          >
            开始新的模板应用
          </button>
        )}
      </div>
      {notice && (
        <div className="ops-feedback" role="status">
          {notice}
        </div>
      )}
      {plans.length > 0 && (
        <div style={{ padding: 24 }}>
          <label className="ops-field">
            <span>已应用计划</span>
            <select
              value={selected?.id || ""}
              onChange={(e) => setSelectedPlan(e.target.value)}
              aria-label="已应用计划"
            >
              {plans.map((p: Row) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <div className="health-effect-row" style={{ padding: "20px 0" }}>
            <div>
              <span>当前状态</span>
              <strong>
                <Tag value={selected?.status} />
              </strong>
            </div>
            <div>
              <span>关联任务完成</span>
              <strong>
                {linked.filter((t: Row) => t.status === "已完成").length} /{" "}
                {linked.length}
              </strong>
            </div>
          </div>
          {linked.map((t: Row) => (
            <div className="health-attention-row" key={t.id}>
              <div>
                <b>{t.title}</b>
                <small>
                  {t.date} · {t.owner}
                </small>
              </div>
              <Tag value={t.status} />
            </div>
          ))}
          <div className="ops-inline-controls" style={{ marginTop: 18 }}>
            <input
              aria-label="计划终止原因"
              placeholder="终止计划时请填写原因"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              style={{ maxWidth: "none" }}
            />
            <button
              className="btn"
              disabled={selected?.status !== "进行中"}
              onClick={() => {
                if (!reason.trim()) {
                  setNotice("请填写计划终止原因。");
                  return;
                }
                linked
                  .filter((t: Row) => !["已完成", "已取消"].includes(t.status))
                  .forEach((t: Row) =>
                    act({
                      type: "UPDATE_TASK",
                      payload: {
                        id: t.id,
                        status: "已取消",
                        note: `计划终止：${reason}`,
                      },
                    }),
                  );
                act({
                  type: "UPSERT_RECORD",
                  payload: {
                    collection: "healthPlans",
                    record: {
                      ...selected,
                      status: "已终止",
                      stopReason: reason,
                    },
                  },
                });
                setNotice("计划已终止，未完成关联任务已取消。");
              }}
            >
              终止关联计划
            </button>
            <button
              className="btn btn-primary"
              disabled={
                !linked.length ||
                linked.some((t: Row) => t.status !== "已完成") ||
                selected?.status !== "进行中"
              }
              onClick={() => {
                act({
                  type: "UPSERT_RECORD",
                  payload: {
                    collection: "healthPlans",
                    record: {
                      ...selected,
                      status: "已完成",
                      completedAt: dateNow(),
                    },
                  },
                });
                setNotice("已根据关联任务同步完成计划。");
              }}
            >
              同步完成计划
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function GroupBuilder() {
  const { state, act } = useDemo() as any;
  const [name, setName] = useState("筛选客户健康服务组");
  const [company, setCompany] = useState("所有单位");
  const [risk, setRisk] = useState("全部风险");
  const [type, setType] = useState("全部人群");
  const [min, setMin] = useState(0);
  const [max, setMax] = useState(120);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const people = state.patients.filter(
    (p: Row) =>
      (company === "所有单位" || p.company === company) &&
      (risk === "全部风险" || p.risk === risk) &&
      (type === "全部人群" || (p.profileType || "成人档案") === type) &&
      p.age >= min &&
      p.age <= max,
  );
  const selected = people.filter((p: Row) => !excluded.includes(p.id));
  const save = (createTasks: boolean) => {
    if (!name.trim() || min > max || !selected.length) {
      setNotice("请填写分组名称、有效年龄范围并选择客户。");
      return;
    }
    const id = `GROUP-${name.trim()}`;
    const record = {
      id,
      name: name.trim(),
      category: "工作分组",
      condition: `${company} / ${risk} / ${type} / ${min}–${max} 岁`,
      owner: "陈晓",
      status: "已启用",
      description: "由可执行条件生成的客户分组",
      rule: { company, risk, type, minAge: min, maxAge: max },
      memberIds: selected.map((p: Row) => p.id),
      generatedAt: dateNow(),
    };
    act({
      type: "UPSERT_RECORD",
      payload: { collection: "healthGroups", record },
    });
    let created = 0;
    if (createTasks)
      selected.forEach((p: Row) => {
        if (
          !state.tasks.some(
            (t: Row) =>
              t.groupId === id &&
              t.patientId === p.id &&
              !["已完成", "已取消"].includes(t.status),
          )
        ) {
          act({
            type: "ADD_TASK",
            payload: {
              // Stable for the same customer and generation, including stale double-click handlers.
              id: `GROUP-TASK-${JSON.stringify([
                id,
                p.id,
                state.tasks.filter(
                  (t: Row) => t.groupId === id && t.patientId === p.id,
                ).length + 1,
              ])}`,
              title: `${name} · 分组健康教育`,
              patientId: p.id,
              groupId: id,
              owner: "陈晓",
              date: dateNow(),
              risk: p.risk,
            },
          });
          created++;
        }
      });
    setNotice(
      `已保存 ${selected.length} 人的分组${createTasks ? `，生成 ${created} 项新随访任务（自动跳过重复）` : ""}。`,
    );
  };
  return (
    <section className="panel ops-panel" style={{ marginBottom: 22 }}>
      <div className="ops-panel-title">
        <div>
          <h2>可执行人群分组</h2>
          <p>条件实时筛选并保存成员快照，可排除个别客户后建立干预任务。</p>
        </div>
      </div>
      <div className="ops-form-grid">
        <label className="ops-field">
          <span>分组名称</span>
          <input
            aria-label="规则分组名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="ops-field">
          <span>单位条件</span>
          <select
            aria-label="分组单位条件"
            value={company}
            onChange={(e) => {
              setCompany(e.target.value);
              setExcluded([]);
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
        <label className="ops-field">
          <span>风险条件</span>
          <select
            aria-label="分组风险条件"
            value={risk}
            onChange={(e) => setRisk(e.target.value)}
          >
            {["全部风险", "A类", "B类", "C类", "低风险"].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label className="ops-field">
          <span>人群入口</span>
          <select
            aria-label="分组人群条件"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            {[
              "全部人群",
              "成人档案",
              "儿童档案",
              "孕产妇档案",
              "精神卫生档案",
            ].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="ops-field">
          <span>最小年龄</span>
          <input
            type="number"
            aria-label="分组最小年龄"
            min={0}
            value={min}
            onChange={(e) => setMin(Number(e.target.value))}
          />
        </label>
        <label className="ops-field">
          <span>最大年龄</span>
          <input
            type="number"
            aria-label="分组最大年龄"
            max={120}
            value={max}
            onChange={(e) => setMax(Number(e.target.value))}
          />
        </label>
      </div>
      <div style={{ padding: "0 24px 20px" }}>
        <h3 style={{ fontSize: 13 }}>
          筛选预览 · {selected.length} / {people.length} 人
        </h3>
        <div className="ops-permissions">
          {people.map((p: Row) => (
            <label key={p.id}>
              <input
                type="checkbox"
                checked={!excluded.includes(p.id)}
                onChange={(e) =>
                  setExcluded(
                    e.target.checked
                      ? excluded.filter((id) => id !== p.id)
                      : [...excluded, p.id],
                  )
                }
              />
              {p.name} · {p.age} 岁 · {p.risk}
            </label>
          ))}
        </div>
      </div>
      <div className="ops-modal-actions">
        <button className="btn" onClick={() => save(false)}>
          保存成员分组
        </button>
        <button className="btn btn-primary" onClick={() => save(true)}>
          保存分组并生成干预任务
        </button>
      </div>
      {notice && (
        <div className="ops-feedback" role="status">
          {notice}
        </div>
      )}
    </section>
  );
}
const riskSpec: WorkspaceSpec = {
  key: "riskLevels",
  label: "异常等级",
  description: "异常等级名称和颜色同时用于档案和随访标签。",
  fields: [],
  seeds: [
    { id: "RISK-A", code: "A类", name: "重点复核", color: "#c87b63" },
    { id: "RISK-B", code: "B类", name: "持续关注", color: "#b9934e" },
    { id: "RISK-C", code: "C类", name: "常规随访", color: "#638bb3" },
    { id: "RISK-D", code: "D类", name: "一般管理", color: "#679c7e" },
  ],
};
function RiskManagement() {
  const { state, act } = useDemo() as any;
  const levels = useCollection(riskSpec).rows;
  const [levelId, setLevelId] = useState("RISK-A");
  const [levelName, setLevelName] = useState("重点复核");
  const [color, setColor] = useState("#c87b63");
  const [code, setCode] = useState("A类");
  const [orderId, setOrderId] = useState(state.appointments[0]?.id || "");
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [title, setTitle] = useState("同订单异常合并随访");
  const [newTitle, setNewTitle] = useState("");
  const [unlock, setUnlock] = useState(false);
  const actor = state.config.operatorName || state.config.role || "admin";
  const order = state.appointments.find((a: Row) => a.id === orderId);
  const alerts = (state.records.alerts || []).filter(
    (a: Row) => a.appointmentId === orderId,
  );
  const locks = state.records.followupLocks || [];
  const lock = locks.find(
    (l: Row) => l.patientId === order?.patientId && l.status === "locked",
  );
  const save = (collection: string, record: Row) =>
    act({ type: "UPSERT_RECORD", payload: { collection, record } });
  const merge = () => {
    if (!selected.length || !title.trim()) {
      setNotice("请选择至少一项异常并填写任务名称。");
      return;
    }
    if (lock && lock.owner !== actor) {
      setNotice(`客户已由 ${lock.owner} 锁定，不能创建合并任务。`);
      return;
    }
    const alertIds = [...selected].sort();
    const key = `MERGE-${orderId}-${alertIds.join("|")}`;
    if (state.tasks.some((t: Row) => t.mergeKey === key)) {
      setNotice("相同订单和异常集合已合并，不重复创建任务。");
      return;
    }
    const id = fid();
    act({
      type: "ADD_TASK",
      payload: {
        id,
        title,
        patientId: order.patientId,
        appointmentId: orderId,
        alertIds,
        mergeKey: key,
        risk:
          levels.find((l) =>
            selected.some(
              (aid) => alerts.find((a: Row) => a.id === aid)?.risk === l.code,
            ),
          )?.code || "A类",
        owner: actor,
        date: dateNow(),
        description: alerts
          .filter((a: Row) => selected.includes(a.id))
          .map((a: Row) => a.title)
          .join("；"),
      },
    });
    alerts
      .filter((a: Row) => selected.includes(a.id))
      .forEach((a: Row) => save("alerts", { ...a, followupTaskId: id }));
    setNotice(
      `已合并 ${selected.length} 项同订单异常为 1 项随访任务，并保存关联项。`,
    );
  };
  return (
    <>
      <section className="panel ops-panel" style={{ marginBottom: 22 }}>
        <div className="ops-panel-title">
          <div>
            <h2>异常等级名称与颜色</h2>
            <p>修改后立即影响客户档案、队列任务中的同等级标签。</p>
          </div>
        </div>
        <div className="ops-form-grid">
          <label className="ops-field">
            <span>编辑等级</span>
            <select
              aria-label="编辑异常等级"
              value={levelId}
              onChange={(e) => {
                const r = levels.find((r) => r.id === e.target.value);
                setLevelId(r?.id || "new");
                setLevelName(r?.name || "");
                setColor(r?.color || "#679c7e");
                setCode(r?.code || "");
              }}
            >
              {levels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code} · {l.name}
                </option>
              ))}
              <option value="new">新增等级</option>
            </select>
          </label>
          <label className="ops-field">
            <span>等级编码</span>
            <input
              aria-label="异常等级编码"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <label className="ops-field">
            <span>显示名称</span>
            <input
              aria-label="异常等级名称"
              value={levelName}
              onChange={(e) => setLevelName(e.target.value)}
            />
          </label>
          <label className="ops-field">
            <span>等级颜色</span>
            <input
              aria-label="异常等级颜色"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </label>
        </div>
        <div className="ops-modal-actions">
          <button
            className="btn btn-primary"
            onClick={() => {
              if (
                !code.trim() ||
                !levelName.trim() ||
                levels.some((l) => l.code === code && l.id !== levelId)
              ) {
                setNotice("编码和名称必填，编码不能重复。");
                return;
              }
              save("riskLevels", {
                id: levelId === "new" ? fid() : levelId,
                code,
                name: levelName,
                color,
              });
              setNotice("等级已保存，相关客户与任务标签已更新。");
            }}
          >
            保存等级显示
          </button>
        </div>
      </section>
      <section className="panel ops-panel">
        <div className="ops-panel-title">
          <div>
            <h2>同订单异常合并与客户锁定</h2>
            <p>
              选择同一订单多项异常生成单个随访任务；锁定只保证当前浏览器规则。
            </p>
          </div>
        </div>
        <div className="ops-form-grid">
          <label className="ops-field">
            <span>体检订单</span>
            <select
              aria-label="异常合并订单"
              value={orderId}
              onChange={(e) => {
                setOrderId(e.target.value);
                setSelected([]);
                setUnlock(false);
              }}
            >
              {state.appointments.map((a: Row) => (
                <option key={a.id} value={a.id}>
                  {a.id} ·{" "}
                  {state.patients.find((p: Row) => p.id === a.patientId)?.name}
                </option>
              ))}
            </select>
          </label>
          <label className="ops-field">
            <span>合并任务名称</span>
            <input
              aria-label="异常合并任务名称"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
        </div>
        <div style={{ padding: "0 24px 20px" }}>
          <Banner>
            当前操作人员：{actor}。客户锁：
            {lock ? `${lock.owner} 已锁定` : "未锁定"}。
          </Banner>
          <div className="ops-action-wrap" style={{ margin: "16px 0" }}>
            {!lock ? (
              <button
                className="btn"
                onClick={() => {
                  save("followupLocks", {
                    id: `LOCK-${order.patientId}`,
                    patientId: order.patientId,
                    owner: actor,
                    status: "locked",
                    lockedAt: cleanDateLocal(),
                  });
                  setNotice("当前回访客户已绑定本演示人员。");
                }}
              >
                认领并锁定回访客户
              </button>
            ) : lock.owner === actor ? (
              <button className="btn" onClick={() => setUnlock(true)}>
                申请解锁当前客户
              </button>
            ) : (
              <Tag value={`由 ${lock.owner} 锁定`} />
            )}
          </div>
          {unlock && (
            <div className="ops-inline-box">
              <p>解锁后其他演示人员可以认领此客户，是否确认？</p>
              <button
                className="btn"
                onClick={() => {
                  save("followupLocks", {
                    ...lock,
                    status: "released",
                    releasedAt: cleanDateLocal(),
                  });
                  setUnlock(false);
                  setNotice("客户锁已释放。");
                }}
              >
                确认解锁客户
              </button>
              <button className="btn" onClick={() => setUnlock(false)}>
                保留锁定
              </button>
            </div>
          )}
          {alerts.map((a: Row) => (
            <label key={a.id} className="health-attention-row">
              <input
                type="checkbox"
                checked={selected.includes(a.id)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...selected, a.id]
                      : selected.filter((id) => id !== a.id),
                  )
                }
              />
              <span>
                {a.title} <Tag value={a.risk || "A类"} />
              </span>
              <small>{a.followupTaskId ? "已关联任务" : "未关联"}</small>
            </label>
          ))}
          {!alerts.length && (
            <p className="ops-muted">
              此订单暂无异常记录。可在分检上报，或添加明确标注的合成异常用于演示。
            </p>
          )}
          <div className="ops-inline-controls">
            <input
              aria-label="新增合成异常标题"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="仅用于演示的异常描述"
              style={{ maxWidth: "none" }}
            />
            <button
              className="btn"
              onClick={() => {
                if (!newTitle.trim()) return;
                save("alerts", {
                  id: fid(),
                  title: newTitle,
                  patientId: order.patientId,
                  appointmentId: orderId,
                  status: "待处理",
                  risk: code,
                  source: "手工合成示例",
                  date: dateNow(),
                });
                setNewTitle("");
              }}
            >
              添加合成异常
            </button>
          </div>
        </div>
        <div className="ops-modal-actions">
          <button className="btn btn-primary" onClick={merge}>
            合并所选异常为一个随访
          </button>
        </div>
        {notice && (
          <div className="ops-feedback" role="status">
            {notice}
          </div>
        )}
      </section>
    </>
  );
}
const cleanDateLocal = () => new Date().toISOString();

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
          ["riskRules", "异常与随访规则"],
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
      ) : tab === "riskRules" ? (
        <RiskManagement />
      ) : (
        <>
          {(tab === "plans" || tab === "templates") && <PlanComposer />}
          {tab === "groups" && <GroupBuilder />}
          <RecordWorkspace
            spec={
              tab === "plans"
                ? planSpec
                : tab === "templates"
                  ? templatesSpec
                  : groupSpec
            }
          />
        </>
      )}
    </div>
  );
}

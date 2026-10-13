import {
  reduceOrderProgressAction,
  canUnlockOrder,
} from "./orderProgressRules";
import {
  reduceReportArchiveAction,
  augmentReportArchiveEvents,
} from "./modules/reportArchiveRules";
import {
  reduceQueueAutomationAction,
  augmentBusinessEvents,
} from "./modules/queueAutomationRules";
import {
  reduceClinicalAction,
  reviewNodes,
  reviewDoctorEligible,
  validateClinicalResults,
  clinicalItems,
} from "./clinicalRules";
import {
  reduceOrderFinanceAction,
  synchronizePackageCardLifecycle,
  orderPaidAllocations,
  orderPricingLines,
} from "./orderFinanceRules";
import { reduceBatchOrderingAction } from "./batchOrderingRules";
export type Status =
  | "booked"
  | "paid"
  | "checked"
  | "in_exam"
  | "review"
  | "approved"
  | "printed"
  | "cancelled";
export interface Patient {
  id: string;
  name: string;
  sex: string;
  age: number;
  phone: string;
  company: string;
  risk: string;
  [key: string]: any;
}
export interface Package {
  id: string;
  name: string;
  price: number;
  tag: string;
  items: string[];
  [key: string]: any;
}
export interface Appointment {
  id: string;
  patientId: string;
  packageId: string;
  date: string;
  time: string;
  campus: string;
  status: Status;
  amount: number;
  items: string[];
  results: Record<string, string>;
  conclusion: string;
  [key: string]: any;
}
export interface DemoState {
  version: number;
  patients: Patient[];
  packages: Package[];
  appointments: Appointment[];
  tasks: any[];
  audit: any[];
  config: Record<string, any>;
  records: Record<string, any[]>;
}
export interface Action {
  type: string;
  payload?: any;
}
export const today = () => new Date().toISOString().slice(0, 10);
export const statusNames: Record<string, string> = {
  booked: "待缴费",
  paid: "待到检",
  checked: "已登记",
  in_exam: "检查中",
  review: "待审核",
  approved: "已审核",
  printed: "已打印",
  cancelled: "已取消",
};
const packItems = [
  "一般检查",
  "血常规",
  "肝功能",
  "肾功能",
  "血脂四项",
  "空腹血糖",
  "心电图",
  "腹部彩超",
];
export function createInitialState(): DemoState {
  const date = today();
  const patients: Patient[] = [
    {
      id: "P001",
      name: "林知远",
      sex: "男",
      age: 42,
      phone: "演示 0001",
      company: "星辰科技",
      risk: "B类",
    },
    {
      id: "P002",
      name: "苏清禾",
      sex: "女",
      age: 35,
      phone: "演示 0002",
      company: "云海设计",
      risk: "低风险",
    },
    {
      id: "P003",
      name: "陈映山",
      sex: "男",
      age: 58,
      phone: "演示 0003",
      company: "星辰科技",
      risk: "A类",
    },
    {
      id: "P004",
      name: "许悦宁",
      sex: "女",
      age: 29,
      phone: "演示 0004",
      company: "个检",
      risk: "低风险",
    },
    {
      id: "P005",
      name: "沈砚秋",
      sex: "女",
      age: 46,
      phone: "演示 0005",
      company: "远帆制造",
      risk: "B类",
    },
    {
      id: "P006",
      name: "顾行舟",
      sex: "男",
      age: 38,
      phone: "演示 0006",
      company: "远帆制造",
      risk: "低风险",
    },
    {
      id: "P007",
      name: "陆星遥",
      sex: "男",
      age: 51,
      phone: "演示 0007",
      company: "云海设计",
      risk: "C类",
    },
    {
      id: "P008",
      name: "江月白",
      sex: "女",
      age: 32,
      phone: "演示 0008",
      company: "个检",
      risk: "低风险",
    },
  ];
  const packages = [
    {
      id: "PK01",
      name: "基础安心体检",
      price: 399,
      tag: "基础筛查",
      items: packItems.slice(0, 6),
    },
    {
      id: "PK02",
      name: "都市精英体检",
      price: 899,
      tag: "年度优选",
      items: packItems,
    },
    {
      id: "PK03",
      name: "全维深度体检",
      price: 1699,
      tag: "深度关怀",
      items: [...packItems, "颈动脉彩超", "骨密度", "肺功能"],
    },
    {
      id: "PK04",
      name: "入职健康体检",
      price: 199,
      tag: "入职专项",
      items: ["一般检查", "血常规", "肝功能", "心电图"],
    },
  ];
  const states: Status[] = [
    "in_exam",
    "paid",
    "review",
    "booked",
    "approved",
    "checked",
    "review",
    "printed",
  ];
  const appointments: Appointment[] = patients.map((p, i) => ({
    id: `TJ202610${String(i + 1).padStart(4, "0")}`,
    patientId: p.id,
    packageId: "PK02",
    date,
    time: ["08:00–08:30", "08:30–09:00", "09:00–09:30"][i % 3],
    campus: i === 5 ? "东院区" : "中心院区",
    status: states[i],
    amount: 899,
    items: packItems.slice(),
    results:
      i === 0
        ? { 一般检查: "128/82", 血常规: "正常", 肝功能: "24" }
        : i === 2 || i === 4 || i === 6 || i === 7
          ? Object.fromEntries(
              packItems.map((item, j) => [
                item,
                j === 5
                  ? i === 2
                    ? "8.9"
                    : "5.8"
                  : j === 4 && i === 2
                    ? "偏高（合成）"
                    : "正常",
              ]),
            )
          : {},
    conclusion:
      i === 4 || i === 7
        ? "合成报告：建议按临床医生评估结果持续管理。此内容不用于诊疗。"
        : "",
    reviewStage: i === 6 ? 1 : 0,
    source: i % 2 ? "患者小程序" : "团检备单",
    doctor: i % 2 ? "周医生" : "余医生",
    history: {
      空腹血糖: i % 2 ? ["5.2", "5.1", "5.0"] : ["6.4", "6.1", "5.8"],
      一般检查:
        i === 2
          ? ["146/92", "142/90", "138/86"]
          : ["132/86", "130/84", "128/82"],
    },
  }));
  return {
    version: 1,
    patients,
    packages,
    appointments,
    tasks: [
      {
        id: "TASK01",
        title: "A 类异常复核与跟进",
        patientId: "P003",
        risk: "A类",
        status: "待处理",
        owner: "健康管理师",
        date,
      },
      {
        id: "TASK02",
        title: "年度健康计划复访",
        patientId: "P001",
        risk: "B类",
        status: "进行中",
        owner: "健康管理师",
        date,
      },
      {
        id: "TASK03",
        title: "报告领取满意度回访",
        patientId: "P005",
        risk: "低风险",
        status: "已完成",
        owner: "客服专员",
        date,
      },
    ],
    audit: [
      {
        id: "A1",
        time: new Date().toISOString(),
        actor: "演示系统",
        message: "初始化合成演示数据；所有业务均在本浏览器中模拟",
      },
    ],
    records: {},
    config: {
      campus: "中心院区",
      role: "admin",
      dailyCapacity: 80,
      allowAdd: true,
      allowRemove: true,
      showPrices: true,
      reviewStages: 3,
      smsEnabled: false,
      reportDeadline: 7,
      discountMin: 0.8,
      queueRule: "空腹项目优先",
      criticalGlucose: 7.8,
      criticalBp: 180,
    },
  };
}
function uid(prefix: string) {
  return (
    prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  );
}
function baseReducer(state: DemoState, action: Action): DemoState {
  const progressState = reduceOrderProgressAction(state, action);
  if (progressState !== undefined) return progressState;
  const archiveState = reduceReportArchiveAction(state, action);
  if (archiveState !== undefined) return archiveState;
  const financeState = reduceOrderFinanceAction(state, action);
  if (financeState !== undefined) return financeState;
  const automationState = reduceQueueAutomationAction(state, action);
  if (automationState !== undefined) return automationState;
  const clinicalState = reduceClinicalAction(state, action);
  if (clinicalState !== undefined) return clinicalState;
  const batchState = reduceBatchOrderingAction(state, action);
  if (batchState !== undefined) return batchState;
  const p = action.payload || {};
  const next: DemoState = { ...state };
  let message: string;
  const update = (patch: any) => {
    next.appointments = state.appointments.map((a) =>
      a.id === p.id ? { ...a, ...patch } : a,
    );
  };
  const a = state.appointments.find((a) => a.id === p.id);
  switch (action.type) {
    case "RESET":
      return createInitialState();
    case "SYNC":
      return p;
    case "UPSERT_PATIENT": {
      const patient = { ...p, id: p.id || uid("P") };
      next.patients = state.patients.some((x) => x.id === patient.id)
        ? state.patients.map((x) =>
            x.id === patient.id ? { ...x, ...patient } : x,
          )
        : [patient, ...state.patients];
      message = `更新演示客户 ${patient.name}`;
      break;
    }
    case "UPSERT_PACKAGE": {
      if (
        !p.id ||
        !p.name?.trim() ||
        !Array.isArray(p.items) ||
        !p.items.length ||
        !Number.isFinite(p.price) ||
        p.price < 0
      )
        return state;
      const pack = { ...p, items: [...new Set(p.items)] };
      next.packages = state.packages.some((x) => x.id === p.id)
        ? state.packages.map((x) => (x.id === p.id ? pack : x))
        : [...state.packages, pack];
      message = `维护套餐 ${pack.name}`;
      break;
    }
    case "CREATE_APPOINTMENT": {
      if (p.id && state.appointments.some((x) => x.id === p.id)) return state;
      const pack =
        state.packages.find((x) => x.id === p.packageId) || state.packages[0];
      const id = p.id || uid("TJ");
      next.appointments = [
        {
          id,
          patientId: p.patientId || state.patients[0].id,
          packageId: pack.id,
          date: p.date || today(),
          time: p.time || "08:00–08:30",
          campus: p.campus || state.config.campus,
          status: "booked",
          amount: p.amount ?? pack.price,
          items: [...pack.items],
          results: {},
          conclusion: "",
          reviewStage: 0,
          ...p,
        },
        ...state.appointments,
      ];
      next.records = {
        ...state.records,
        printTasks: [
          ...(state.records.printTasks || []),
          ...["导检单", "项目单", "检验条码"].map((kind) => ({
            id: "PRINT-" + id + "-" + kind,
            appointmentId: id,
            kind,
            status: "待模拟打印",
            createdAt: new Date().toISOString(),
          })),
        ],
      };
      message = `创建预约 ${id}`;
      break;
    }
    case "CANCEL_PATIENT_APPOINTMENT": {
      if (
        !a ||
        !p.patientId ||
        a.patientId !== p.patientId ||
        a.locked ||
        !["booked", "paid"].includes(a.status)
      )
        return state;
      const policy =
        state.config.cancellationPolicy === "deleteBusiness"
          ? "deleteBusiness"
          : "retain";
      const at = new Date().toISOString();
      const removedRecords: Record<string, any[]> = {};
      next.records = { ...state.records };
      if (policy === "deleteBusiness") {
        next.appointments = state.appointments.filter(
          (order) => order.id !== a.id,
        );
        for (const collection of [
          "queueTickets",
          "printTasks",
          "examRequests",
          "appointmentNotifications",
        ]) {
          removedRecords[collection] = (state.records[collection] || []).filter(
            (row) => row.appointmentId === a.id,
          );
          next.records[collection] = (state.records[collection] || []).filter(
            (row) => row.appointmentId !== a.id,
          );
        }
        next.tasks = state.tasks.filter(
          (task) => task.appointmentId !== a.id || task.status === "已完成",
        );
      } else update({ status: "cancelled", cancelledAt: at });
      const archive = {
        id: a.id,
        patientId: a.patientId,
        appointment: JSON.parse(JSON.stringify(a)),
        policy,
        cancelledAt: at,
        reason: p.reason || "患者主动取消（本地演示）",
        removedRecords,
        removedTasks: state.tasks.filter(
          (task) => task.appointmentId === a.id && task.status !== "已完成",
        ),
        status: "已取消",
      };
      next.records.cancelledAppointmentArchive = [
        archive,
        ...(state.records.cancelledAppointmentArchive || []).filter(
          (row) => row.id !== a.id,
        ),
      ];
      message = `取消预约 ${a.id}，${policy === "deleteBusiness" ? "业务记录移入可恢复档案" : "保留取消记录"}；支付/退款均为本地模拟`;
      break;
    }
    case "RESTORE_CANCELLED_APPOINTMENT": {
      const archived = (state.records.cancelledAppointmentArchive || []).find(
        (row) => row.id === p.id,
      );
      if (
        !archived ||
        archived.policy !== "deleteBusiness" ||
        archived.restoredAt ||
        !p.patientId ||
        archived.patientId !== p.patientId ||
        a
      )
        return state;
      next.appointments = [
        {
          ...archived.appointment,
          status: "cancelled",
          restoredAt: new Date().toISOString(),
        },
        ...state.appointments,
      ];
      next.records = {
        ...state.records,
        cancelledAppointmentArchive: (
          state.records.cancelledAppointmentArchive || []
        ).map((row) =>
          row.id === p.id
            ? { ...row, restoredAt: new Date().toISOString(), status: "已恢复" }
            : row,
        ),
      };
      message = `恢复取消预约 ${p.id}供查询，不恢复叫号/打印任务，不重新收费或恢复预约资格`;
      break;
    }
    case "PAYMENT": {
      if (!a || a.status !== "booked") return state;
      const group = !!a.groupSplit || !!a.groupOrderId;
      const personalTarget = group
        ? Number(a.groupSplit?.personal ?? a.selfPay ?? a.amount)
        : a.amount;
      if (
        !Number.isFinite(personalTarget) ||
        personalTarget < 0 ||
        personalTarget > a.amount
      )
        return state;
      const previousPaid = Number(a.paidAmount || 0),
        previousPersonal = group
          ? Number(
              a.personalPaidAmount ??
                Math.max(0, previousPaid - Number(a.unitPaidAmount || 0)),
            )
          : previousPaid;
      const charge = Math.max(
          0,
          Math.round((personalTarget - previousPersonal) * 100) / 100,
        ),
        at = new Date().toISOString();
      const opening = orderPaidAllocations(state, a),
        allocations = { ...opening },
        pricing = orderPricingLines(state, a),
        lines: any[] = [];
      let cents = Math.round(charge * 100);
      for (const row of pricing) {
        const n = Math.min(
          cents,
          Math.max(
            0,
            Math.round((row.amount - (allocations[row.item] || 0)) * 100),
          ),
        );
        if (n > 0) {
          allocations[row.item] =
            Math.round(((allocations[row.item] || 0) + n / 100) * 100) / 100;
          lines.push({ item: row.item, charge: n / 100, refund: 0 });
          cents -= n;
        }
      }
      if (cents > 0) return state;
      const paidAmount = Math.round((previousPaid + charge) * 100) / 100;
      update({
        status: "paid",
        paymentMethod: p.method || "模拟微信",
        paidAmount,
        personalPaidAmount: group ? personalTarget : paidAmount,
        amountDue: Math.max(0, Math.round((a.amount - paidAmount) * 100) / 100),
        paidAt: at,
        pricing,
        paymentOpeningAllocations: a.paymentOpeningAllocations || opening,
        paymentAllocations: allocations,
        paymentStatusNote:
          group && paidAmount < a.amount
            ? "个人已付款；单位份额待结算"
            : "模拟已全额付款",
      });
      next.records = {
        ...state.records,
        orderTransactions: [
          ...(state.records.orderTransactions || []),
          ...(charge > 0
            ? [
                {
                  id: `QUICK-PAY-${a.id}`,
                  appointmentId: a.id,
                  patientId: a.patientId,
                  channel: p.method || "模拟微信",
                  mode: "personal_payment",
                  payer: "personal",
                  lines,
                  grossCharge: charge,
                  grossRefund: 0,
                  net: charge,
                  at,
                  actor: state.config.role,
                  reason: group
                    ? "团检个人自付；单位未结算份额不记实收"
                    : "个人模拟付款",
                  simulated: true,
                },
              ]
            : []),
        ],
      };
      message = `模拟收款 ${p.id} ¥${charge}${group ? "（仅个人份额，单位挂账另结算）" : ""}`;
      break;
    }
    case "CHECKIN":
      if (!a || a.locked || !["paid", "checked"].includes(a.status))
        return state;
      update({
        status: "checked",
        campus: p.campus || a.campus,
        checkedAt: new Date().toISOString(),
      });
      message = `到检登记 ${p.id} ${p.campus || a.campus}`;
      break;
    case "SAVE_RESULTS":
      if (
        !a ||
        a.locked ||
        !["checked", "in_exam"].includes(a.status) ||
        validateClinicalResults(
          state,
          Object.keys(p.results || {}),
          p.results || {},
        ).length ||
        (p.complete && a.examAdditions?.some((r: any) => r.status === "待付款"))
      )
        return state;
      update({
        results: { ...a.results, ...p.results },
        resultMetadata: {
          ...(a.resultMetadata || {}),
          ...Object.fromEntries(
            Object.entries(p.results || {})
              .filter(
                ([item, value]) =>
                  typeof value === "string" &&
                  value.trim() &&
                  (!p.metadataItems || p.metadataItems.includes(item)) &&
                  (!a.resultMetadata?.[item] || a.results[item] !== value),
              )
              .map(([item]) => [
                item,
                {
                  doctor: p.doctor || a.doctor || "未登记",
                  department: p.department || a.department || "未登记",
                  room: p.room || a.room || "未登记",
                  at: new Date().toISOString(),
                },
              ]),
          ),
        },
        status: p.complete ? "review" : "in_exam",
        conclusion: p.conclusion ?? a.conclusion,
        submittedAt: p.complete ? new Date().toISOString() : a.submittedAt,
      });
      message = `${p.complete ? "完成分检并提交审核" : "保存分检结果"} ${p.id}`;
      break;
    case "UNDO_RESULTS":
      if (
        !a ||
        a.locked ||
        a.status !== "review" ||
        (a.reviewStage || 0) > 0 ||
        !p.reason?.trim()
      )
        return state;
      update({ status: "in_exam", submittedAt: null, undoReason: p.reason });
      message = `撤销分检提交 ${p.id}：${p.reason}`;
      break;
    case "REVIEW":
      if (
        !a ||
        a.locked ||
        a.status !== "review" ||
        (p.expectedStage !== undefined &&
          p.expectedStage !== (a.reviewStage || 0))
      )
        return state;
      {
        if (!reviewDoctorEligible(state, a, p.doctor || a.doctor || "周医生"))
          return state;
        const nodes = reviewNodes(state, a);
        const stage = (a.reviewStage || 0) + 1;
        const at = new Date().toISOString();
        const doctor = p.doctor || a.doctor || state.config.role;
        const history = {
          stage: stage - 1,
          node: nodes[stage - 1],
          doctor,
          startedAt:
            a.stageStartedAt?.[nodes[stage - 1]] || a.submittedAt || null,
          startedAtSource: a.stageStartedAt?.[nodes[stage - 1]]
            ? "节点开始"
            : "送审代理",
          completedAt: at,
          status: "已通过",
        };
        update({
          reviewStage: stage,
          reviewNodes: nodes,
          reviewHistory: [...(a.reviewHistory || []), history],
          stageMetadata: [
            ...(a.stageMetadata || []),
            { ...history, stage: history.node },
          ],
          status: stage >= nodes.length ? "approved" : "review",
          conclusion: p.conclusion ?? a.conclusion,
          locked: stage >= nodes.length,
          approvedAt:
            stage >= nodes.length ? new Date().toISOString() : undefined,
        });
        message = `${nodes[stage - 1]}通过 ${p.id}`;
      }
      break;
    case "REJECT":
      if (!a || !["review", "approved"].includes(a.status)) return state;
      update({
        status: "in_exam",
        reviewStage: 0,
        locked: false,
        rejectReason: p.reason,
        redoItems: Array.isArray(p.items) && p.items.length ? p.items : a.items,
        results: Object.fromEntries(
          Object.entries(a.results).map(([item, value]) => [
            item,
            [
              ...(p.items?.length ? p.items : a.items),
              ...clinicalItems(state, {
                ...a,
                items: p.items?.length ? p.items : a.items,
              }),
            ].includes(item)
              ? ""
              : value,
          ]),
        ),
        reviewHistory: [],
        reviewRejectHistory: [
          ...(a.reviewRejectHistory || []),
          {
            node: reviewNodes(state, a)[a.reviewStage || 0],
            items: p.items?.length ? p.items : a.items,
            doctor: a.doctor,
            reason: p.reason,
            at: new Date().toISOString(),
          },
        ],
      });
      message = `驳回 ${p.id}：${p.reason || "需要复核"}`;
      break;
    case "PRINT":
      if (!a || !["approved", "printed"].includes(a.status)) return state;
      update({
        status: "printed",
        printedAt: new Date().toISOString(),
        printCount: (a.printCount || 0) + 1,
      });
      message = `模拟打印报告 ${p.id}${p.bound ? "并完成模拟装订" : ""}`;
      break;
    case "UPDATE_APPOINTMENT":
      if (!a || (a.locked && p.locked === false && !canUnlockOrder(state, a)))
        return state;
      update(p);
      message = `订单变更 ${p.id}：${Object.keys(p)
        .filter((k) => k !== "id")
        .join("、")}`;
      break;
    case "ADD_TASK":
      if (p.id && state.tasks.some((t) => t.id === p.id)) return state;
      next.tasks = [
        { id: uid("TASK"), status: "待处理", date: today(), ...p },
        ...state.tasks,
      ];
      message = `创建任务：${p.title}`;
      break;
    case "UPDATE_TASK":
      next.tasks = state.tasks.map((x) => (x.id === p.id ? { ...x, ...p } : x));
      message = `更新任务 ${p.id}：${p.status || p.title || "处理记录"}`;
      break;
    case "UPDATE_CONFIG":
      next.config = { ...state.config, ...p };
      message = `更新配置：${Object.keys(p).join("、")}`;
      break;
    case "UPSERT_RECORD": {
      const records = state.records[p.collection] || [];
      const record = {
        ...p.record,
        id: p.record.id || uid("R"),
        updatedAt: new Date().toISOString(),
      };
      next.records = {
        ...state.records,
        [p.collection]: records.some((x) => x.id === record.id)
          ? records.map((x) => (x.id === record.id ? { ...x, ...record } : x))
          : [record, ...records],
      };
      message = `${p.collection}：保存 ${record.name || record.title || record.id}`;
      break;
    }
    case "DELETE_RECORD":
      next.records = {
        ...state.records,
        [p.collection]: (state.records[p.collection] || []).filter(
          (x) => x.id !== p.id,
        ),
      };
      message = `${p.collection}：删除 ${p.id}`;
      break;
    case "ADD_AUDIT":
      message = p.message;
      break;
    default:
      return state;
  }
  if (message) {
    let entity = p.id || p.record?.id || p.collection || "system";
    let before: any = null;
    let after: any = null;
    if (
      [
        "CREATE_APPOINTMENT",
        "PAYMENT",
        "CHECKIN",
        "SAVE_RESULTS",
        "UNDO_RESULTS",
        "REVIEW",
        "REJECT",
        "PRINT",
        "UPDATE_APPOINTMENT",
        "CANCEL_PATIENT_APPOINTMENT",
        "RESTORE_CANCELLED_APPOINTMENT",
      ].includes(action.type)
    ) {
      entity = p.id || next.appointments[0]?.id;
      before = state.appointments.find((x) => x.id === entity) || null;
      after = next.appointments.find((x) => x.id === entity) || null;
    } else if (action.type === "UPSERT_PACKAGE") {
      entity = p.id;
      before = state.packages.find((x) => x.id === p.id) || null;
      after = next.packages.find((x) => x.id === p.id) || null;
    } else if (action.type === "UPDATE_CONFIG") {
      entity = "config";
      before = state.config;
      after = next.config;
    } else if (p.collection) {
      entity =
        p.record?.id ||
        p.id ||
        next.records[p.collection]?.[0]?.id ||
        p.collection;
      before =
        state.records[p.collection]?.find((x) => x.id === entity) || null;
      after =
        action.type === "DELETE_RECORD"
          ? null
          : next.records[p.collection]?.find((x) => x.id === entity) || null;
    } else if (action.type === "UPSERT_PATIENT") {
      entity = p.id || next.patients[0]?.id;
      before = state.patients.find((x) => x.id === entity) || null;
      after = next.patients.find((x) => x.id === entity) || null;
    } else if (action.type === "ADD_TASK" || action.type === "UPDATE_TASK") {
      entity = p.id || next.tasks[0]?.id;
      before = state.tasks.find((x) => x.id === entity) || null;
      after = next.tasks.find((x) => x.id === entity) || null;
    }
    next.audit = [
      {
        id: uid("A"),
        time: new Date().toISOString(),
        actor: state.config.role || "admin",
        message,
        action: action.type,
        entity,
        before: before ? JSON.parse(JSON.stringify(before)) : null,
        after: after ? JSON.parse(JSON.stringify(after)) : null,
      },
      ...state.audit,
    ].slice(0, 1000);
  }
  return next;
}
export function reducer(state: DemoState, action: Action): DemoState {
  const base = baseReducer(state, action);
  const next =
    base === state || ["RESET", "SYNC"].includes(action.type)
      ? base
      : synchronizePackageCardLifecycle(base);
  return next === state || ["RESET", "SYNC"].includes(action.type)
    ? next
    : augmentReportArchiveEvents(
        state,
        augmentBusinessEvents(state, next, action),
        action,
      );
}
export function exportCsv(filename: string, rows: Record<string, any>[]) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const safe = (v: any) => {
    let s = String(v ?? "");
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  const text =
    "\ufeff" +
    [
      keys.map(safe).join(","),
      ...rows.map((r) => keys.map((k) => safe(r[k])).join(",")),
    ].join("\n");
  download(filename, text, "text/csv;charset=utf-8");
}
export function download(name: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

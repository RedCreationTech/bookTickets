// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { createInitialState, reducer, DemoProvider } from "../src/store";
import type { DemoState, Action } from "../src/model";
import Queue, { QueueRecommendationPanel } from "../src/modules/Queue";
import {
  BusinessAutomationPanel,
  FollowupDatePlanner,
  RiskSortedOrders,
} from "../src/modules/QueueAutomation";
import {
  augmentBusinessEvents,
  reduceQueueAutomationAction,
  recommendNextStation,
  queueDayCounts,
  searchQueueCustomers,
  customerQueueSummary,
  queueCustomerType,
  previewRoomDispatch,
  previewBusinessClock,
  sortByRisk,
} from "../src/modules/queueAutomationRules";
const key = "hongchuang.health.demo.v1";
const current = (): DemoState => JSON.parse(localStorage.getItem(key) || "{}");
const act = (s: DemoState, a: Action) =>
  augmentBusinessEvents(
    s,
    reduceQueueAutomationAction(s, a) ?? reducer(s, a),
    a,
  );
const at = "2026-10-13T08:00:00Z";
function seed() {
  const s = createInitialState();
  s.config.queueBusinessDate = "2026-10-13";
  s.audit = [{ id: "SEED", time: at }];
  s.appointments = s.appointments.slice(0, 3).map((a, i) => ({
    ...a,
    id: `A${i}`,
    patientId: s.patients[i].id,
    status: "checked",
    locked: false,
    date: "2026-10-13",
    checkedAt: at,
    campus: "中心院区",
    items: ["一般检查", "血常规", "心电图", "腹部彩超"],
    results: {},
    preferredQueueArea: "一区",
  }));
  s.records.queueTickets = [];
  s.records.queueDefinitions = [
    {
      id: "采血区",
      name: "采血区",
      department: "检验",
      zone: "一区",
      minutes: 5,
      items: ["血常规"],
      enabled: true,
    },
    {
      id: "一般检查区",
      name: "一般检查区",
      department: "一般",
      zone: "一区",
      minutes: 5,
      items: ["一般检查"],
      enabled: true,
    },
    {
      id: "心电图区",
      name: "心电图区",
      department: "心电",
      zone: "二区",
      minutes: 8,
      items: ["心电图"],
      enabled: true,
      dependencies: ["一般检查"],
    },
    {
      id: "超声区",
      name: "超声区",
      department: "超声",
      zone: "二区",
      minutes: 12,
      items: ["腹部彩超"],
      enabled: true,
    },
  ];
  s.records.guideRooms = [
    {
      id: "R1",
      name: "诊室一",
      department: "检验",
      queue: "采血区",
      zone: "一区",
      capacity: 1,
      status: "已启用",
    },
    {
      id: "R2",
      name: "诊室二",
      department: "检验",
      queue: "采血区",
      zone: "一区",
      capacity: 1,
      status: "已启用",
    },
  ];
  s.tasks = [];
  return s;
}
const ticket = (
  id: string,
  appointmentId: string,
  status = "waiting",
  extra: any = {},
) => ({
  id,
  appointmentId,
  department: "采血区",
  status,
  position: Number(id.replace(/\D/g, "")) || 0,
  businessDate: "2026-10-13",
  ...extra,
});
const mount = (s: DemoState, component: any) => (
  localStorage.setItem(key, JSON.stringify(s)),
  render(<DemoProvider>{component}</DemoProvider>)
);
describe("Queue completion: state-derived recommendations and patient scope", () => {
  it("T0010/T0504/T0505 scores load/service/area/bottleneck and excludes unmet dependency, sex and disabled zones", () => {
    const s = seed();
    let rec = recommendNextStation(s, "A0");
    expect(
      rec.excluded.find((r) => r.queueId === "心电图区")?.reason,
    ).toContain("一般检查");
    expect(
      rec.candidates.find((r) => r.queueId === "采血区")?.waitMinutes,
    ).toBe(0);
    s.records.queueTickets = [ticket("T1", "A1"), ticket("T2", "A2")];
    rec = recommendNextStation(s, "A0");
    expect(
      rec.candidates.find((r) => r.queueId === "采血区")?.waitMinutes,
    ).toBe(5);
    expect(rec.recommendation?.queueId).toBe("一般检查区");
    s.appointments[0].results = { 一般检查: "正常" };
    expect(
      recommendNextStation(s, "A0").candidates.some(
        (r) => r.queueId === "心电图区",
      ),
    ).toBe(true);
    const ultrasound = s.records.queueDefinitions.find(
      (q) => q.id === "超声区",
    )!;
    ultrasound.minutes = 2;
    ultrasound.bottleneck = true;
    s.appointments[0].preferredQueueArea = "二区";
    rec = recommendNextStation(s, "A0");
    expect(rec.recommendation?.queueId).toBe("超声区");
    expect(rec.recommendation?.explanation).toContain("瓶颈优先 2");
    ultrasound.sex = "女";
    expect(
      recommendNextStation(s, "A0").excluded.find((r) => r.queueId === "超声区")
        ?.reason,
    ).toBe("性别不适用");
    s.records.guideZones = [{ name: "一区", status: "已停用" }];
    expect(
      recommendNextStation(s, "A0").candidates.some((r) => r.zone === "一区"),
    ).toBe(false);
  });
  it("T0503 first station and bottleneck prearrangement create unique tickets; locked/cancelled/unauthorized do not", () => {
    let s = seed();
    s.records.queueDefinitions.find((q) => q.id === "超声区")!.bottleneck =
      true;
    s = act(s, {
      type: "QUEUE_RECOMMENDED_ENQUEUE",
      payload: { appointmentId: "A0" },
    });
    expect(s.records.queueTickets).toHaveLength(1);
    s = act(s, {
      type: "QUEUE_RECOMMENDED_ENQUEUE",
      payload: { appointmentId: "A0" },
    });
    expect(s.records.queueTickets).toHaveLength(1);
    s = act(s, {
      type: "QUEUE_RECOMMENDED_ENQUEUE",
      payload: { appointmentId: "A0", bottleneck: true },
    });
    expect(s.records.queueTickets.find((t) => t.prearranged)?.department).toBe(
      "超声区",
    );
    s.appointments[1].locked = true;
    s.appointments[2].status = "cancelled";
    expect(
      act(s, {
        type: "QUEUE_RECOMMENDED_ENQUEUE",
        payload: { appointmentId: "A1" },
      }),
    ).toBe(s);
    expect(
      act(s, {
        type: "QUEUE_RECOMMENDED_ENQUEUE",
        payload: { appointmentId: "A2" },
      }),
    ).toBe(s);
    s.config.role = "finance";
    expect(
      act(s, {
        type: "QUEUE_RECOMMENDED_ENQUEUE",
        payload: { appointmentId: "A0", bottleneck: true },
      }),
    ).toBe(s);
  });
  it("T0512/T0513 uses actual business dates for pending, missed and complete counts", () => {
    const s = seed();
    s.records.queueTickets = [
      ticket("T1", "A0"),
      ticket("T2", "A1", "missed"),
      ticket("T3", "A2", "done"),
      ticket("T4", "A0", "waiting", { businessDate: "2026-10-12" }),
      ticket("T5", "A1", "missed", { businessDate: "2026-10-12" }),
    ];
    expect(queueDayCounts(s, "采血区", "2026-10-13")).toEqual({
      waiting: 1,
      missed: 1,
      completed: 1,
    });
    expect(queueDayCounts(s, "采血区", "2026-10-12")).toEqual({
      waiting: 1,
      missed: 1,
      completed: 0,
    });
  });
  it("T0530/T0531/T0532/T0559 searches exact DEMO identities and aggregates pending/completed across queues without identity bleed", () => {
    const s = seed();
    s.patients[0].name = s.patients[1].name = "同名合成";
    s.patients[0].certificate = "DEMO-ONE";
    s.patients[1].certificate = "DEMO-TWO";
    s.records.queueTickets = [
      ticket("T1", "A0"),
      ticket("T2", "A0", "done", { department: "一般检查区" }),
      ticket("T3", "A0", "missed", { department: "超声区" }),
      ticket("T4", "A1"),
    ];
    expect(searchQueueCustomers(s, "同名")).toHaveLength(2);
    expect(searchQueueCustomers(s, "DEMO-ONE").map((a) => a.id)).toEqual([
      "A0",
    ]);
    expect(searchQueueCustomers(s, "A1").map((a) => a.id)).toEqual(["A1"]);
    expect(searchQueueCustomers(s, "不存在")).toEqual([]);
    const detail = customerQueueSummary(s, "A0")!;
    expect(detail.identity).toBe("DEMO-ONE");
    expect(detail.checkedAt).toBe(at);
    expect(detail.completed.map((t) => t.department)).toContain("一般检查区");
    expect(detail.pending.map((t) => t.department)).toEqual(
      expect.arrayContaining(["采血区", "超声区", "心电图区"]),
    );
    expect(
      [...detail.pending, ...detail.completed].every(
        (t) => t.appointmentId === "A0",
      ),
    ).toBe(true);
    delete s.appointments[1].checkedAt;
    expect(customerQueueSummary(s, "A1")?.checkedAt).toBe("未登记体检开始时间");
  });
  it("T0540 displays patient VIP/ordinary independently of queue type and name masking", () => {
    const s = seed();
    s.patients[0].customerType = "vip";
    s.records.queueTickets = [ticket("T1", "A0"), ticket("T2", "A1")];
    s.config.maskQueueNames = true;
    expect(queueCustomerType(s, s.patients[0].id)).toBe("VIP 客户");
    expect(queueCustomerType(s, s.patients[1].id)).toBe("普通客户");
    mount(s, <Queue screen />);
    const waiting = screen.getByRole("region", { name: "等待客户滚动列表" });
    expect(waiting).toHaveTextContent("VIP 客户");
    expect(waiting).toHaveTextContent("普通客户");
    expect(waiting).not.toHaveTextContent(s.patients[0].name);
  });
});
describe("T0554/T0555 deterministic room pool dispatch", () => {
  it("balances two rooms without duplicate service, respects capacity, and single mode takes only its room", () => {
    let s = seed();
    s.records.queueTickets = [
      ticket("T1", "A0"),
      ticket("T2", "A1"),
      ticket("T3", "A2"),
    ];
    s = act(s, {
      type: "QUEUE_SET_ROOM_MODE",
      payload: { queueId: "采血区", mode: "multi" },
    });
    s = act(s, {
      type: "QUEUE_DISPATCH",
      payload: { queueId: "采血区", requestId: "D1" },
    });
    s = act(s, {
      type: "QUEUE_DISPATCH",
      payload: { queueId: "采血区", requestId: "D2" },
    });
    expect(
      s.records.queueTickets
        .filter((t) => t.status === "calling")
        .map((t) => t.roomId)
        .sort(),
    ).toEqual(["R1", "R2"]);
    expect(
      act(s, {
        type: "QUEUE_DISPATCH",
        payload: { queueId: "采血区", requestId: "D3" },
      }),
    ).toBe(s);
    const called = s.records.queueTickets.find(
      (t) => t.lastDispatchRequestId === "D1",
    )!;
    expect(
      act(s, {
        type: "QUEUE_DISPATCH",
        payload: { queueId: "采血区", ticketId: called.id, requestId: "D1" },
      }),
    ).toBe(s);
    s = act(s, {
      type: "QUEUE_SET_ROOM_MODE",
      payload: { queueId: "采血区", mode: "single", roomId: "R1" },
    });
    expect(previewRoomDispatch(s, "采血区", "T2", "R1").error).toContain(
      "单诊室",
    );
  });
  it("reclaims disabled room into shared pool then assigns to the remaining room; rejects stale, cancelled, locked and unauthorized tickets", () => {
    let s = seed();
    s.config.queueRoomModes = { 采血区: "multi" };
    s.records.queueTickets = [
      ticket("T1", "A0", "calling", { roomId: "R1" }),
      ticket("T2", "A1", "waiting", { businessDate: "2026-10-12" }),
      ticket("T3", "A2"),
    ];
    s.records.guideRooms[0].status = "已停用";
    s = act(s, {
      type: "QUEUE_REBALANCE_CLOSED_ROOMS",
      payload: { queueId: "采血区" },
    });
    expect(s.records.queueTickets[0]).toMatchObject({
      status: "waiting",
      roomId: "",
      previousRoomId: "R1",
    });
    s = act(s, {
      type: "QUEUE_DISPATCH",
      payload: { queueId: "采血区", ticketId: "T1" },
    });
    expect(s.records.queueTickets[0]).toMatchObject({
      status: "calling",
      roomId: "R2",
    });
    expect(previewRoomDispatch(s, "采血区", "T2").error).toContain(
      "没有可派发",
    );
    s.appointments[2].locked = true;
    expect(previewRoomDispatch(s, "采血区", "T3").ticket).toBeNull();
    s.appointments[2].locked = false;
    s.appointments[2].status = "cancelled";
    expect(previewRoomDispatch(s, "采血区", "T3").ticket).toBeNull();
    s.config.role = "finance";
    expect(previewRoomDispatch(s, "采血区").error).toContain("无队列权限");
  });
});
describe("Local business event automation", () => {
  it("T0044/T0488 only a successful appointment creation gets one local SMS; duplicate and unchanged transitions do not", () => {
    let s = seed();
    const create = {
      type: "CREATE_APPOINTMENT",
      payload: {
        id: "NEW",
        patientId: s.patients[0].id,
        packageId: s.packages[0].id,
        date: "2026-10-15",
        time: "09:00",
      },
    };
    s = act(s, create);
    expect(
      s.records.businessNotifications.filter((r) => r.kind === "预约成功提醒"),
    ).toHaveLength(1);
    expect(s.records.controlNotifications[0]).toMatchObject({
      appointmentId: "NEW",
      patientId: s.patients[0].id,
      status: "模拟送达",
      template: "预约成功提醒",
    });
    s = act(s, create);
    expect(
      s.records.businessNotifications.filter((r) => r.kind === "预约成功提醒"),
    ).toHaveLength(1);
    expect(augmentBusinessEvents(s, s, create)).toBe(s);
  });
  it("T0489/T0491 checkin, exam submission and report approval notify once; rejection withdraws and never claims a ready report", () => {
    let s = seed();
    s.appointments[0].status = "paid";
    s = act(s, { type: "CHECKIN", payload: { id: "A0" } });
    expect(
      s.records.businessNotifications.find((r) => r.kind === "体检到检提示")
        ?.appointmentId,
    ).toBe("A0");
    s = act(s, {
      type: "SAVE_RESULTS",
      payload: {
        id: "A0",
        results: Object.fromEntries(
          s.appointments[0].items.map((i) => [i, "正常"]),
        ),
        complete: true,
        conclusion: "合成结论",
      },
    });
    expect(
      s.records.businessNotifications.some((r) => r.kind === "体检完成提示"),
    ).toBe(true);
    expect(
      s.records.businessNotifications.some((r) => r.kind === "领取报告提示"),
    ).toBe(false);
    const before = s;
    s = {
      ...s,
      appointments: s.appointments.map((a) =>
        a.id === "A0" ? { ...a, status: "approved", locked: true } : a,
      ),
    };
    s = augmentBusinessEvents(before, s, { type: "REVIEW" });
    expect(
      s.records.businessNotifications.find((r) => r.kind === "领取报告提示")
        ?.status,
    ).toBe("未读");
    const approved = s;
    s = {
      ...s,
      appointments: s.appointments.map((a) =>
        a.id === "A0" ? { ...a, status: "in_exam", locked: false } : a,
      ),
    };
    s = augmentBusinessEvents(approved, s, { type: "REJECT" });
    expect(
      s.records.businessNotifications.find((r) => r.kind === "领取报告提示")
        ?.status,
    ).toBe("已撤销");
  });
  it("T0045/T0493 pre-exam matches exactly next day, contains date/time/preparations, deduplicates and excludes cancellation", () => {
    let s = seed();
    s.appointments[0] = {
      ...s.appointments[0],
      status: "paid",
      date: "2026-10-14",
      time: "09:00",
    };
    s.appointments[1] = {
      ...s.appointments[1],
      status: "cancelled",
      date: "2026-10-14",
    };
    s.appointments[2] = {
      ...s.appointments[2],
      status: "booked",
      date: "2026-10-15",
    };
    const rows = previewBusinessClock(s, at);
    expect(rows.filter((r) => r.kind === "检前一天提醒")).toHaveLength(1);
    expect(rows[0].content).toContain("2026-10-14 09:00");
    expect(rows[0].content).toContain("注意事项");
    s = act(s, { type: "AUTOMATION_SCAN", payload: { clock: at } });
    s = act(s, { type: "AUTOMATION_SCAN", payload: { clock: at } });
    expect(
      s.records.businessNotifications.filter((r) => r.kind === "检前一天提醒"),
    ).toHaveLength(1);
    const old = s;
    s = {
      ...s,
      appointments: s.appointments.map((a) =>
        a.id === "A0" ? { ...a, status: "cancelled" } : a,
      ),
    };
    s = augmentBusinessEvents(old, s, { type: "CANCEL_PATIENT_APPOINTMENT" });
    expect(s.records.businessNotifications[0].status).toBe("已撤销");
  });
  it("T0490 schedules two projects on separate dates; edits invalidate old version, cancellation and repeat scans never send stale plans", () => {
    let s = seed();
    s = act(s, {
      type: "AUTOMATION_PLAN_RECHECK",
      payload: {
        id: "P1",
        appointmentId: "A0",
        items: ["血常规"],
        date: "2026-10-14",
        time: "09:00",
      },
    });
    s = act(s, {
      type: "AUTOMATION_PLAN_RECHECK",
      payload: {
        id: "P2",
        appointmentId: "A0",
        items: ["心电图"],
        date: "2026-10-15",
        time: "10:00",
      },
    });
    s = act(s, {
      type: "AUTOMATION_SCAN",
      payload: { clock: "2026-10-14T08:00:00Z" },
    });
    expect(
      s.records.businessNotifications
        .filter((r) => r.kind === "复查项目时间提醒")
        .map((r) => r.items),
    ).toEqual([["血常规"]]);
    s = act(s, {
      type: "AUTOMATION_PLAN_RECHECK",
      payload: {
        id: "P1",
        appointmentId: "A0",
        items: ["血常规"],
        date: "2026-10-16",
        time: "09:00",
      },
    });
    expect(s.records.businessNotifications[0].status).toBe("已撤销");
    s = act(s, { type: "AUTOMATION_CANCEL_RECHECK", payload: { id: "P2" } });
    s = act(s, {
      type: "AUTOMATION_SCAN",
      payload: { clock: "2026-10-15T08:00:00Z" },
    });
    expect(
      s.records.businessNotifications.filter(
        (r) => r.kind === "复查项目时间提醒",
      ),
    ).toHaveLength(1);
    s = act(s, {
      type: "AUTOMATION_SCAN",
      payload: { clock: "2026-10-16T08:00:00Z" },
    });
    s = act(s, {
      type: "AUTOMATION_SCAN",
      payload: { clock: "2026-10-16T08:00:00Z" },
    });
    expect(
      s.records.businessNotifications.filter(
        (r) => r.kind === "复查项目时间提醒",
      ),
    ).toHaveLength(2);
    expect(
      act(s, {
        type: "AUTOMATION_PLAN_RECHECK",
        payload: {
          id: "BAD",
          appointmentId: "A0",
          items: ["不存在项目"],
          date: "2026-10-17",
        },
      }),
    ).toBe(s);
  });
  it("T0264/T0272/T0282 new matched alerts create SMS and deduplicated sourced tasks; tasks and orders sort by highest risk", () => {
    let s = seed();
    s = act(s, {
      type: "AUTOMATION_CONFIGURE",
      payload: {
        rules: {
          abnormalSms: true,
          autoFollowup: true,
          risks: ["A类", "C类"],
          followupDelayDays: 1,
        },
      },
    });
    const alert = (id: string, risk: string, appointmentId: string) => ({
      type: "UPSERT_RECORD",
      payload: {
        collection: "alerts",
        record: {
          id,
          title: `合成${risk}异常`,
          risk,
          appointmentId,
          patientId: s.appointments.find((a) => a.id === appointmentId)!
            .patientId,
          status: "待处理",
        },
      },
    });
    s = act(s, alert("LOW", "C类", "A0"));
    s = act(s, alert("HIGH", "A类", "A1"));
    s = act(s, alert("HIGH", "A类", "A1"));
    s = act(s, alert("NO", "B类", "A2"));
    expect(s.tasks).toHaveLength(2);
    expect(
      s.records.businessNotifications.filter(
        (r) => r.kind === "异常项目自动提醒",
      ),
    ).toHaveLength(2);
    expect(sortByRisk(s, s.tasks).map((t) => t.sourceAlertId)).toEqual([
      "HIGH",
      "LOW",
    ]);
    expect(
      sortByRisk(s, s.appointments)
        .slice(0, 2)
        .map((a) => a.id),
    ).toEqual(["A1", "A2"]);
    expect(s.tasks[0]).toMatchObject({
      source: "异常自动规则",
      date: "2026-10-14",
      alertIds: ["LOW"],
    });
    expect(s.records.alerts.find((r) => r.id === "HIGH")?.followupTaskId).toBe(
      "AUTO-FOLLOWUP-HIGH",
    );
  });
  it("automatic rules default off for abnormal/tasks, and locked events defer until unlock without overwriting existing tasks", () => {
    let s = seed();
    const alert = {
      id: "LOCKED",
      title: "合成异常",
      risk: "A类",
      patientId: s.patients[0].id,
      appointmentId: "A0",
    };
    s = act(s, {
      type: "UPSERT_RECORD",
      payload: { collection: "alerts", record: { ...alert, id: "OFF" } },
    });
    expect(s.tasks).toHaveLength(0);
    s = act(s, {
      type: "AUTOMATION_CONFIGURE",
      payload: { rules: { autoFollowup: true } },
    });
    s.records.followupLocks = [
      {
        id: "L",
        patientId: s.patients[0].id,
        status: "locked",
        owner: "另一个操作员",
      },
    ];
    s = act(s, {
      type: "UPSERT_RECORD",
      payload: { collection: "alerts", record: alert },
    });
    expect(s.tasks).toHaveLength(0);
    expect(s.records.automationDeferred[0].status).toBe("等待解锁");
    s = act(s, {
      type: "UPSERT_RECORD",
      payload: {
        collection: "followupLocks",
        record: { id: "L", patientId: s.patients[0].id, status: "unlocked" },
      },
    });
    expect(s.tasks).toHaveLength(1);
    expect(s.tasks[0].sourceAlertId).toBe("LOCKED");
  });
  it("T0275 due dates trigger once; rescheduling cancels prior reminders; completed and locked tasks do not notify; read and handled states persist", () => {
    let s = seed();
    s.tasks = [
      {
        id: "F1",
        patientId: s.patients[0].id,
        title: "随访",
        status: "待处理",
        date: "2026-10-14",
      },
      {
        id: "F2",
        patientId: s.patients[1].id,
        title: "完成",
        status: "已完成",
        date: "2026-10-14",
      },
      {
        id: "F3",
        patientId: s.patients[2].id,
        title: "锁定",
        status: "待处理",
        date: "2026-10-14",
        locked: true,
      },
    ];
    expect(previewBusinessClock(s, at)).toHaveLength(0);
    s = act(s, {
      type: "AUTOMATION_SET_FOLLOWUP_DATE",
      payload: { id: "F1", date: "2026-10-15" },
    });
    expect(previewBusinessClock(s, "2026-10-14T08:00:00Z")).toHaveLength(0);
    s = act(s, {
      type: "AUTOMATION_SCAN",
      payload: { clock: "2026-10-15T08:00:00Z" },
    });
    expect(s.records.businessNotifications).toHaveLength(1);
    const id = s.records.businessNotifications[0].id;
    s = act(s, {
      type: "AUTOMATION_MARK_NOTICE",
      payload: { id, status: "已读" },
    });
    expect(s.records.stationNotifications[0].status).toBe("已读");
    expect(
      act(s, {
        type: "AUTOMATION_MARK_NOTICE",
        payload: { id, status: "已处理", note: "" },
      }),
    ).toBe(s);
    s = act(s, {
      type: "AUTOMATION_MARK_NOTICE",
      payload: { id, status: "已处理", note: "已完成合成回访" },
    });
    expect(s.records.businessNotifications[0].status).toBe("已处理");
    s = act(s, {
      type: "AUTOMATION_SCAN",
      payload: { clock: "2026-10-15T08:00:00Z" },
    });
    expect(s.records.businessNotifications).toHaveLength(1);
  });
  it("rejects invalid dates, ordinary unauthorized roles, foreign plans and locked schedules", () => {
    let s = seed();
    expect(
      act(s, {
        type: "AUTOMATION_SCAN",
        payload: { clock: "2026-02-30T08:00:00Z" },
      }),
    ).toBe(s);
    expect(
      act(s, {
        type: "AUTOMATION_CONFIGURE",
        payload: { rules: { followupDelayDays: -1 } },
      }),
    ).toBe(s);
    s.config.role = "finance";
    expect(
      act(s, {
        type: "AUTOMATION_CONFIGURE",
        payload: { rules: { autoFollowup: true } },
      }),
    ).toBe(s);
    s.config.role = "admin";
    s.records.followupLocks = [
      { patientId: s.patients[0].id, status: "locked" },
    ];
    expect(
      act(s, {
        type: "AUTOMATION_PLAN_RECHECK",
        payload: {
          id: "P",
          appointmentId: "A0",
          items: ["血常规"],
          date: "2026-10-14",
        },
      }),
    ).toBe(s);
  });
});
describe("Completion controls are live shared-state UI", () => {
  it("recommendation button creates ticket and customer query clears stale detail when query changes", () => {
    const s = seed();
    mount(s, <Queue />);
    fireEvent.change(screen.getByLabelText("待导检订单"), {
      target: { value: "A0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "将推荐第一站入队" }));
    expect(current().records.queueTickets).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("队列客户搜索"), {
      target: { value: "A0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "查看全部队列 A0" }));
    expect(
      screen.getByRole("dialog", { name: "客户全部队列信息" }),
    ).toHaveTextContent("A0");
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    fireEvent.change(screen.getByLabelText("队列客户搜索"), {
      target: { value: "不存在" },
    });
    expect(
      screen.queryByRole("button", { name: "查看全部队列 A0" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("未找到匹配的客户或体检号。")).toBeInTheDocument();
  });
  it("notification rules, preview/commit, recheck save/edit/cancel, followup dates and handling all mutate shared data", () => {
    const s = seed();
    s.appointments[0] = {
      ...s.appointments[0],
      status: "paid",
      date: "2026-10-14",
    };
    s.tasks = [
      {
        id: "T",
        title: "测试回访",
        patientId: s.patients[0].id,
        date: "2026-10-14",
        status: "待处理",
      },
    ];
    mount(s, <BusinessAutomationPanel />);
    fireEvent.click(screen.getByLabelText("新异常自动建立随访任务"));
    fireEvent.click(
      screen.getByRole("button", { name: "保存业务事件自动规则" }),
    );
    expect(current().config.businessAutomationRules.autoFollowup).toBe(true);
    fireEvent.change(screen.getByLabelText("业务提醒演示时钟（UTC）"), {
      target: { value: "2026-10-13T08:00" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "预览检前、复查和随访提醒" }),
    );
    expect(current().records.businessNotifications).toBeUndefined();
    fireEvent.click(
      screen.getByRole("button", { name: "推进时钟并生成本地提醒" }),
    );
    expect(current().records.businessNotifications).toHaveLength(1);
    fireEvent.click(
      screen.getByRole("button", { name: "标记已读 检前一天提醒" }),
    );
    expect(current().records.businessNotifications[0].status).toBe("已读");
    fireEvent.click(
      screen.getByRole("button", { name: "登记处理 检前一天提醒" }),
    );
    fireEvent.change(screen.getByLabelText("处理记录"), {
      target: { value: "已查看合成须知" },
    });
    fireEvent.click(screen.getByRole("button", { name: "确认已处理" }));
    expect(current().records.businessNotifications[0].status).toBe("已处理");
    fireEvent.click(
      screen.getByRole("button", { name: "建立复查项目时间计划" }),
    );
    let dialog = screen.getByRole("dialog", { name: "复查项目时间计划" });
    fireEvent.change(within(dialog).getByLabelText("复查日期"), {
      target: { value: "2026-10-15" },
    });
    fireEvent.click(within(dialog).getByLabelText("血常规"));
    fireEvent.click(
      within(dialog).getByRole("button", { name: "保存复查项目与日期" }),
    );
    expect(current().records.recheckPlans[0]).toMatchObject({
      date: "2026-10-15",
      items: ["血常规"],
      revision: 1,
    });
    fireEvent.click(screen.getByRole("button", { name: "修改复查计划" }));
    dialog = screen.getByRole("dialog", { name: "复查项目时间计划" });
    fireEvent.change(within(dialog).getByLabelText("复查日期"), {
      target: { value: "2026-10-16" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "保存复查项目与日期" }),
    );
    expect(current().records.recheckPlans[0].revision).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: "取消复查计划" }));
    expect(current().records.recheckPlans[0].status).toBe("已取消");
    fireEvent.change(screen.getByLabelText("到期提醒任务"), {
      target: { value: "T" },
    });
    fireEvent.change(screen.getByLabelText("下次回访日期"), {
      target: { value: "2026-10-17" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存下次回访日期" }));
    expect(current().tasks[0].nextVisitDate).toBe("2026-10-17");
  });
});

describe("Queue completion additional interaction boundaries", () => {
  it("persists bottleneck/sex/dependency parameters and immediately uses them in next-station exclusion", () => {
    const s = seed();
    mount(s, <Queue />);
    fireEvent.click(screen.getByRole("button", { name: "编辑当前队列" }));
    const dialog = screen.getByRole("dialog", { name: "业务队列配置" });
    fireEvent.change(within(dialog).getByLabelText("适用性别"), {
      target: { value: "女" },
    });
    fireEvent.click(within(dialog).getByLabelText("设为瓶颈科室（可预排）"));
    fireEvent.change(
      within(dialog).getByLabelText("前置检查项目（顿号分隔）"),
      { target: { value: "一般检查" } },
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "保存并应用队列配置" }),
    );
    expect(
      current().records.queueDefinitions.find((q) => q.id === "采血区"),
    ).toMatchObject({
      sex: "女",
      bottleneck: true,
      dependencies: ["一般检查"],
    });
    expect(
      recommendNextStation(current(), "A0").excluded.find(
        (q) => q.queueId === "采血区",
      )?.reason,
    ).toBe("性别不适用");
  });
  it("runs shared-room UI calls into two actual rooms and switches a persisted single-room mode", () => {
    const s = seed();
    s.records.queueTickets = [ticket("T1", "A0"), ticket("T2", "A1")];
    mount(s, <Queue />);
    fireEvent.change(screen.getByLabelText("诊室工作模式"), {
      target: { value: "multi" },
    });
    fireEvent.click(screen.getByRole("button", { name: "呼叫下一位" }));
    fireEvent.click(screen.getByRole("button", { name: "呼叫下一位" }));
    const calls = current().records.queueTickets.filter(
      (t) => t.status === "calling",
    );
    expect(calls.map((t) => t.roomId).sort()).toEqual(["R1", "R2"]);
    expect(screen.getByLabelText("多诊室正在呼叫")).toHaveTextContent("诊室一");
    expect(screen.getByLabelText("多诊室正在呼叫")).toHaveTextContent("诊室二");
    fireEvent.change(screen.getByLabelText("诊室工作模式"), {
      target: { value: "single" },
    });
    expect(current().config.queueRoomModes["采血区"]).toBe("single");
    fireEvent.click(screen.getByRole("button", { name: "呼叫下一位" }));
    expect(
      current().records.queueTickets.filter((t) => t.status === "calling"),
    ).toHaveLength(2);
  });
  it("changes business date and recomputes visible waiting list and daily totals from mixed-date tickets", () => {
    const s = seed();
    s.records.queueTickets = [
      ticket("T1", "A0"),
      ticket("T2", "A1", "missed", { businessDate: "2026-10-12" }),
    ];
    mount(s, <Queue />);
    expect(screen.getByText(/当前队列待检 1 人次/)).toHaveTextContent(
      "过号 0 人次",
    );
    fireEvent.change(screen.getByLabelText("队列统计业务日期"), {
      target: { value: "2026-10-12" },
    });
    expect(screen.getByText(/当前队列待检 0 人次/)).toHaveTextContent(
      "过号 1 人次",
    );
    expect(
      screen.getByRole("region", { name: "等待客户滚动列表" }),
    ).not.toHaveTextContent("A0");
  });
  it("accepts VIP dictionary names independently of dictionary IDs and rejects mismatched alert identities", () => {
    let s = seed();
    s.patients[0].customerType = "TYPE-1";
    s.records.customerTypes = [{ id: "TYPE-1", name: "VIP专享" }];
    expect(queueCustomerType(s, s.patients[0].id)).toBe("VIP 客户");
    s = act(s, {
      type: "AUTOMATION_CONFIGURE",
      payload: { rules: { autoFollowup: true, abnormalSms: true } },
    });
    s = act(s, {
      type: "UPSERT_RECORD",
      payload: {
        collection: "alerts",
        record: {
          id: "BAD-IDENTITY",
          title: "合成异常",
          risk: "A类",
          appointmentId: "A0",
          patientId: s.patients[1].id,
        },
      },
    });
    expect(s.tasks).toHaveLength(0);
    expect(s.records.businessNotifications || []).toHaveLength(0);
  });
  it("keeps notification read-only for an unauthorized role and disabled queue actions do not dispatch", () => {
    const s = seed();
    s.config.role = "finance";
    mount(s, <BusinessAutomationPanel />);
    expect(
      screen.getByRole("button", { name: "保存业务事件自动规则" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "建立复查项目时间计划" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "预览检前、复查和随访提醒" }),
    ).toBeDisabled();
    expect(
      act(s, {
        type: "QUEUE_SET_ROOM_MODE",
        payload: { queueId: "采血区", mode: "multi" },
      }),
    ).toBe(s);
  });
  it("withdraws unread due reminders on reschedule and completion, and preserves same-priority task order", () => {
    let s = seed();
    s.tasks = [
      {
        id: "S1",
        patientId: s.patients[0].id,
        title: "一",
        risk: "C类",
        date: "2026-10-13",
        status: "待处理",
      },
      {
        id: "S2",
        patientId: s.patients[1].id,
        title: "二",
        risk: "C类",
        date: "2026-10-13",
        status: "待处理",
      },
    ];
    expect(sortByRisk(s, s.tasks).map((t) => t.id)).toEqual(["S1", "S2"]);
    s = act(s, { type: "AUTOMATION_SCAN", payload: { clock: at } });
    expect(s.records.businessNotifications).toHaveLength(2);
    s = act(s, {
      type: "AUTOMATION_SET_FOLLOWUP_DATE",
      payload: { id: "S1", date: "2026-10-15" },
    });
    expect(
      s.records.businessNotifications.find((r) => r.taskId === "S1")?.status,
    ).toBe("已撤销");
    s = act(s, {
      type: "UPDATE_TASK",
      payload: { id: "S2", status: "已完成" },
    });
    expect(
      s.records.businessNotifications.find((r) => r.taskId === "S2")?.status,
    ).toBe("已撤销");
  });
});

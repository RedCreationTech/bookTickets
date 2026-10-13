import { describe, it, expect } from "vitest";
import { createInitialState, reducer } from "../src/model";
import {
  analyzeDemoResults,
  agingBucket,
  numericResultIsValid,
} from "../src/rules";
describe("core domain transitions", () => {
  it("C01 follows appointment → payment → checkin → exam → three reviews → print", () => {
    let s = createInitialState();
    s = reducer(s, {
      type: "CREATE_APPOINTMENT",
      payload: { id: "TEST", patientId: "P001", packageId: "PK01" },
    });
    expect(s.appointments[0].status).toBe("booked");
    s = reducer(s, { type: "PAYMENT", payload: { id: "TEST" } });
    expect(s.appointments[0].status).toBe("paid");
    const paid = s;
    s = reducer(s, { type: "PAYMENT", payload: { id: "TEST" } });
    expect(s).toBe(paid);
    s = reducer(s, {
      type: "CHECKIN",
      payload: { id: "TEST", campus: "东院区" },
    });
    expect(s.appointments[0].campus).toBe("东院区");
    s = reducer(s, {
      type: "SAVE_RESULTS",
      payload: { id: "TEST", results: { 空腹血糖: "5.8" }, complete: true },
    });
    expect(s.appointments[0].status).toBe("review");
    for (let i = 0; i < 3; i++)
      s = reducer(s, {
        type: "REVIEW",
        payload: { id: "TEST", conclusion: "合成示例" },
      });
    expect(s.appointments[0].status).toBe("approved");
    s = reducer(s, { type: "PRINT", payload: { id: "TEST" } });
    expect(s.appointments[0].status).toBe("printed");
    expect(s.appointments[0].printCount).toBe(1);
    expect(s.audit.length).toBeGreaterThan(7);
  });
  it("C02 rejects unpaid checkin and unapproved report printing", () => {
    const s = createInitialState();
    const a = s.appointments.find((a) => a.status === "booked")!;
    expect(reducer(s, { type: "CHECKIN", payload: { id: a.id } })).toBe(s);
    expect(reducer(s, { type: "PRINT", payload: { id: a.id } })).toBe(s);
  });
  it("C03 prevents saving locked clinical results and allows review rejection", () => {
    let s = createInitialState();
    const a = s.appointments.find((a) => a.status === "review")!;
    s = reducer(s, {
      type: "UPDATE_APPOINTMENT",
      payload: { id: a.id, locked: true },
    });
    expect(
      reducer(s, {
        type: "SAVE_RESULTS",
        payload: { id: a.id, results: { 空腹血糖: "9.9" } },
      }),
    ).toBe(s);
    s = reducer(s, { type: "REJECT", payload: { id: a.id, reason: "请复核" } });
    const updated = s.appointments.find((x) => x.id === a.id)!;
    expect(updated.status).toBe("in_exam");
    expect(updated.locked).toBe(false);
    expect(updated.rejectReason).toBe("请复核");
  });
  it("C04 preserves deletions and records audit across collection mutations", () => {
    let s = createInitialState();
    s = reducer(s, {
      type: "UPSERT_RECORD",
      payload: { collection: "tickets", record: { id: "R", name: "测试" } },
    });
    expect(s.records.tickets).toHaveLength(1);
    s = reducer(s, {
      type: "DELETE_RECORD",
      payload: { collection: "tickets", id: "R" },
    });
    expect(s.records.tickets).toEqual([]);
    expect(s.audit[0].message).toContain("删除");
  });
  it("C05 creates and completes linked followup task", () => {
    let s = createInitialState();
    s = reducer(s, {
      type: "ADD_TASK",
      payload: { patientId: "P003", title: "异常复核", risk: "A类" },
    });
    const task = s.tasks[0];
    expect(task.status).toBe("待处理");
    s = reducer(s, {
      type: "UPDATE_TASK",
      payload: { id: task.id, status: "已完成", result: "已联系并记录" },
    });
    expect(s.tasks[0].status).toBe("已完成");
  });
  it("C06 resets state without retaining modified config", () => {
    let s = createInitialState();
    s = reducer(s, {
      type: "UPDATE_CONFIG",
      payload: { role: "doctor", dailyCapacity: 12 },
    });
    s = reducer(s, { type: "RESET" });
    expect(s.config.role).toBe("admin");
    expect(s.config.dailyCapacity).toBe(80);
  });
});
describe("synthetic demo rules", () => {
  it("C07 merges multiple abnormal indicators, not a fixed unrelated conclusion", () => {
    const x = analyzeDemoResults({
      空腹血糖: "8.9",
      血脂四项: "偏高",
      一般检查: "145/85",
    });
    expect(x.alerts).toHaveLength(3);
    expect(x.merged).toContain("联合复核");
    expect(analyzeDemoResults({ 空腹血糖: "5.5" }).alerts).toHaveLength(0);
  });
  it("C08 assigns mutually exclusive aging boundary buckets", () => {
    expect([0, 30, 31, 60, 61, 90, 91, 180, 181].map(agingBucket)).toEqual([
      0, 0, 1, 1, 2, 2, 3, 3, 4,
    ]);
  });
  it("C09 validates numeric results", () => {
    expect(numericResultIsValid("")).toBe(false);
    expect(numericResultIsValid("正常")).toBe(false);
    expect(numericResultIsValid("5.8")).toBe(true);
  });
});

import type { Action, Appointment, DemoState } from "../model";
export interface ReportFilters {
  mode: "fuzzy" | "exact";
  name: string;
  appointmentId: string;
  identity: string;
  company: string;
  doctor: string;
  from: string;
  to: string;
}
export const defaultReportFilters: ReportFilters = {
  mode: "fuzzy",
  name: "",
  appointmentId: "",
  identity: "",
  company: "",
  doctor: "",
  from: "",
  to: "",
};
type Row = Record<string, any>;
const ready = (a: Appointment) => ["approved", "printed"].includes(a.status);
const dayValid = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
export function reportMainDoctor(a: Appointment): string {
  const history = [
    ...(a.reviewHistory || []),
    ...(a.stageMetadata || []),
  ].filter(
    (r) =>
      ["主检", "主检审核"].includes(r.node || r.stage) &&
      (r.status === "已通过" || !!r.completedAt) &&
      r.status !== "已驳回",
  );
  return a.mainReviewDoctor || a.mainDoctor || history.at(-1)?.doctor || "";
}
export function reportAccessible(state: DemoState, a?: Appointment) {
  const role = (state.records.roles || []).find(
    (r) => r.id === state.config.customRoleId,
  );
  if (!a)
    return role
      ? !!role.menuPaths?.includes("/reports")
      : ["admin", "reception", "doctor", "reviewer", "finance"].includes(
          state.config.role,
        );
  const p = state.patients.find((p) => p.id === a.patientId);
  if (!p) return false;
  return role
    ? !!role.menuPaths?.includes("/reports") &&
        (!role.allowedPatientIds?.length ||
          role.allowedPatientIds.includes(a.patientId)) &&
        (!role.allowedCampus || role.allowedCampus === a.campus) &&
        (!role.examTypes?.length ||
          role.examTypes.includes(
            a.orderType || (p.company === "个检" ? "个检" : "团检"),
          ))
    : ["admin", "reception", "doctor", "reviewer", "finance"].includes(
        state.config.role,
      );
}
export function filterReports(
  state: DemoState,
  appointments: Appointment[],
  filters: Partial<ReportFilters> = {},
) {
  const f = { ...defaultReportFilters, ...filters };
  if (
    (f.from && !dayValid(f.from)) ||
    (f.to && !dayValid(f.to)) ||
    (f.from && f.to && f.from > f.to)
  )
    return [];
  const match = (source: unknown, query: string) =>
    !query.trim() ||
    (f.mode === "exact"
      ? String(source || "").toLocaleLowerCase() ===
        query.trim().toLocaleLowerCase()
      : String(source || "")
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase()));
  return appointments.filter((a) => {
    const p = state.patients.find((p) => p.id === a.patientId);
    return (
      ready(a) &&
      reportAccessible(state, a) &&
      match(p?.name, f.name) &&
      match(a.id, f.appointmentId) &&
      match(
        p?.certificate || p?.identityNo || p?.idNumber || p?.documentNo,
        f.identity,
      ) &&
      match(p?.company, f.company) &&
      match(reportMainDoctor(a), f.doctor) &&
      (!f.from || a.date >= f.from) &&
      (!f.to || a.date <= f.to)
    );
  });
}
export function reportCabinetLabel(state: DemoState, slotId: string) {
  const slot = (state.records.reportCabinetSlots || []).find(
    (s) => s.id === slotId,
  );
  const category = (state.records.reportCabinetCategories || []).find(
    (c) => c.id === slot?.categoryId,
  );
  return slot ? `${category?.name || "未分类"}/${slot.name}` : "";
}
export function getReportArchive(state: DemoState, appointmentId: string) {
  const a = state.appointments.find((a) => a.id === appointmentId);
  const record = (state.records.reportArchives || []).find(
    (r) => r.id === appointmentId,
  );
  return {
    id: appointmentId,
    appointmentId,
    inventoryStatus:
      record?.inventoryStatus ||
      (a?.delivered ? "issued" : a?.cabinet ? "legacy_location" : "unrecorded"),
    printedBy: record?.printedBy || a?.printedBy || "",
    printedAt: record?.printedAt || a?.printedAt || "",
    boundBy: record?.boundBy || "",
    boundAt: record?.boundAt || "",
    handedBy: record?.handedBy || "",
    handedAt: record?.handedAt || "",
    ...record,
    cabinet: record?.slotId
      ? reportCabinetLabel(state, record.slotId)
      : record?.inventoryStatus === "out" ||
          record?.inventoryStatus === "issued"
        ? ""
        : a?.cabinet || "",
    history: (state.records.reportArchiveEvents || []).filter(
      (r) => r.appointmentId === appointmentId,
    ),
  };
}
export type ArchiveOperation =
  "print" | "bind" | "handoff" | "stock_in" | "stock_out" | "move" | "issue";
export const archiveOperationLabels: Record<ArchiveOperation, string> = {
  print: "登记模拟打印",
  bind: "登记模拟装订",
  handoff: "登记报告交接",
  stock_in: "报告入库",
  stock_out: "报告出库",
  move: "报告移柜",
  issue: "报告发放领取",
};
export interface ReportArchiveInput {
  requestId: string;
  appointmentIds: string[];
  operation: ArchiveOperation;
  actor: string;
  at: string;
  slotId?: string;
  receiver?: string;
  recipient?: string;
  method?: string;
  note?: string;
  expected?: Record<string, string>;
}
export function archiveVersion(state: DemoState, id: string) {
  const a = state.appointments.find((a) => a.id === id);
  const flow = getReportArchive(state, id);
  return JSON.stringify([
    a?.status,
    a?.archiveLocked,
    a?.delivered,
    a?.printCount,
    a?.printedAt,
    flow.inventoryStatus,
    flow.slotId,
    flow.revision || 0,
  ]);
}
export function validateReportArchiveOperation(
  state: DemoState,
  p: ReportArchiveInput,
): string[] {
  const errors: string[] = [];
  const ids = [...new Set(p.appointmentIds || [])];
  if (!archiveOperationLabels[p.operation]) return ["请选择有效流转动作。"];
  if (!p.requestId || !ids.length)
    errors.push("请至少选择一份报告，并使用一次性操作编号。");
  if (!p.actor?.trim()) errors.push("请填写合成操作人员。");
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$/.test(p.at || "") ||
    !Number.isFinite(Date.parse(p.at)) ||
    !dayValid(p.at.slice(0, 10))
  )
    errors.push("请填写有效流转时间（UTC）。");
  if (
    (state.records.reportArchiveBatches || []).some((b) => b.id === p.requestId)
  )
    errors.push("此批操作已执行，不能重复登记。");
  const storing = ["stock_in", "move"].includes(p.operation);
  const slot = (state.records.reportCabinetSlots || []).find(
    (r) => r.id === p.slotId && r.status === "已启用",
  );
  const category = (state.records.reportCabinetCategories || []).find(
    (r) => r.id === slot?.categoryId && r.status === "已启用",
  );
  if (storing && (!slot || !category))
    errors.push("请选择已启用类别中的可用柜位。");
  for (const id of ids) {
    const a = state.appointments.find((a) => a.id === id);
    const flow = getReportArchive(state, id);
    if (!a || !ready(a) || !reportAccessible(state, a)) {
      errors.push(`${id}：报告未审核、已撤销或超出当前授权范围。`);
      continue;
    }
    if (
      flow.history.some(
        (event: Row) =>
          Number.isFinite(Date.parse(event.at)) &&
          Date.parse(event.at) > Date.parse(p.at),
      )
    )
      errors.push(`${id}：流转时间早于已登记阶段，请核对时间。`);
    if (a.archiveLocked) {
      errors.push(`${id}：档案流转已锁定。`);
      continue;
    }
    if (
      p.expected?.[id] !== undefined &&
      p.expected[id] !== archiveVersion(state, id)
    )
      errors.push(`${id}：预览后报告状态已变化，请重新预览。`);
    if (flow.inventoryStatus === "issued" || a.delivered)
      errors.push(`${id}：报告已发放，不重复登记物理流转。`);
    if (p.operation === "print" && flow.printedAt && !p.note?.trim())
      errors.push(`${id}：重新打印必须填写原因。`);
    if (
      ["bind", "handoff", "stock_in", "move"].includes(p.operation) &&
      !flow.printedAt
    )
      errors.push(`${id}：尚未登记打印事实，不能进行后续纸质报告流转。`);
    if (p.operation === "bind" && flow.boundAt)
      errors.push(`${id}：本次打印版本已装订。`);
    if (p.operation === "handoff" && (!flow.boundAt || !p.receiver?.trim()))
      errors.push(`${id}：交接需要已装订报告和接收人员。`);
    if (p.operation === "handoff" && flow.handedAt)
      errors.push(`${id}：本次打印版本已交接。`);
    if (p.operation === "stock_in" && flow.inventoryStatus === "in")
      errors.push(`${id}：已在库，请使用移柜或出库。`);
    if (
      ["stock_out", "move"].includes(p.operation) &&
      flow.inventoryStatus !== "in"
    )
      errors.push(`${id}：当前不在库，不能出库或移柜。`);
    if (p.operation === "move" && flow.slotId === p.slotId)
      errors.push(`${id}：目标柜位与原柜位相同。`);
    if (p.operation === "issue") {
      if (
        !p.recipient?.trim() ||
        !["个人领取", "单位领取", "代领", "邮寄（模拟）", "线上查询"].includes(
          p.method || "",
        )
      )
        errors.push(`${id}：发放必须填写合成领取人并选择领取方式。`);
      if (p.method !== "线上查询" && !flow.printedAt)
        errors.push(`${id}：纸质发放前请登记打印事实。`);
    }
  }
  if (storing && slot) {
    const occupied = (state.records.reportArchives || []).filter(
      (r) =>
        r.inventoryStatus === "in" &&
        r.slotId === slot.id &&
        !ids.includes(r.appointmentId),
    ).length;
    if (occupied + ids.length > Number(slot.capacity))
      errors.push(
        `目标柜位容量不足：现有 ${occupied} 份，本次 ${ids.length} 份，上限 ${slot.capacity} 份。`,
      );
  }
  return [...new Set(errors)];
}
function upsert(state: DemoState, collection: string, record: Row): DemoState {
  const rows = state.records[collection] || [];
  return {
    ...state,
    records: {
      ...state.records,
      [collection]: rows.some((r) => r.id === record.id)
        ? rows.map((r) => (r.id === record.id ? { ...r, ...record } : r))
        : [record, ...rows],
    },
  };
}
function audit(
  state: DemoState,
  action: Action,
  message: string,
  at: string,
): DemoState {
  return {
    ...state,
    audit: [
      {
        id: `ARCHIVE-AUDIT-${action.payload?.requestId || action.payload?.id || state.audit.length}-${at}`,
        time: at,
        actor: action.payload?.actor || state.config.role,
        action: action.type,
        entity: action.payload?.requestId || action.payload?.id,
        message,
      },
      ...state.audit,
    ].slice(0, 1000),
  };
}
export function reduceReportArchiveAction(
  state: DemoState,
  action: Action,
): DemoState | undefined {
  if (!action.type.startsWith("REPORT_ARCHIVE_")) return undefined;
  const p = action.payload || {};
  const at = p.at || state.audit[0]?.time || "1970-01-01T00:00:00Z";
  if (!reportAccessible(state)) return state;
  if (action.type === "REPORT_ARCHIVE_SAVE_CATEGORY") {
    if (!p.id || !p.name?.trim() || !["已启用", "已停用"].includes(p.status))
      return state;
    if (
      (state.records.reportCabinetCategories || []).some(
        (r) =>
          r.id !== p.id && r.status !== "已删除" && r.name === p.name.trim(),
      )
    )
      return state;
    if (
      p.status === "已停用" &&
      (state.records.reportArchives || []).some(
        (r) =>
          r.inventoryStatus === "in" &&
          (state.records.reportCabinetSlots || []).find(
            (s) => s.id === r.slotId,
          )?.categoryId === p.id,
      )
    )
      return state;
    let next = upsert(state, "reportCabinetCategories", {
      id: p.id,
      name: p.name.trim(),
      status: p.status,
    });
    next = {
      ...next,
      appointments: next.appointments.map((a) => {
        const flow = getReportArchive(next, a.id);
        return flow.inventoryStatus === "in"
          ? { ...a, cabinet: flow.cabinet }
          : a;
      }),
    };
    return audit(
      next,
      action,
      "报告柜类别已保存，按稳定ID保留柜位及报告关联",
      at,
    );
  }
  if (action.type === "REPORT_ARCHIVE_SAVE_SLOT") {
    if (
      !p.id ||
      !p.name?.trim() ||
      !Number.isInteger(Number(p.capacity)) ||
      Number(p.capacity) < 1 ||
      Number(p.capacity) > 10000 ||
      !["已启用", "已停用"].includes(p.status)
    )
      return state;
    if (
      !(state.records.reportCabinetCategories || []).some(
        (r) => r.id === p.categoryId && r.status === "已启用",
      )
    )
      return state;
    if (
      (state.records.reportCabinetSlots || []).some(
        (r) =>
          r.id !== p.id &&
          r.status !== "已删除" &&
          r.categoryId === p.categoryId &&
          r.name === p.name.trim(),
      )
    )
      return state;
    const occupied = (state.records.reportArchives || []).filter(
      (r) => r.inventoryStatus === "in" && r.slotId === p.id,
    ).length;
    if (occupied > Number(p.capacity) || (occupied && p.status === "已停用"))
      return state;
    let next = upsert(state, "reportCabinetSlots", {
      id: p.id,
      name: p.name.trim(),
      categoryId: p.categoryId,
      capacity: Number(p.capacity),
      status: p.status,
    });
    next = {
      ...next,
      appointments: next.appointments.map((a) => {
        const flow = getReportArchive(next, a.id);
        return flow.inventoryStatus === "in"
          ? { ...a, cabinet: flow.cabinet }
          : a;
      }),
    };
    return audit(next, action, "报告柜位已保存；当前库存位置与名称同步", at);
  }
  if (action.type === "REPORT_ARCHIVE_DELETE_LOCATION") {
    if (p.kind === "category") {
      if (
        (state.records.reportCabinetSlots || []).some(
          (r) => r.categoryId === p.id && r.status !== "已删除",
        )
      )
        return state;
      const row = (state.records.reportCabinetCategories || []).find(
        (r) => r.id === p.id && r.status !== "已删除",
      );
      if (!row) return state;
      return audit(
        upsert(state, "reportCabinetCategories", { ...row, status: "已删除" }),
        action,
        "报告柜类别软删除，历史关联保留",
        at,
      );
    }
    if (p.kind === "slot") {
      if (
        (state.records.reportArchives || []).some(
          (r) => r.inventoryStatus === "in" && r.slotId === p.id,
        )
      )
        return state;
      const row = (state.records.reportCabinetSlots || []).find(
        (r) => r.id === p.id && r.status !== "已删除",
      );
      if (!row) return state;
      return audit(
        upsert(state, "reportCabinetSlots", { ...row, status: "已删除" }),
        action,
        "空柜位软删除，历史位置快照保留",
        at,
      );
    }
    return state;
  }
  if (action.type === "REPORT_ARCHIVE_APPLY") {
    if (validateReportArchiveOperation(state, p).length) return state;
    let next = state;
    for (const id of [...new Set<string>(p.appointmentIds)]) {
      const a = next.appointments.find((a) => a.id === id)!;
      const current = getReportArchive(next, id);
      const { history: _history, ...flow } = current;
      const updated: Row = {
        ...flow,
        revision: Number(flow.revision || 0) + 1,
      };
      const patch: Row = {};
      if (p.operation === "print") {
        Object.assign(updated, {
          printedBy: p.actor.trim(),
          printedAt: p.at,
          boundBy: "",
          boundAt: "",
          handedBy: "",
          handedAt: "",
        });
        Object.assign(patch, {
          status: "printed",
          printedAt: p.at,
          printedBy: p.actor.trim(),
          printCount: (a.printCount || 0) + 1,
        });
      }
      if (p.operation === "bind")
        Object.assign(updated, { boundBy: p.actor.trim(), boundAt: p.at });
      if (p.operation === "handoff")
        Object.assign(updated, {
          handedBy: p.actor.trim(),
          handedAt: p.at,
          handoffReceiver: p.receiver.trim(),
        });
      if (["stock_in", "move"].includes(p.operation)) {
        Object.assign(updated, {
          inventoryStatus: "in",
          slotId: p.slotId,
          storedAt: p.at,
          storedBy: p.actor.trim(),
        });
        patch.cabinet = reportCabinetLabel(next, p.slotId);
      }
      if (p.operation === "stock_out") {
        Object.assign(updated, {
          inventoryStatus: "out",
          previousSlotId: flow.slotId,
          slotId: "",
          outAt: p.at,
          outBy: p.actor.trim(),
        });
        patch.cabinet = "";
      }
      if (p.operation === "issue") {
        Object.assign(updated, {
          inventoryStatus: "issued",
          previousSlotId: flow.slotId,
          slotId: "",
          issuedBy: p.actor.trim(),
          issuedAt: p.at,
          recipient: p.recipient.trim(),
          method: p.method,
        });
        Object.assign(patch, {
          cabinet: "",
          delivered: true,
          deliveredAt: p.at,
          deliveredBy: p.actor.trim(),
          recipient: p.recipient.trim(),
          deliveryMethod: p.method,
        });
      }
      const event = {
        id: `${p.requestId}-${id}`,
        batchId: p.requestId,
        appointmentId: id,
        operation: p.operation,
        label: archiveOperationLabels[p.operation as ArchiveOperation],
        actor: p.actor.trim(),
        at: p.at,
        receiver: p.receiver?.trim() || "",
        recipient: p.recipient?.trim() || "",
        method: p.method || "",
        note: p.note?.trim() || "",
        fromSlotId: flow.slotId || "",
        fromCabinet: flow.cabinet || "",
        toSlotId: updated.slotId || "",
        toCabinet: updated.slotId
          ? reportCabinetLabel(next, updated.slotId)
          : "",
        synthetic: true,
      };
      next = upsert(next, "reportArchives", updated);
      next = upsert(next, "reportArchiveEvents", event);
      next = {
        ...next,
        appointments: next.appointments.map((row) =>
          row.id === id ? { ...row, ...patch } : row,
        ),
      };
    }
    next = upsert(next, "reportArchiveBatches", {
      id: p.requestId,
      appointmentIds: [...new Set(p.appointmentIds)],
      operation: p.operation,
      actor: p.actor.trim(),
      at: p.at,
    });
    return audit(
      next,
      action,
      `${archiveOperationLabels[p.operation as ArchiveOperation]}：${p.appointmentIds.length} 份报告；仅本地模拟流转`,
      p.at,
    );
  }
  return state;
}
export function augmentReportArchiveEvents(
  previous: DemoState,
  next: DemoState,
  action: Action,
): DemoState {
  if (previous === next || action.type !== "PRINT") return next;
  const id = action.payload?.id;
  const a = next.appointments.find((a) => a.id === id);
  const before = previous.appointments.find((a) => a.id === id);
  if (
    !a ||
    !before ||
    !ready(a) ||
    Number(a.printCount || 0) <= Number(before.printCount || 0) ||
    !a.printedAt
  )
    return next;
  const eventId = `LEGACY-PRINT-${id}-${a.printCount}`;
  if ((next.records.reportArchiveEvents || []).some((r) => r.id === eventId))
    return next;
  const flow = getReportArchive(next, id);
  const { history: _history, ...row } = flow;
  const actor =
    action.payload?.actor || next.config.operatorName || next.config.role;
  let result = upsert(next, "reportArchives", {
    ...row,
    printedAt: a.printedAt,
    printedBy: actor,
    boundAt: "",
    boundBy: "",
    handedAt: "",
    handedBy: "",
    revision: Number(row.revision || 0) + 1,
  });
  result = upsert(result, "reportArchiveEvents", {
    id: eventId,
    appointmentId: id,
    operation: "print",
    label: "既有入口模拟打印",
    actor,
    at: a.printedAt,
    synthetic: true,
    note: "来自成功PRINT状态转移；装订与交接人员未单独登记，不推断其完成。",
  });
  if (action.payload?.bound === true && action.payload?.source === "kiosk") {
    const requestedAt = action.payload.boundAt;
    const boundAt =
      typeof requestedAt === "string" &&
      Number.isFinite(Date.parse(requestedAt)) &&
      Date.parse(requestedAt) >= Date.parse(a.printedAt)
        ? requestedAt
        : a.printedAt;
    result = upsert(result, "reportArchives", {
      id,
      appointmentId: id,
      boundAt,
      boundBy: actor,
    });
    result = upsert(result, "reportArchiveEvents", {
      id: `KIOSK-BIND-${id}-${a.printCount}`,
      appointmentId: id,
      operation: "bind",
      label: "自助机模拟装订完成",
      actor,
      at: boundAt,
      synthetic: true,
      note: "本次自助机打印与装订进度成功结束后显式回传本地模拟事实；不代表真实硬件回执。",
    });
  }
  return result;
}

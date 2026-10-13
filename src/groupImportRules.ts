import type { Appointment, DemoState, Patient } from "./model";
import { getBookingAvailability, normalizeBookingTime } from "./bookingRules";
import {
  getOrderRules,
  getOrderingIssues,
  packageAvailableAtCampus,
} from "./orderingRules";
export type ImportIdentityMode = "demo" | "synthetic-id" | "special-empty";
const stableKey = (value: string) => {
  let hash = 2166136261;
  for (const character of value)
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(36);
};
export function syntheticIdentityCheck(identity: string): string[] {
  if (!/^SYNTHETIC-999999\d{11}[0-9X]$/.test(identity))
    return [
      "测试身份证须为 SYNTHETIC- 加 18 位号码，且地区固定为虚构 999999；不接受真实证件",
    ];
  const digits = identity.slice(10),
    birth = `${digits.slice(6, 10)}-${digits.slice(10, 12)}-${digits.slice(12, 14)}`;
  const date = new Date(`${birth}T12:00:00Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== birth ||
    birth > new Date().toISOString().slice(0, 10)
  )
    return ["合成身份证出生日期无效"];
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2],
    codes = "10X98765432";
  return codes[
    digits
      .slice(0, 17)
      .split("")
      .reduce((sum, c, index) => sum + Number(c) * weights[index], 0) % 11
  ] === digits[17]
    ? []
    : ["合成身份证校验位错误"];
}
export function makeSyntheticIdentity(birth = "19900101", sequence = "001") {
  const prefix = `999999${birth}${sequence}`;
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  return `SYNTHETIC-${prefix}${"10X98765432"[prefix.split("").reduce((n, c, i) => n + Number(c) * weights[i], 0) % 11]}`;
}
export function resolveGroupImportRow(
  state: DemoState,
  row: {
    name: string;
    identity: string;
    group: string;
    packageName: string;
    date: string;
    line?: number;
  },
  options: {
    identityMode?: ImportIdentityMode;
    company?: string;
    groupOrderId?: string;
  } = {},
) {
  const mode = options.identityMode || "demo",
    errors: string[] = [];
  let patient: Patient | undefined, newPatient: Patient | undefined;
  const groups = state.records.groupPersonnelGroups || [],
    contracts = state.records.groupOrders || [];
  const explicitGroup = groups.find(
    (g) => g.name === row.group || g.id === row.group,
  );
  const explicitContract = contracts.find(
    (g) => g.id === (options.groupOrderId || explicitGroup?.groupOrderId),
  );
  const company =
    options.company ||
    explicitContract?.company ||
    (state.patients.some((p) => p.company === row.group)
      ? row.group
      : "合成特殊团检");
  if (mode === "demo" || row.identity.startsWith("DEMO-")) {
    patient = state.patients.find(
      (p) => `DEMO-${p.id}` === row.identity || p.certificate === row.identity,
    );
    if (!/^DEMO-[A-Za-z0-9-]+$/.test(row.identity) || !patient)
      errors.push("普通导入须使用已登记的 DEMO-患者编号或合成证件标识");
  } else if (mode === "synthetic-id") {
    errors.push(...syntheticIdentityCheck(row.identity));
    patient = state.patients.find(
      (p) =>
        p.certificate === row.identity || p.syntheticIdentity === row.identity,
    );
    if (!patient && !errors.length) {
      const id = `P-TEST-ID-${stableKey(row.identity)}`;
      newPatient = {
        id,
        name: row.name,
        sex: "未指定",
        age: new Date().getUTCFullYear() - Number(row.identity.slice(16, 20)),
        company,
        phone: "合成未填写",
        risk: "待评估",
        certificate: row.identity,
        syntheticIdentity: row.identity,
        certificateType: "合成测试身份证",
      };
      patient = newPatient;
    }
  } else if (mode === "special-empty") {
    if (row.identity)
      errors.push("特殊免证件模式仅接受空证件或已登记 DEMO 标识");
    const candidates = state.patients.filter(
      (p) => p.name === row.name && p.company === company,
    );
    if (candidates.length > 1)
      errors.push("同单位存在同名客户，请使用唯一 DEMO 标识");
    patient = candidates[0];
    if (!patient && row.name.trim()) {
      const id = `P-SPECIAL-${stableKey(`${company}|${row.name.trim()}`)}`;
      newPatient = {
        id,
        name: row.name.trim(),
        sex: "未指定",
        age: 30,
        company,
        phone: "合成未填写",
        risk: "待评估",
        certificate: "",
        certificateType: "特殊团检免证件",
        syntheticPersonnelKey: id,
      };
      patient = newPatient;
    }
  }
  if (!row.name.trim()) errors.push("姓名不能为空");
  if (patient && patient.name !== row.name.trim())
    errors.push("姓名与该合成身份不匹配");
  const memberships = patient
    ? groups.filter(
        (g) =>
          g.members?.includes(patient!.id) &&
          (!options.groupOrderId || g.groupOrderId === options.groupOrderId),
      )
    : [];
  const selectedGroup =
    explicitGroup || (memberships.length === 1 ? memberships[0] : undefined);
  if (!explicitGroup && memberships.length > 1)
    errors.push("客户属于多个人员分组，请明确填写分组或选择单位订单");
  if (explicitGroup && !explicitGroup.members?.includes(patient?.id))
    errors.push("客户不属于所填人员分组");
  const contract =
    contracts.find(
      (g) => g.id === (options.groupOrderId || selectedGroup?.groupOrderId),
    ) || explicitContract;
  if (
    contract &&
    (contract.company !== patient?.company ||
      contract.status !== "生效" ||
      (contract.startDate && row.date < contract.startDate) ||
      (contract.endDate && row.date > contract.endDate))
  )
    errors.push("人员分组对应的单位订单不适用此客户或预约日期");
  if (
    options.groupOrderId &&
    selectedGroup &&
    selectedGroup.groupOrderId !== options.groupOrderId
  )
    errors.push("人员分组不属于所选单位订单");
  const requested = state.packages.find(
    (p) => p.id === row.packageName || p.name === row.packageName,
  );
  const packageId = selectedGroup?.packageId || requested?.id;
  if (selectedGroup && requested && requested.id !== selectedGroup.packageId)
    errors.push("导入套餐与人员分组约定套餐不一致");
  if (!packageId || !state.packages.some((p) => p.id === packageId))
    errors.push("套餐不存在且未匹配到人员分组套餐");
  return {
    patientId: patient?.id,
    newPatient,
    packageId,
    groupPersonnelId: selectedGroup?.id,
    groupPersonnelName: selectedGroup?.name,
    groupOrderId: contract?.id,
    company: patient?.company || company,
    syntheticPersonnelKey: patient?.syntheticPersonnelKey,
    errors: errors.map((error) =>
      row.line ? `第 ${row.line} 行：${error}` : error,
    ),
  };
}
export function itemAvailableAtCampus(
  state: DemoState,
  item: string,
  campus: string,
): boolean {
  const row = getOrderRules(state).find((r) => r.item === item) as any;
  return (
    row?.enabled !== false &&
    (!Array.isArray(row?.campuses) ||
      !row.campuses.length ||
      row.campuses.includes(campus))
  );
}
export function validateCampusItems(
  state: DemoState,
  items: string[],
  campus: string,
) {
  return items
    .filter((item) => !itemAvailableAtCampus(state, item, campus))
    .map((item) => `${item}不适用${campus}`);
}
export function getGroupOrderBookingRules(
  state: DemoState,
  groupOrderId: string,
) {
  return (state.records.groupOrderBookingRules || []).find(
    (r) => r.groupOrderId === groupOrderId,
  );
}
export function validateGroupOrderBooking(
  state: DemoState,
  groupOrderId: string,
  input: {
    patientId: string;
    date: string;
    time: string;
    ignoreAppointmentId?: string;
    packageIds?: string[];
    items?: string[];
  },
) {
  const group = (state.records.groupOrders || []).find(
      (g) => g.id === groupOrderId,
    ),
    rule = getGroupOrderBookingRules(state, groupOrderId),
    errors: string[] = [];
  if (!group || group.status !== "生效") return ["请选择有效的单位订单"];
  const patient = state.patients.find((p) => p.id === input.patientId);
  if (
    patient?.company !== group.company ||
    (group.members?.length && !group.members.includes(input.patientId))
  )
    errors.push("此客户不属于所选单位订单");
  const start = rule?.startDate || group.startDate,
    end = rule?.endDate || group.endDate;
  if (rule?.enabled === false) errors.push("所选单位订单暂停预约");
  if ((start && input.date < start) || (end && input.date > end))
    errors.push(`该单位订单仅可预约 ${start || "不限"} 至 ${end || "不限"}`);
  if (
    rule?.allowedTimes &&
    !String(rule.allowedTimes)
      .split(/[;；,，\n]/)
      .map(normalizeBookingTime)
      .includes(normalizeBookingTime(input.time))
  )
    errors.push("此时段不在所选单位订单排期内");
  const used = state.appointments.filter(
    (a) =>
      a.groupOrderId === groupOrderId &&
      a.date === input.date &&
      a.status !== "cancelled" &&
      a.id !== input.ignoreAppointmentId,
  ).length;
  if (
    rule &&
    Number.isFinite(Number(rule.dailyCapacity)) &&
    used >= Number(rule.dailyCapacity)
  )
    errors.push("所选单位订单的独立日容量已满");
  const base = getBookingAvailability(
    state,
    input.date,
    input.ignoreAppointmentId,
    {
      patientId: input.patientId,
      company: group.company,
      kind: "group",
      time: input.time,
      checkQuestionnaire: false,
      packageIds: input.packageIds,
      items: input.items,
    },
  );
  if (!base.allowed) errors.push(base.error);
  return [...new Set(errors)];
}
export function groupPackageChoices(
  state: DemoState,
  patientId: string,
  campus: string,
  groupOrderId: string,
  showAll: boolean,
) {
  const group = (state.records.groupOrders || []).find(
      (g) => g.id === groupOrderId,
    ),
    allowed = group?.packages || [];
  return state.packages
    .filter((p) => showAll || !group || allowed.includes(p.id))
    .map((p) => {
      const errors = [
        ...getOrderingIssues(state, patientId, p.items, [p.id]),
        ...validateCampusItems(state, p.items, campus),
      ];
      if (!packageAvailableAtCampus(state, p.id, campus))
        errors.push("套餐院区不适用");
      const unitCovered = !!group && allowed.includes(p.id);
      return {
        ...p,
        unitCovered,
        personalPay: !!group && !unitCovered,
        errors,
        available: !errors.length,
      };
    })
    .sort(
      (a, b) =>
        Number(b.unitCovered) - Number(a.unitCovered) ||
        a.name.localeCompare(b.name),
    );
}

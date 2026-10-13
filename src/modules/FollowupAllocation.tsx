import { useRef, useState } from "react";
import { useDemo } from "../store";
import type { DemoState } from "../model";
import { defaultCustomerTypes } from "./Registration";
import type { Row } from "./Operations";
export interface FollowupFilters {
  patientId: string;
  customerType: string;
  status: string;
  query: string;
}
export function customerTypeOptions(state: DemoState) {
  const configured = state.records.customerTypes ?? defaultCustomerTypes;
  const result = configured.map((t) => ({
    id: String(t.id),
    name: String(t.name),
  }));
  for (const patient of state.patients)
    if (
      patient.customerType &&
      !result.some((t) => t.id === patient.customerType)
    )
      result.push({
        id: patient.customerType,
        name: `未匹配字典：${patient.customerType}`,
      });
  return result;
}
export function filterFollowupTasks(
  state: DemoState,
  filters: FollowupFilters,
) {
  return state.tasks.filter((task) => {
    const patient = state.patients.find((p) => p.id === task.patientId);
    if (!patient) return false;
    return (
      (!filters.patientId || task.patientId === filters.patientId) &&
      (!filters.customerType ||
        (filters.customerType === "__missing__"
          ? !patient.customerType
          : patient.customerType === filters.customerType)) &&
      (!filters.status || task.status === filters.status) &&
      `${task.title || ""}${patient.name}`.includes(filters.query.trim())
    );
  });
}
const isOpen = (t: Row) => ["待处理", "进行中"].includes(t.status);
export function isAllocatableTask(state: DemoState, task: Row) {
  return (
    isOpen(task) &&
    !task.locked &&
    state.patients.some((p) => p.id === task.patientId) &&
    !(state.records.followupLocks || []).some(
      (l) => l.patientId === task.patientId && l.status === "locked",
    )
  );
}
export function followupOwnerOptions(state: DemoState) {
  const staff = state.records.staff || [];
  const approved = staff
    .filter((s) => ["已通过", "已启用", "active"].includes(s.status))
    .map((s) => String(s.name));
  const existing = state.tasks
    .filter((t) => state.patients.some((p) => p.id === t.patientId))
    .map((t) => String(t.owner || ""))
    .filter(
      (name) =>
        name &&
        !["未分配", "无"].includes(name) &&
        !staff.some((s) => s.name === name),
    );
  return [...new Set([...approved, ...existing])].sort();
}
export interface FollowupAssignment {
  id: string;
  patientId: string;
  title: string;
  from: string;
  to: string;
  status: string;
}
export function allocationLoads(
  tasks: Row[],
  owners: string[],
  assignments: FollowupAssignment[] = [],
) {
  const counts = Object.fromEntries(
    owners.map((owner) => [
      owner,
      tasks.filter((t) => isOpen(t) && (t.owner || "未分配") === owner).length,
    ]),
  );
  const after = { ...counts };
  for (const row of assignments)
    if (row.to) {
      const from = row.from || "未分配";
      if (from in after) after[from]--;
      if (row.to in after) after[row.to]++;
    }
  return owners.map((owner) => ({
    owner,
    before: counts[owner],
    after: after[owner],
    assigned: assignments.filter((a) => a.to === owner).length,
  }));
}
export function buildFollowupAllocation(
  state: DemoState,
  filters: FollowupFilters,
  owners: string[],
  mode: "workload" | "average",
) {
  const permitted = new Set(followupOwnerOptions(state));
  const targets = [...new Set(owners)].filter((o) => permitted.has(o)).sort();
  const tasks = filterFollowupTasks(state, filters)
    .filter((t) => isAllocatableTask(state, t))
    .sort(
      (a, b) =>
        String(a.date || "").localeCompare(String(b.date || "")) ||
        String(a.id).localeCompare(String(b.id)),
    );
  if (!targets.length) return [];
  const remaining = state.tasks.filter(
    (t) =>
      state.patients.some((p) => p.id === t.patientId) &&
      !tasks.some((s) => s.id === t.id),
  );
  const loads = Object.fromEntries(
    targets.map((o) => [
      o,
      remaining.filter((t) => isOpen(t) && t.owner === o).length,
    ]),
  );
  const allocated = Object.fromEntries(targets.map((o) => [o, 0]));
  return tasks.map((task) => {
    const owner = [...targets].sort(
      (a, b) =>
        (mode === "average"
          ? allocated[a] - allocated[b]
          : loads[a] - loads[b]) ||
        loads[a] - loads[b] ||
        a.localeCompare(b),
    )[0];
    loads[owner]++;
    allocated[owner]++;
    return {
      id: task.id,
      patientId: task.patientId,
      title: task.title,
      from: task.owner || "",
      to: owner,
      status: task.status,
    };
  });
}
export function followupWorkload(tasks: Row[]) {
  return [...new Set<string>(tasks.map((t) => t.owner || "未分配"))]
    .sort()
    .map((owner) => {
      const rows = tasks.filter((t) => (t.owner || "未分配") === owner);
      const completed = rows.filter((t) => t.status === "已完成").length;
      return {
        owner,
        total: rows.length,
        pending: rows.filter((t) => t.status === "待处理").length,
        active: rows.filter((t) => t.status === "进行中").length,
        completed,
        rate: rows.length ? Math.round((completed / rows.length) * 100) : 0,
      };
    });
}
export function FollowupAllocation({ filters }: { filters: FollowupFilters }) {
  const { state, act } = useDemo();
  const options = followupOwnerOptions(state);
  const [owners, setOwners] = useState<string[] | null>(null);
  const targets = (owners ?? options).filter((o) => options.includes(o));
  const [mode, setMode] = useState<"workload" | "average">("workload");
  const [preview, setPreview] = useState<{
    id: string;
    rows: FollowupAssignment[];
    filters: FollowupFilters;
    mode: string;
  } | null>(null);
  const [notice, setNotice] = useState("");
  const submitted = useRef(false);
  const visible = filterFollowupTasks(state, filters);
  const eligible = visible.filter((t) => isAllocatableTask(state, t));
  const permittedTasks = state.tasks.filter((t) =>
    state.patients.some((p) => p.id === t.patientId),
  );
  const loadOwners = [
    ...new Set([
      ...options,
      ...permittedTasks.filter(isOpen).map((t) => String(t.owner || "未分配")),
    ]),
  ].sort();
  const loads = allocationLoads(
    permittedTasks,
    loadOwners,
    preview?.rows || [],
  );
  return (
    <section
      className="panel ops-panel"
      style={{ marginBottom: 20 }}
      aria-label="随访负载分配"
    >
      <div className="ops-panel-title">
        <div>
          <h2>按工作量分配随访</h2>
          <p>
            基于当前权限可见的开放任务；当前筛选 {visible.length} 项，可分配{" "}
            {eligible.length} 项。完成、取消和已锁定任务保持原样。
          </p>
        </div>
      </div>
      <div style={{ overflowX: "auto", padding: "0 24px" }}>
        <h3>责任人工作量 · 当前筛选与权限范围</h3>
        <table aria-label="责任人随访工作量">
          <thead>
            <tr>
              <th>责任人</th>
              <th>总任务</th>
              <th>待办</th>
              <th>进行中</th>
              <th>已完成</th>
              <th>完成率</th>
            </tr>
          </thead>
          <tbody>
            {followupWorkload(visible).map((r) => (
              <tr key={r.owner}>
                <td>{r.owner}</td>
                <td>{r.total}</td>
                <td>{r.pending}</td>
                <td>{r.active}</td>
                <td>{r.completed}</td>
                <td>{r.rate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ padding: "0 24px 20px" }}>
        <div className="ops-permissions">
          {options.map((owner) => (
            <label key={owner}>
              <input
                type="checkbox"
                aria-label={`分配给 ${owner}`}
                checked={targets.includes(owner)}
                onChange={(e) =>
                  setOwners(
                    e.target.checked
                      ? [...targets, owner]
                      : targets.filter((o) => o !== owner),
                  )
                }
              />
              {owner}
            </label>
          ))}
        </div>
        {!options.length && (
          <p>没有可用随访人员，请先配置已审核人员或登记任务责任人。</p>
        )}
        <label className="ops-field">
          分配方式
          <select
            aria-label="随访分配方式"
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
          >
            <option value="workload">自动平衡现有开放负载</option>
            <option value="average">按本批任务数量平均分配</option>
          </select>
        </label>
        <p>
          自动方式优先交给当前负载较少人员；平均方式使本批任务数量相差不超过一项。均以日期、任务编号和人员名称确定顺序，不使用随机负载。
        </p>
        <button
          className="btn btn-primary"
          disabled={!targets.length || !eligible.length}
          onClick={() => {
            submitted.current = false;
            setPreview({
              id: "ALLOC-" + crypto.randomUUID(),
              rows: buildFollowupAllocation(state, filters, targets, mode),
              filters: { ...filters },
              mode,
            });
            setNotice("");
          }}
        >
          预览随访分配
        </button>
        {notice && <p role="status">{notice}</p>}
      </div>
      {preview && (
        <div className="ops-overlay">
          <section
            className="ops-modal"
            role="dialog"
            aria-modal="true"
            aria-label="随访分配预览"
          >
            <div className="ops-modal-head">
              <h2>随访分配预览 · {preview.rows.length} 项</h2>
              <button
                className="btn"
                onClick={() => {
                  submitted.current = true;
                  setPreview(null);
                  setNotice("已取消本批分配，任务未变更。");
                }}
              >
                取消本批分配
              </button>
            </div>
            <div style={{ padding: 24, maxHeight: "65vh", overflow: "auto" }}>
              <table aria-label="分配前后人员负载">
                <thead>
                  <tr>
                    <th>责任人</th>
                    <th>分配前开放任务</th>
                    <th>本批分入</th>
                    <th>分配后开放任务</th>
                  </tr>
                </thead>
                <tbody>
                  {loads.map((l) => (
                    <tr key={l.owner}>
                      <td>{l.owner}</td>
                      <td>{l.before}</td>
                      <td>{l.assigned}</td>
                      <td>{l.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <table aria-label="本批任务分配明细">
                <thead>
                  <tr>
                    <th>客户 / 任务</th>
                    <th>原责任人</th>
                    <th>拟分配责任人</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        {state.patients.find((p) => p.id === r.patientId)?.name}{" "}
                        · {r.title}
                      </td>
                      <td>{r.from || "未分配"}</td>
                      <td>
                        <select
                          aria-label={`任务 ${r.id} 分配给`}
                          value={r.to}
                          onChange={(e) =>
                            setPreview({
                              ...preview,
                              rows: preview.rows.map((a) =>
                                a.id === r.id
                                  ? { ...a, to: e.target.value }
                                  : a,
                              ),
                            })
                          }
                        >
                          <option value="">不分配此任务</option>
                          {targets.map((owner) => (
                            <option key={owner}>{owner}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>
                可逐项改派或选择不分配；本地确认才会修改任务。预览期间任务、权限、筛选或锁定发生变化时整批拒绝提交。
              </p>
            </div>
            <div className="ops-modal-actions">
              <button
                className="btn btn-primary"
                onClick={() => {
                  if (submitted.current) return;
                  const currentIds = new Set(
                    filterFollowupTasks(state, filters)
                      .filter((t) => isAllocatableTask(state, t))
                      .map((t) => t.id),
                  );
                  const changed =
                    JSON.stringify(filters) !==
                      JSON.stringify(preview.filters) ||
                    preview.rows.some((row) => {
                      const task = state.tasks.find((t) => t.id === row.id);
                      return (
                        !task ||
                        !currentIds.has(row.id) ||
                        (task.owner !== row.from &&
                          !(row.from === "" && !task.owner)) ||
                        task.status !== row.status ||
                        (!!row.to && !targets.includes(row.to))
                      );
                    });
                  if (changed) {
                    setNotice(
                      "任务、权限、筛选或锁定已变化，请取消后重新预览。",
                    );
                    setPreview(null);
                    return;
                  }
                  const assignments = preview.rows.filter((r) => r.to);
                  if (!assignments.length) {
                    setNotice("本批未选择任何分配，请取消或选择责任人。");
                    return;
                  }
                  submitted.current = true;
                  const at = new Date().toISOString();
                  assignments
                    .filter((r) => r.to !== r.from)
                    .forEach((r) => {
                      const task = state.tasks.find((t) => t.id === r.id)!;
                      act({
                        type: "UPDATE_TASK",
                        payload: {
                          id: r.id,
                          owner: r.to,
                          allocationBatchId: preview.id,
                          history: [
                            ...(task.history || []),
                            {
                              date: at,
                              text: `随访分配：${r.from || "未分配"} → ${r.to}`,
                              batchId: preview.id,
                            },
                          ],
                        },
                      });
                    });
                  act({
                    type: "UPSERT_RECORD",
                    payload: {
                      collection: "followupAllocationBatches",
                      record: {
                        id: preview.id,
                        createdAt: at,
                        mode: preview.mode,
                        filters: preview.filters,
                        assignments,
                        loads: allocationLoads(
                          permittedTasks,
                          options,
                          assignments,
                        ),
                        actor:
                          state.config.operatorName ||
                          state.config.role ||
                          "admin",
                      },
                    },
                  });
                  setPreview(null);
                  setNotice(
                    `已确认 ${assignments.length} 项任务分配，完成及锁定任务未变更。`,
                  );
                }}
              >
                确认本批随访分配
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
export default FollowupAllocation;

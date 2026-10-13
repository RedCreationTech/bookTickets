import { useRef, useState } from "react";
import { useDemo } from "../store";
import { Modal } from "../ui";
import {
  archiveOperationLabels,
  archiveVersion,
  defaultReportFilters,
  filterReports,
  getReportArchive,
  reportAccessible,
  reportCabinetLabel,
  reportMainDoctor,
  validateReportArchiveOperation,
} from "./reportArchiveRules";
import type {
  ArchiveOperation,
  ReportArchiveInput,
  ReportFilters,
} from "./reportArchiveRules";
export { filterReports, defaultReportFilters } from "./reportArchiveRules";
export type { ReportFilters } from "./reportArchiveRules";

export function ReportSearchControls({
  onChange,
}: {
  onChange: (filters: ReportFilters) => void;
}) {
  const [filters, setFilters] = useState<ReportFilters>({
    ...defaultReportFilters,
  });
  const update = (patch: Partial<ReportFilters>) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    onChange(next);
  };
  return (
    <section className="panel" aria-label="报告组合查询">
      <h3>报告组合条件查询</h3>
      <div className="form-grid">
        <label>
          报告匹配方式
          <select
            value={filters.mode}
            onChange={(e) =>
              update({ mode: e.target.value as ReportFilters["mode"] })
            }
          >
            <option value="fuzzy">模糊匹配</option>
            <option value="exact">精准匹配</option>
          </select>
        </label>
        {(
          [
            ["name", "报告客户姓名"],
            ["appointmentId", "报告体检号"],
            ["identity", "报告 DEMO 证件号"],
            ["company", "报告客户单位"],
            ["doctor", "报告主检医生"],
          ] as const
        ).map(([field, label]) => (
          <label key={field}>
            {label}
            <input
              value={filters[field]}
              onChange={(e) => update({ [field]: e.target.value })}
            />
          </label>
        ))}
        <label>
          报告日期起
          <input
            type="date"
            value={filters.from}
            onChange={(e) => update({ from: e.target.value })}
          />
        </label>
        <label>
          报告日期止
          <input
            type="date"
            value={filters.to}
            onChange={(e) => update({ to: e.target.value })}
          />
        </label>
      </div>
      <button
        className="btn"
        onClick={() => {
          setFilters({ ...defaultReportFilters });
          onChange({ ...defaultReportFilters });
        }}
      >
        清空报告组合条件
      </button>
      {filters.from && filters.to && filters.from > filters.to && (
        <p role="alert">开始日期不能晚于结束日期，当前结果为空。</p>
      )}
      <p className="muted">
        所有非空条件按“同时满足”组合；主检医生读取已完成主检节点记录，不以分检/责任医生代替。缺失身份、主检记录不匹配该条件。
      </p>
    </section>
  );
}
export function ReportArchive({
  appointmentIds,
  initialOperation = "print",
}: {
  appointmentIds: string[];
  initialOperation?: ArchiveOperation;
}) {
  const { state, act } = useDemo();
  const sequence = useRef(0);
  const freshId = (prefix: string) => {
    let id = `${prefix}-${Date.now().toString(36)}-${++sequence.current}`;
    while (
      Object.values(state.records).some((rows) => rows.some((r) => r.id === id))
    )
      id += `-${++sequence.current}`;
    return id;
  };
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<any>(null);
  const [deletion, setDeletion] = useState<any>(null);
  const [operation, setOperation] =
    useState<ArchiveOperation>(initialOperation);
  const [actor, setActor] = useState(state.config.operatorName || "演示档案员");
  const [at, setAt] = useState(new Date().toISOString().slice(0, 16));
  const [slotId, setSlotId] = useState("");
  const [receiver, setReceiver] = useState("");
  const [recipient, setRecipient] = useState("");
  const [method, setMethod] = useState("个人领取");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<ReportArchiveInput | null>(null);
  const [detail, setDetail] = useState("");
  const categories = state.records.reportCabinetCategories || [];
  const slots = state.records.reportCabinetSlots || [];
  const ids = [...new Set(appointmentIds)];
  const selected = ids
    .map((id) => state.appointments.find((a) => a.id === id))
    .filter((a) => !!a)
    .filter((a) => reportAccessible(state, a));
  const canManage = reportAccessible(state);
  const storage = ["stock_in", "move"].includes(operation);
  const usableSlots = slots.filter(
    (s) =>
      s.status === "已启用" &&
      categories.some((c) => c.id === s.categoryId && c.status === "已启用"),
  );
  const occupied = (id: string) =>
    (state.records.reportArchives || []).filter(
      (r) => r.inventoryStatus === "in" && r.slotId === id,
    ).length;
  const describeInventory = (status: string) =>
    ({
      in: "在库",
      out: "已出库",
      issued: "已发放",
      unrecorded: "未登记库存",
      legacy_location: "旧位置待规范入库",
    })[status] || status;
  const begin = () => {
    const input: ReportArchiveInput = {
      requestId: freshId("ARCHIVE"),
      appointmentIds: ids,
      operation,
      actor,
      at: `${at}:00Z`,
      slotId,
      receiver,
      recipient,
      method,
      note,
      expected: Object.fromEntries(
        ids.map((id) => [id, archiveVersion(state, id)]),
      ),
    };
    const issues = validateReportArchiveOperation(state, input);
    if (issues.length) {
      setNotice(issues.join(" "));
      return;
    }
    setNotice("");
    setPreview(input);
  };
  const saveLocation = () => {
    if (!editor?.name.trim()) {
      setNotice("类别/柜位名称必填。");
      return;
    }
    const list = editor.kind === "category" ? categories : slots;
    if (
      list.some(
        (r) =>
          r.id !== editor.id &&
          r.status !== "已删除" &&
          r.name === editor.name.trim() &&
          (editor.kind === "category" || r.categoryId === editor.categoryId),
      )
    ) {
      setNotice("同范围名称已存在，请使用不同名称。");
      return;
    }
    if (
      editor.kind === "slot" &&
      (!editor.categoryId ||
        !Number.isInteger(Number(editor.capacity)) ||
        Number(editor.capacity) < 1 ||
        Number(editor.capacity) > 10000)
    ) {
      setNotice("请选择类别并填写 1–10000 的整数容量。");
      return;
    }
    const count =
      editor.kind === "slot"
        ? occupied(editor.id)
        : slots
            .filter((s) => s.categoryId === editor.id)
            .reduce((n, s) => n + occupied(s.id), 0);
    if (
      count &&
      (editor.status === "已停用" ||
        (editor.kind === "slot" && count > Number(editor.capacity)))
    ) {
      setNotice(
        "在用柜位/类别不能停用，也不能将容量降至当前库存以下。请先出库或移柜。",
      );
      return;
    }
    act({
      type:
        editor.kind === "category"
          ? "REPORT_ARCHIVE_SAVE_CATEGORY"
          : "REPORT_ARCHIVE_SAVE_SLOT",
      payload: editor,
    });
    setEditor(null);
    setNotice("柜位配置已提交，已入库报告按稳定柜位ID关联。");
  };
  const history =
    detail &&
    state.appointments.some(
      (a) => a.id === detail && reportAccessible(state, a),
    )
      ? getReportArchive(state, detail)
      : null;
  return (
    <section className="panel" aria-label="报告档案流转">
      <h2>报告档案与出入库流转</h2>
      <p className="muted">
        所有打印、装订、交接及领取均为本地合成记录，不驱动真实设备或外部配送。医学报告锁定不阻止已审核报告归档；专用档案锁定会阻止流转。
      </p>
      {!canManage && <p role="alert">当前角色没有报告档案操作权限。</p>}
      <details>
        <summary>自定义报告柜类别与柜位</summary>
        <div className="actions">
          <button
            className="btn"
            disabled={!canManage}
            onClick={() => {
              setNotice("");
              setEditor({
                kind: "category",
                id: freshId("CABCAT"),
                name: "",
                status: "已启用",
              });
            }}
          >
            新建报告柜类别
          </button>
          <button
            className="btn"
            disabled={
              !canManage || !categories.some((c) => c.status === "已启用")
            }
            onClick={() => {
              setNotice("");
              setEditor({
                kind: "slot",
                id: freshId("CABSLOT"),
                name: "",
                categoryId:
                  categories.find((c) => c.status === "已启用")?.id || "",
                capacity: 20,
                status: "已启用",
              });
            }}
          >
            新建报告柜位
          </button>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>类别</th>
                <th>状态</th>
                <th>维护</th>
              </tr>
            </thead>
            <tbody>
              {categories
                .filter((c) => c.status !== "已删除")
                .map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{c.status}</td>
                    <td>
                      <button
                        className="text-btn"
                        disabled={!canManage}
                        onClick={() => {
                          setNotice("");
                          setEditor({ ...c, kind: "category" });
                        }}
                      >
                        编辑类别 {c.name}
                      </button>
                      <button
                        className="text-btn"
                        disabled={
                          !canManage ||
                          slots.some(
                            (s) =>
                              s.categoryId === c.id && s.status !== "已删除",
                          )
                        }
                        onClick={() => setDeletion({ ...c, kind: "category" })}
                      >
                        删除类别 {c.name}
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>报告柜位</th>
                <th>当前库存/容量</th>
                <th>状态</th>
                <th>维护</th>
              </tr>
            </thead>
            <tbody>
              {slots
                .filter((s) => s.status !== "已删除")
                .map((s) => (
                  <tr key={s.id}>
                    <td>{reportCabinetLabel(state, s.id)}</td>
                    <td>
                      {occupied(s.id)} / {s.capacity}
                    </td>
                    <td>{s.status}</td>
                    <td>
                      <button
                        className="text-btn"
                        disabled={!canManage}
                        onClick={() => {
                          setNotice("");
                          setEditor({ ...s, kind: "slot" });
                        }}
                      >
                        编辑柜位 {s.name}
                      </button>
                      <button
                        className="text-btn"
                        disabled={!canManage || occupied(s.id) > 0}
                        onClick={() => setDeletion({ ...s, kind: "slot" })}
                      >
                        删除柜位 {s.name}
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <p>
          在用柜位不能删除或停用；类别下存在柜位时不能删除类别。改名保留ID关联，历史位置保留当时快照。
        </p>
      </details>
      <h3>选中报告 · {ids.length} 份</h3>
      {!ids.length && <p>请先在上方报告列表选择一份或多份报告。</p>}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>体检号/客户</th>
              <th>库存位置</th>
              <th>打印人员/时间</th>
              <th>装订人员/时间</th>
              <th>交接人员/时间</th>
              <th>领取</th>
              <th>明细</th>
            </tr>
          </thead>
          <tbody>
            {selected.map((a) => {
              const flow = getReportArchive(state, a.id);
              return (
                <tr key={a.id}>
                  <td>
                    {a.id}
                    <br />
                    {state.patients.find((p) => p.id === a.patientId)?.name}
                    <br />
                    主检：{reportMainDoctor(a) || "未登记"}
                  </td>
                  <td>
                    {describeInventory(flow.inventoryStatus)}
                    <br />
                    {flow.cabinet || "无在库位置"}
                    {flow.storedAt && <small>入库 {flow.storedAt}</small>}
                  </td>
                  <td>
                    {flow.printedBy || "未登记"}
                    <br />
                    {flow.printedAt || "未登记"}
                  </td>
                  <td>
                    {flow.boundBy || "未登记"}
                    <br />
                    {flow.boundAt || "未登记"}
                  </td>
                  <td>
                    {flow.handedBy || "未登记"}
                    <br />
                    {flow.handedAt || "未登记"}
                    {flow.handoffReceiver && (
                      <small>接收：{flow.handoffReceiver}</small>
                    )}
                  </td>
                  <td>
                    {flow.recipient || a.recipient || "未登记"}
                    <br />
                    {flow.method || a.deliveryMethod || ""}
                    <br />
                    {flow.issuedAt || a.deliveredAt || ""}
                    <small>
                      发放人：{flow.issuedBy || a.deliveredBy || "未登记"}
                    </small>
                  </td>
                  <td>
                    <button
                      className="text-btn"
                      onClick={() => setDetail(a.id)}
                    >
                      流转历史 {a.id}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="form-grid">
        <label>
          报告流转动作
          <select
            value={operation}
            onChange={(e) => {
              setOperation(e.target.value as ArchiveOperation);
              setPreview(null);
              setNotice("");
            }}
          >
            {Object.entries(archiveOperationLabels).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          本次合成操作人
          <input value={actor} onChange={(e) => setActor(e.target.value)} />
        </label>
        <label>
          流转时间（UTC）
          <input
            type="datetime-local"
            value={at}
            onChange={(e) => setAt(e.target.value)}
          />
        </label>
        {storage && (
          <label>
            目标报告柜位
            <select value={slotId} onChange={(e) => setSlotId(e.target.value)}>
              <option value="">请选择柜位</option>
              {usableSlots.map((s) => (
                <option key={s.id} value={s.id}>
                  {reportCabinetLabel(state, s.id)} · {occupied(s.id)}/
                  {s.capacity}
                </option>
              ))}
            </select>
          </label>
        )}
        {operation === "handoff" && (
          <label>
            合成交接接收人
            <input
              value={receiver}
              onChange={(e) => setReceiver(e.target.value)}
              placeholder="例如演示保管员"
            />
          </label>
        )}
        {operation === "issue" && (
          <>
            <label>
              合成报告领取人
              <input
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="例如演示本人/演示单位经办人"
              />
            </label>
            <label>
              本次领取方式
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                {[
                  "个人领取",
                  "单位领取",
                  "代领",
                  "邮寄（模拟）",
                  "线上查询",
                ].map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
          </>
        )}
        <label>
          流转备注/重新打印原因
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      <button
        className="btn btn-primary"
        disabled={!canManage || !ids.length}
        onClick={begin}
      >
        预览本次报告流转
      </button>
      {notice && <p role="status">{notice}</p>}
      <p className="muted">
        同批全部通过校验才生效；重新打印需原因，装订/交接按打印版本去重。纸质领取需先有打印记录。原文“方法时间”字段含义待澄清，本地明确记录发放时间、发放人、领取人和方式。
      </p>
      {editor && (
        <Modal
          title={editor.kind === "category" ? "报告柜类别维护" : "报告柜位维护"}
          onClose={() => setEditor(null)}
        >
          <label>
            名称
            <input
              aria-label="报告柜维护名称"
              value={editor.name}
              onChange={(e) => setEditor({ ...editor, name: e.target.value })}
            />
          </label>
          {editor.kind === "slot" && (
            <>
              <label>
                所属报告柜类别
                <select
                  value={editor.categoryId}
                  onChange={(e) =>
                    setEditor({ ...editor, categoryId: e.target.value })
                  }
                >
                  {categories
                    .filter((c) => c.status === "已启用")
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                柜位容量
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={editor.capacity}
                  onChange={(e) =>
                    setEditor({ ...editor, capacity: Number(e.target.value) })
                  }
                />
              </label>
            </>
          )}
          <label>
            柜位配置状态
            <select
              value={editor.status}
              onChange={(e) => setEditor({ ...editor, status: e.target.value })}
            >
              <option>已启用</option>
              <option>已停用</option>
            </select>
          </label>
          {notice && <p role="alert">{notice}</p>}
          <div className="modal-actions">
            <button className="btn" onClick={() => setEditor(null)}>
              取消
            </button>
            <button className="btn btn-primary" onClick={saveLocation}>
              保存报告柜配置
            </button>
          </div>
        </Modal>
      )}
      {deletion && (
        <Modal title="确认删除空柜配置" onClose={() => setDeletion(null)}>
          <p>
            将停用并隐藏“{deletion.name}
            ”，历史流转记录仍保留。若配置仍被占用，本次操作不会执行。
          </p>
          <div className="modal-actions">
            <button className="btn" onClick={() => setDeletion(null)}>
              取消删除
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                act({
                  type: "REPORT_ARCHIVE_DELETE_LOCATION",
                  payload: { id: deletion.id, kind: deletion.kind },
                });
                setDeletion(null);
              }}
            >
              确认删除空柜配置
            </button>
          </div>
        </Modal>
      )}
      {preview && (
        <Modal title="确认本地报告流转" onClose={() => setPreview(null)}>
          <h3>
            {archiveOperationLabels[preview.operation]} ·{" "}
            {preview.appointmentIds.length} 份
          </h3>
          <p>{preview.appointmentIds.join("、")}</p>
          <p>
            操作人：{preview.actor}；时间：{preview.at}
          </p>
          {preview.slotId && (
            <p>柜位：{reportCabinetLabel(state, preview.slotId)}</p>
          )}
          {preview.receiver && <p>交接接收人：{preview.receiver}</p>}
          {preview.operation === "issue" && (
            <p>
              领取人：{preview.recipient}；方式：{preview.method}
            </p>
          )}
          {preview.note && <p>备注：{preview.note}</p>}
          <p>
            这是本地模拟登记，不代表设备已执行或报告已真实送达。取消不会写入成功状态。
          </p>
          <div className="modal-actions">
            <button className="btn" onClick={() => setPreview(null)}>
              取消本次流转
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                if (
                  JSON.stringify([...ids].sort()) !==
                  JSON.stringify([...preview.appointmentIds].sort())
                ) {
                  setNotice("预览后报告选择已变化，请重新预览。");
                  setPreview(null);
                  return;
                }
                const issues = validateReportArchiveOperation(state, preview);
                if (issues.length) {
                  setNotice(issues.join(" "));
                  setPreview(null);
                  return;
                }
                act({ type: "REPORT_ARCHIVE_APPLY", payload: preview });
                setPreview(null);
                setNotice(
                  `${archiveOperationLabels[preview.operation]}已提交；请查看各报告档案和流转历史。`,
                );
              }}
            >
              确认登记本次流转
            </button>
          </div>
        </Modal>
      )}
      {history && (
        <Modal title="报告流转完整历史" onClose={() => setDetail("")} wide>
          <h3>{detail}</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>阶段</th>
                  <th>人员</th>
                  <th>时间</th>
                  <th>柜位变化</th>
                  <th>交接/领取信息</th>
                  <th>备注/批次</th>
                </tr>
              </thead>
              <tbody>
                {[...history.history]
                  .sort(
                    (a, b) =>
                      a.at.localeCompare(b.at) || a.id.localeCompare(b.id),
                  )
                  .map((e) => (
                    <tr key={e.id}>
                      <td>{e.label}</td>
                      <td>{e.actor}</td>
                      <td>{e.at}</td>
                      <td>
                        {e.fromCabinet || "无"} → {e.toCabinet || "无"}
                      </td>
                      <td>
                        {e.receiver || e.recipient || "无"} {e.method}
                      </td>
                      <td>
                        {e.note || "无"}
                        <small>{e.batchId || e.id}</small>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {!history.history.length && (
            <p>未登记阶段流水。已有旧字段不自动补造人员和时间。</p>
          )}
        </Modal>
      )}
    </section>
  );
}

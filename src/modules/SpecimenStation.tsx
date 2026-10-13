import { useEffect, useRef, useState, lazy, Suspense } from "react";
import JsBarcode from "jsbarcode";
import { useDemo } from "../store";
import type { Appointment, DemoState } from "../model";
import { clinicalRules } from "../clinicalRules";
import { Badge, Empty } from "../ui";
const IdentityPhotoViewer = lazy(() =>
  import("./ControlCenter").then((m) => ({ default: m.IdentityPhotoViewer })),
);
export const specimenTypes = ["采血", "尿液", "粪便", "碳呼吸", "妇科", "病理"];
export function specimenItems(state: DemoState, a: Appointment, type: string) {
  return a.items.filter(
    (item) =>
      clinicalRules(state).find((r) => r.item === item)?.sampleType === type,
  );
}
function asciiHash(text: string) {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0).toString(36).toUpperCase();
}
export function specimenCode(
  state: DemoState,
  a: Appointment,
  type: string,
  items: string[],
) {
  const template =
    clinicalRules(state).find((r) => r.item === items[0])?.barcodeTemplate ||
    "DEMO-{体检号}-{标本}-{序号}";
  const value = template
    .replaceAll("{体检号}", a.id)
    .replaceAll("{标本}", String(specimenTypes.indexOf(type) + 1))
    .replaceAll("{序号}", asciiHash([...items].sort().join("|")));
  return /^(?=.{1,80}$)[\x20-\x7e]+$/.test(value)
    ? value
    : `DEMO-${asciiHash(value)}`;
}
export function BarcodePreview({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (ref.current)
      JsBarcode(ref.current, value, {
        format: "CODE128",
        width: 1.2,
        height: 48,
        fontSize: 12,
        margin: 8,
      });
  }, [value]);
  return (
    <svg
      ref={ref}
      role="img"
      aria-label={"CODE128条码 " + value}
      style={{ maxWidth: "100%", height: "auto" }}
    />
  );
}
export function SpecimenStation({
  initialAppointmentId = "",
}: {
  initialAppointmentId?: string;
}) {
  const { state, act } = useDemo();
  const [query, setQuery] = useState(initialAppointmentId),
    [id, setId] = useState(initialAppointmentId),
    [type, setType] = useState("采血"),
    [selected, setSelected] = useState<string[]>([]),
    [error, setError] = useState(""),
    [auto, setAuto] = useState(true);
  const busy = useRef(false);
  const a = state.appointments.find((x) => x.id === id),
    patient = state.patients.find((x) => x.id === a?.patientId);
  const valid =
    !!a && ["checked", "in_exam", "review", "approved"].includes(a.status);
  const items = a ? specimenItems(state, a, type) : [];
  const chosen = auto ? items : selected.filter((i) => items.includes(i));
  const code = a && chosen.length ? specimenCode(state, a, type, chosen) : "";
  const records = (state.records.specimenBarcodes || []).filter(
    (r) => r.appointmentId === id && r.type === type,
  );
  const actor = state.config.currentUserName || state.config.role;
  function locate() {
    busy.current = false;
    setError("");
    setSelected([]);
    const found = state.appointments.find((x) => x.id === query.trim());
    if (
      !found ||
      !["checked", "in_exam", "review", "approved"].includes(found.status)
    ) {
      setId("");
      setError("体检号不存在或尚未开始体检，不能载入待打印条码");
      return;
    }
    setId(found.id);
  }
  function commit(mode: "print" | "collect") {
    if (busy.current || !valid || !a || a.locked || !chosen.length) return;
    busy.current = true;
    const old = records.find((r) => r.code === code),
      at = new Date().toISOString();
    if (mode === "collect" && !old?.prints?.length) {
      setError("请先生成并模拟打印该标本条码");
      busy.current = false;
      return;
    }
    if (mode === "collect" && old?.status === "已采集") {
      busy.current = false;
      return;
    }
    act({
      type: "UPSERT_RECORD",
      payload: {
        collection: "specimenBarcodes",
        record: {
          ...old,
          id: "SB-" + code,
          code,
          appointmentId: a.id,
          patientId: a.patientId,
          type,
          items: [...chosen],
          status: mode === "collect" ? "已采集" : old?.status || "待采集",
          prints:
            mode === "print"
              ? [
                  ...(old?.prints || []),
                  {
                    at,
                    actor,
                    status: "模拟打印完成",
                    target: type + "工作站",
                    mode: old ? "补打" : "首次打印",
                  },
                ]
              : old?.prints,
          collectedAt: mode === "collect" ? at : old?.collectedAt,
          collectedBy: mode === "collect" ? actor : old?.collectedBy,
        },
      },
    });
    if (mode === "collect")
      act({
        type: "UPSERT_RECORD",
        payload: {
          collection: "reportSpecimens",
          record: {
            id: "SPEC-" + code,
            appointmentId: a.id,
            patientId: a.patientId,
            type,
            specimenType: type,
            items: [...chosen],
            code,
            status: "已采集",
            operator: actor,
            at,
          },
        },
      });
    setError(
      mode === "print"
        ? "本地模拟打印记录已保存，未驱动物理打印机"
        : "标本采集已登记",
    );
    setTimeout(() => {
      busy.current = false;
    }, 0);
  }
  return (
    <section className="panel">
      <div className="panel-heading">
        <h3>标本采样工作站</h3>
        <Badge tone="amber">合成扫码 / 本地打印记录</Badge>
      </div>
      <div className="filter-bar">
        <label>
          刷体检号
          <input
            aria-label="工作站体检号"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && locate()}
          />
        </label>
        <button className="btn" onClick={locate}>
          定位待采客户
        </button>
        <label>
          当前工作站
          <select
            aria-label="采样工作站"
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setSelected([]);
              setError("");
            }}
          >
            {specimenTypes.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
      </div>
      {error && <p role="status">{error}</p>}
      {valid && a && patient ? (
        <>
          <p>
            <b>{patient.name}</b> · {a.id} · {a.campus} ·{" "}
            {a.locked ? "订单锁定，禁止采集操作" : "已开始体检"}
          </p>
          <Suspense fallback={<p>读取核验资料…</p>}>
            <IdentityPhotoViewer appointmentId={a.id} />
          </Suspense>
          <label className="check-line">
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => setAuto(e.target.checked)}
            />
            按同订单同标本自动合并
          </label>
          <div className="checkbox-grid">
            {items.map((item) => (
              <label key={item}>
                <input
                  type="checkbox"
                  disabled={auto}
                  checked={chosen.includes(item)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, item]
                        : selected.filter((x) => x !== item),
                    )
                  }
                />
                {item}
              </label>
            ))}
          </div>
          {!items.length ? (
            <Empty text="当前站没有适用检查项，可在项目规则维护标本类型" />
          ) : (
            chosen.length > 0 && (
              <>
                <BarcodePreview value={code} />
                <p>项目映射：{chosen.join("、")}</p>
                <div className="actions">
                  <button
                    className="btn"
                    disabled={a.locked}
                    onClick={() => commit("print")}
                  >
                    {records.some((r) => r.code === code)
                      ? "模拟补打条码"
                      : "生成并模拟打印条码"}
                  </button>
                  <button
                    className="btn btn-primary"
                    disabled={
                      a.locked ||
                      records.some(
                        (r) => r.code === code && r.status === "已采集",
                      )
                    }
                    onClick={() => commit("collect")}
                  >
                    确认标本采集
                  </button>
                </div>
              </>
            )
          )}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>条码 / 合并项目</th>
                  <th>采集状态</th>
                  <th>打印历史</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.code}
                      <small>{r.items?.join("、")}</small>
                    </td>
                    <td>
                      {r.status}
                      <small>
                        {r.collectedAt} {r.collectedBy}
                      </small>
                    </td>
                    <td>
                      {r.prints?.map((p: any, i: number) => (
                        <p key={i}>
                          {p.mode} · {p.status} · {p.at} · {p.actor} ·{" "}
                          {p.target}
                        </p>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <Empty text="输入已开始体检的合成体检号，核验后显示本站项目" />
      )}
    </section>
  );
}

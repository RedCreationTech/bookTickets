import { lazy, Suspense, useRef, useState, useEffect } from "react";
import { useDemo, download } from "../store";
import type { Appointment } from "../model";
import {
  clinicalRules,
  clinicalItems,
  clinicalAbnormalities,
  localHistoricalOrders,
  reviewNodes,
} from "../clinicalRules";
import { getOrderRules } from "../orderingRules";
import { Modal } from "../ui";
import { QRCodeSVG } from "qrcode.react";
const IdentityPhotoViewer = lazy(() =>
  import("./ControlCenter").then((m) => ({ default: m.IdentityPhotoViewer })),
);
export function ClinicalRuleEditor() {
  const { state, act } = useDemo();
  const rules = clinicalRules(state);
  const [item, setItem] = useState(rules[0]?.item || "");
  const [draft, setDraft] = useState<any>(rules[0] || {});
  const [notice, setNotice] = useState("");
  const load = (name: string) => {
    setItem(name);
    setDraft(
      rules.find((r) => r.item === name) || {
        id: `CL-${name}`,
        item: name,
        department: "全科检查",
        kind: "text",
      },
    );
    setNotice("");
  };
  return (
    <details>
      <summary>项目报告映射、结果字典与危急纠错规则</summary>
      <p>
        仅配置合成演示阈值，不作为医学规则。报告子项目映射后，分检输入、检查完成、历史比较与报告将共同消费。
      </p>
      <div className="form-grid">
        <label>
          配置检查项目
          <select value={item} onChange={(e) => load(e.target.value)}>
            {rules.map((r) => (
              <option key={r.item}>{r.item}</option>
            ))}
          </select>
        </label>
        <label>
          项目所属科室
          <input
            value={draft.department || ""}
            onChange={(e) => setDraft({ ...draft, department: e.target.value })}
          />
        </label>
        <label>
          报告子项目（留空为本项目，逗号分隔）
          <input
            value={(draft.reportItems || []).join("、")}
            onChange={(e) =>
              setDraft({
                ...draft,
                reportItems: e.target.value
                  .split(/[、,，]/)
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          />
        </label>
        <label>
          结果类型
          <select
            value={draft.kind || "text"}
            onChange={(e) => setDraft({ ...draft, kind: e.target.value })}
          >
            <option value="text">描述型</option>
            <option value="number">数值型</option>
          </select>
        </label>
        <label>
          描述允许值（留空不限）
          <input
            value={draft.allowedWords || ""}
            onChange={(e) =>
              setDraft({ ...draft, allowedWords: e.target.value })
            }
          />
        </label>
        <label>
          异常关键词
          <input
            value={draft.keywords || ""}
            onChange={(e) => setDraft({ ...draft, keywords: e.target.value })}
          />
        </label>
        {[
          ["min", "录入最小值"],
          ["max", "录入最大值"],
          ["abnormalMin", "正常下限"],
          ["abnormalMax", "正常上限"],
          ["criticalMin", "危急下限"],
          ["criticalMax", "危急上限"],
        ].map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              type="number"
              step="any"
              value={draft[key] ?? ""}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  [key]:
                    e.target.value === "" ? undefined : Number(e.target.value),
                })
              }
            />
          </label>
        ))}
        <label>
          标本类别
          <select
            value={draft.sampleType || "采血"}
            onChange={(e) => setDraft({ ...draft, sampleType: e.target.value })}
          >
            {["无标本", "采血", "尿液", "粪便", "碳呼吸", "妇科", "病理"].map(
              (t) => (
                <option key={t}>{t}</option>
              ),
            )}
          </select>
        </label>
        <label>
          条码编号模板
          <input
            value={draft.barcodeTemplate || "DEMO-{体检号}-{标本}-{序号}"}
            onChange={(e) =>
              setDraft({ ...draft, barcodeTemplate: e.target.value })
            }
          />
        </label>
      </div>
      <label>
        <input
          type="checkbox"
          checked={draft.enabled !== false}
          onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
        />
        启用结果规则
      </label>
      <button
        className="btn"
        onClick={() => {
          if (
            !draft.department?.trim() ||
            (draft.min != null && draft.max != null && draft.min > draft.max) ||
            (draft.abnormalMin != null &&
              draft.abnormalMax != null &&
              draft.abnormalMin > draft.abnormalMax)
          )
            return setNotice("科室不能为空，范围下限不能高于上限");
          if ((draft.reportItems || []).includes(item))
            return setNotice("报告映射不能包含自身");
          act({
            type: "UPSERT_RECORD",
            payload: {
              collection: "clinicalItemRules",
              record: { ...draft, id: `CL-${item}`, item },
            },
          });
          for (const child of draft.reportItems || [])
            if (!rules.some((r) => r.item === child))
              act({
                type: "UPSERT_RECORD",
                payload: {
                  collection: "clinicalItemRules",
                  record: {
                    id: `CL-${child}`,
                    item: child,
                    department: draft.department,
                    kind: "text",
                    sampleType: draft.sampleType,
                  },
                },
              });
          setNotice("规则已保存并用于分检校验、异常判定和条码生成。");
        }}
      >
        保存临床演示规则
      </button>
      {notice && <p role="status">{notice}</p>}
    </details>
  );
}
export function PreExamContext({ appointment }: { appointment: Appointment }) {
  const { state } = useDemo();
  const p = state.patients.find((p) => p.id === appointment.patientId);
  const rows = Object.entries(state.records)
    .filter(([key]) => /question|preExam/i.test(key))
    .flatMap(([source, rows]) =>
      rows
        .filter((r) => r.patientId === appointment.patientId)
        .map((r) => ({ ...r, source })),
    );
  return (
    <details>
      <summary>查看本地检前问卷与背景资料</summary>
      <p>
        订单来源：{appointment.source || "未登记"}；体检日期：{appointment.date}
      </p>
      <pre style={{ whiteSpace: "pre-wrap" }}>
        {JSON.stringify(
          {
            订单問卷: appointment.questionnaireAnswers ?? null,
            患者既往史: p?.pastMedicalHistory ?? null,
            检前历史: appointment.preExamHistory ?? p?.preExamHistory ?? null,
            已保存问卷: rows,
          },
          null,
          2,
        )}
      </pre>
      <p>缺失项显示空，不补造回答；全部为合成演示。</p>
    </details>
  );
}
export function HistoricalOrderPanel({
  appointment,
  onUse,
}: {
  appointment: Appointment;
  onUse?: (values: Record<string, string>) => void;
}) {
  const { state } = useDemo();
  const [ids, setIds] = useState<string[]>([]),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [limit, setLimit] = useState(3);
  const rows = localHistoricalOrders(state, appointment).filter(
    (a) => (!from || a.date >= from) && (!to || a.date <= to),
  );
  const chosen = rows.filter((a) => ids.includes(a.id)).slice(0, limit);
  const items = clinicalItems(state, appointment);
  return (
    <details>
      <summary>选择实际历史订单对比</summary><p className="muted">仅纳入早于本次体检日期的本地订单；同日先后未确定，不视作上次。</p>
      <div className="form-grid">
        <label>
          历史体检起日
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          历史体检止日
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label>
          展示历史次数
          <input
            type="number"
            min="1"
            max="10"
            value={limit}
            onChange={(e) =>
              setLimit(Math.max(1, Math.min(10, Number(e.target.value) || 1)))
            }
          />
        </label>
      </div>
      {rows.map((a) => (
        <label className="check-line" key={a.id}>
          <input
            type="checkbox"
            aria-label={`对比历史订单${a.id}`}
            checked={ids.includes(a.id)}
            onChange={(e) =>
              setIds(
                e.target.checked
                  ? [...ids, a.id]
                  : ids.filter((id) => id !== a.id),
              )
            }
          />
          {a.date} · {a.id} · {clinicalAbnormalities(state, a.results).length}{" "}
          项异常
        </label>
      ))}
      {!rows.length && (
        <p>
          该客户没有符合范围的其他已存检查结果；固定年份样例不计入真实本地订单。
        </p>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>报告项目</th>
              <th>本次结果</th>
              {chosen.map((a) => (
                <th key={a.id}>
                  {a.date} · {a.id}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i}>
                <td>{i}</td>
                <td>{appointment.results[i] || "未录入"}</td>
                {chosen.map((a) => (
                  <td key={a.id}>
                    {a.results[i] || "未收录"}
                    {clinicalAbnormalities(state, a.results).some(
                      (x) => x.item === i,
                    ) && " · 异常（演示）"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {onUse && (
        <button
          className="btn"
          disabled={chosen.length !== 1 || appointment.locked}
          onClick={() =>
            onUse(
              Object.fromEntries(
                items
                  .filter((i) => chosen[0].results[i])
                  .map((i) => [i, chosen[0].results[i]]),
              ),
            )
          }
        >
          使用选中上次结果到草稿
        </button>
      )}
      <p className="muted">
        仅从同一患者已存订单取值；带入草稿后仍须人工复核，未自动提交。
      </p>
    </details>
  );
}
export function ResultTemplateTools({
  appointment,
  onApply,
}: {
  appointment: Appointment;
  onApply: (item: string, value: string, summary: string) => void;
}) {
  const { state, act } = useDemo();
  const items = clinicalItems(state, appointment);
  const [item, setItem] = useState(items[0] || ""),
    [seen, setSeen] = useState(""),
    [summary, setSummary] = useState(""),
    [conclusion, setConclusion] = useState(""),
    [template, setTemplate] = useState("");
  const templates = [
    {
      id: "EX-normal",
      name: "一般所见示例",
      item: "*",
      seen: "正常（合成）",
      summary: "所见已录入，待人工复核",
      conclusion: "本记录仅供演示",
    },
    ...(state.records.resultTemplates || []),
  ];
  return (
    <details>
      <summary>分检所见 → 小结 → 结论模板</summary>
      <label>
        模板应用项目
        <select value={item} onChange={(e) => setItem(e.target.value)}>
          {items.map((i) => (
            <option key={i}>{i}</option>
          ))}
        </select>
      </label>
      <label>
        检查结果模板
        <select
          value={template}
          onChange={(e) => {
            setTemplate(e.target.value);
            const t = templates.find((t) => t.id === e.target.value);
            if (t) {
              setSeen(t.seen);
              setSummary(t.summary);
              setConclusion(t.conclusion);
            }
          }}
        >
          <option value="">请选择</option>
          {templates
            .filter((t) => t.item === "*" || t.item === item)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
        </select>
      </label>
      <div className="form-grid">
        <label>
          模板所见
          <input value={seen} onChange={(e) => setSeen(e.target.value)} />
        </label>
        <label>
          模板小结
          <input value={summary} onChange={(e) => setSummary(e.target.value)} />
        </label>
        <label>
          模板结论
          <input
            value={conclusion}
            onChange={(e) => setConclusion(e.target.value)}
          />
        </label>
      </div>
      <button
        className="btn"
        disabled={!seen || appointment.locked}
        onClick={() =>
          onApply(item, seen, [summary, conclusion].filter(Boolean).join("；"))
        }
      >
        填入结果与项目小结草稿
      </button>
      <button
        className="btn"
        disabled={!seen || !summary}
        onClick={() =>
          act({
            type: "UPSERT_RECORD",
            payload: {
              collection: "resultTemplates",
              record: {
                id:
                  template && template !== "EX-normal"
                    ? template
                    : `RESULT-${item}-${seen}`,
                name: `${item} · ${seen}`,
                item,
                seen,
                summary,
                conclusion,
              },
            },
          })
        }
      >
        保存自定义结果模板
      </button>
      <button
        className="btn"
        onClick={() => {
          const t = templates.find(
            (t) => (t.item === item || t.item === "*") && t.seen === seen,
          );
          if (t) {
            setSummary(t.summary);
            setConclusion(t.conclusion);
          } else {
            setSummary("暂无与所见完全匹配的字典，请人工编辑");
            setConclusion("");
          }
        }}
      >
        按所见匹配生成小结
      </button>
    </details>
  );
}
export function InExamAdditions({ appointment }: { appointment: Appointment }) {
  const { state, act } = useDemo();
  const [selected, setSelected] = useState<string[]>([]);
  const request = useRef(crypto.randomUUID());
  const rows = appointment.examAdditions || [];
  return (
    <details>
      <summary>检中加项与差额支付</summary>
      <p>
        新增项目先生成差额待缴单，模拟全额付款后才开放检查。待付款加项会阻止整单提交审核。
      </p>
      {getOrderRules(state)
        .filter((r) => !appointment.items.includes(r.item))
        .map((r) => (
          <label className="check-line" key={r.item}>
            <input
              type="checkbox"
              checked={selected.includes(r.item)}
              onChange={(e) => {
                request.current = crypto.randomUUID();
                setSelected(
                  e.target.checked
                    ? [...selected, r.item]
                    : selected.filter((i) => i !== r.item),
                );
              }}
            />
            {r.item} · ¥{r.price}
          </label>
        ))}
      <button
        className="btn"
        disabled={!selected.length || appointment.locked}
        onClick={() =>
          act({
            type: "IN_EXAM_ADD_REQUEST",
            payload: {
              id: appointment.id,
              requestId: request.current,
              items: selected,
            },
          })
        }
      >
        生成检中加项待缴单
      </button>
      {rows.map((r: any) => (
        <div key={r.id}>
          <strong>
            {r.items.join("、")} · ¥{r.amount} · {r.status}
          </strong>
          {r.status === "待付款" && (
            <>
              <button
                className="btn"
                onClick={() =>
                  act({
                    type: "IN_EXAM_ADD_PAY",
                    payload: {
                      id: appointment.id,
                      chargeId: r.id,
                      channel: "演示微信",
                    },
                  })
                }
              >
                确认模拟支付加项差额
              </button>
              <button
                className="btn"
                onClick={() =>
                  act({
                    type: "IN_EXAM_ADD_CANCEL",
                    payload: { id: appointment.id, chargeId: r.id },
                  })
                }
              >
                取消未付款加项
              </button>
            </>
          )}
        </div>
      ))}
    </details>
  );
}
function silenceWav(seconds: number) {
  const size = Math.max(1, seconds) * 8000 * 2,
    b = new ArrayBuffer(44 + size),
    v = new DataView(b);
  const str = (at: number, s: string) =>
    [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + size, true);
  str(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true);
  v.setUint32(28, 16000, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, size, true);
  return (
    "data:audio/wav;base64," +
    window.btoa(
      Array.from(new Uint8Array(b), (n) => String.fromCharCode(n)).join(""),
    )
  );
}
export function SyntheticRecording({
  appointment,
}: {
  appointment: Appointment;
}) {
  const { act } = useDemo();
  const [status, setStatus] = useState("未开始"),
    [seconds, setSeconds] = useState(0);
  const done = useRef(false);
  useEffect(() => {
    if (status !== "录制中") return;
    const t = window.setInterval(
      () => setSeconds((n) => Math.min(20, n + 1)),
      1000,
    );
    return () => window.clearInterval(t);
  }, [status]);
  useEffect(() => {
    if (seconds >= 20 && status === "录制中") setStatus("已暂停");
  }, [seconds, status]);
  return (
    <details>
      <summary>科室声音录制流程演练</summary>
      <p>
        合成静音录音演练，不申请或启用真实麦克风。最长20秒，最多3条，保存在本地订单音频。
      </p>
      <p role="status">
        录制状态：{status} · {seconds} 秒
      </p>
      <button
        className="btn"
        disabled={
          appointment.locked ||
          (appointment.audio || []).length >= 3 ||
          status === "录制中" ||
          status === "已暂停"
        }
        onClick={() => {
          done.current = false;
          setSeconds(0);
          setStatus("录制中");
        }}
      >
        开始合成录制
      </button>
      <button
        className="btn"
        disabled={status !== "录制中"}
        onClick={() => setStatus("已暂停")}
      >
        暂停录制
      </button>
      <button
        className="btn"
        disabled={status !== "已暂停"}
        onClick={() => setStatus("录制中")}
      >
        继续录制
      </button>
      <button
        className="btn"
        disabled={!["录制中", "已暂停"].includes(status) || appointment.locked}
        onClick={() => {
          if (done.current) return;
          done.current = true;
          act({
            type: "UPDATE_APPOINTMENT",
            payload: {
              id: appointment.id,
              audio: [
                ...(appointment.audio || []),
                {
                  id: crypto.randomUUID(),
                  name: `合成录音-${seconds}秒.wav`,
                  src: silenceWav(seconds),
                  type: "audio/wav",
                  synthetic: true,
                  seconds,
                },
              ],
            },
          });
          setStatus("已保存");
        }}
      >
        结束并保存合成录音
      </button>
      <button
        className="btn"
        disabled={!["录制中", "已暂停"].includes(status)}
        onClick={() => {
          done.current = true;
          setStatus("已取消");
          setSeconds(0);
        }}
      >
        取消本次录制
      </button>
    </details>
  );
}
export function SelectedResultPrint({
  appointment,
}: {
  appointment: Appointment;
}) {
  const { state } = useDemo();
  const [items, setItems] = useState<string[]>([]),
    [open, setOpen] = useState(false);
  return (
    <details>
      <summary>单项检查结果打印</summary>
      {clinicalItems(state, appointment).map((item) => (
        <label className="check-line" key={item}>
          <input
            type="checkbox"
            disabled={!appointment.results[item]}
            checked={items.includes(item)}
            onChange={(e) =>
              setItems(
                e.target.checked
                  ? [...items, item]
                  : items.filter((i) => i !== item),
              )
            }
          />
          {item}
        </label>
      ))}
      <button
        className="btn"
        disabled={!items.length}
        onClick={() => setOpen(true)}
      >
        预览选中单项结果
      </button>
      {open && (
        <Modal title="单项结果打印预览" onClose={() => setOpen(false)}>
          <article className="report-paper">
            <h2>红创 · 单项检查结果</h2>
            <p>合成演示，不用于医疗诊断 · {appointment.id}</p>
            {items.map((i) => (
              <p key={i}>
                <strong>{i}</strong>：{appointment.results[i]}
              </p>
            ))}
          </article>
          <div className="actions">
            <button className="btn" onClick={() => window.print()}>
              浏览器打印单项结果
            </button>
          </div>
        </Modal>
      )}
    </details>
  );
}

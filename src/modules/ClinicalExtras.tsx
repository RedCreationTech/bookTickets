import { ClinicalTemplatePicker } from "./ClinicalTemplates";
import { useState, useRef } from "react";
import { useDemo, exportCsv } from "../store";
import type { Appointment } from "../model";
import { QRCodeSVG } from "qrcode.react";
export function ExamExtras({ appointmentId }: { appointmentId: string }) {
  const { state, act } = useDemo();
  const a = state.appointments.find((a) => a.id === appointmentId)!;
  const [summary, setSummary] = useState("");
  const [level, setLevel] = useState("一般");
  const [error, setError] = useState("");
  const [application, setApplication] = useState("");
  const busy = useRef(false);
  const save = (data: Partial<Appointment>) => {
    if (a.locked || !["checked", "in_exam"].includes(a.status))
      return setError("仅未锁定的检查中订单可以编辑");
    act({ type: "UPDATE_APPOINTMENT", payload: { id: a.id, ...data } });
    setError("");
  };
  const loadFile = (file: File | undefined, kind: "images" | "audio") => {
    if (!file) return;
    if (file.size > 512 * 1024) return setError("演示文件不能超过512KB");
    if (
      kind === "images" &&
      !["image/png", "image/jpeg", "image/webp"].includes(file.type)
    )
      return setError("仅接受PNG/JPEG/WebP图片");
    if (
      kind === "audio" &&
      !["audio/mpeg", "audio/wav", "audio/ogg"].includes(file.type)
    )
      return setError("仅接受MP3/WAV/OGG音频");
    if ((a[kind] || []).length >= 3) return setError("每类最多3份演示文件");
    const r = new FileReader();
    r.onload = () =>
      save({
        [kind]: [
          ...(a[kind] || []),
          {
            id: crypto.randomUUID(),
            name: file.name,
            src: r.result,
            type: file.type,
          },
        ],
      });
    r.readAsDataURL(file);
  };
  const summaries = a.examSummaries || [];
  const move = (i: number, d: number) => {
    const rows = [...summaries];
    [rows[i], rows[i + d]] = [rows[i + d], rows[i]];
    save({ examSummaries: rows });
  };
  return (
    <details>
      <summary>分检扩展：分级小结、问诊、影像、音频与申请单</summary>
      <div className="notice">
        仅上传合成演示文件，保存在当前浏览器；没有麦克风录音、PACS 或医学识别。
      </div>
      <label>
        小结等级
        <select value={level} onChange={(e) => setLevel(e.target.value)}>
          {(state.config.summaryLevels || ["一般", "关注", "重要"]).map(
            (l: string) => (
              <option key={l}>{l}</option>
            ),
          )}
        </select>
      </label>
      <ClinicalTemplatePicker
        state={state}
        appointment={a}
        kind="summary"
        disabled={!!a.locked}
        onApply={(text, nextLevel) => {
          setSummary(text);
          setLevel(nextLevel);
        }}
      />
      <label>
        新增分级小结
        <input value={summary} onChange={(e) => setSummary(e.target.value)} />
      </label>
      <button
        className="btn"
        disabled={!summary.trim() || a.locked}
        onClick={() => {
          save({
            examSummaries: [
              ...summaries,
              { id: crypto.randomUUID(), text: summary.trim(), level },
            ],
          });
          setSummary("");
        }}
      >
        添加分级小结
      </button>
      <ol>
        {summaries.map((r: any, i: number) => (
          <li key={r.id}>
            {r.level}：{r.text}
            <button
              className="text-btn"
              disabled={i === 0}
              onClick={() => move(i, -1)}
            >
              上移小结
            </button>
            <button
              className="text-btn"
              disabled={i === summaries.length - 1}
              onClick={() => move(i, 1)}
            >
              下移小结
            </button>
            <button
              className="text-btn"
              onClick={() =>
                save({
                  examSummaries: summaries.filter((x: any) => x.id !== r.id),
                })
              }
            >
              删除小结
            </button>
          </li>
        ))}
      </ol>
      <div className="form-grid">
        <label>
          小结等级配置
          <input
            defaultValue={(
              state.config.summaryLevels || ["一般", "关注", "重要"]
            ).join("、")}
            onBlur={(e) => {
              const levels = e.target.value
                .split(/[、,]/)
                .map((x) => x.trim())
                .filter(Boolean);
              if (levels.length)
                act({
                  type: "UPDATE_CONFIG",
                  payload: { summaryLevels: [...new Set(levels)] },
                });
            }}
          />
        </label>
        <label>
          内科问诊模板
          <select
            aria-label="内科问诊模板"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value)
                save({
                  examInquiry:
                    e.target.value === "routine"
                      ? {
                          symptoms: "无明显不适（合成）",
                          history: "无特殊病史（合成）",
                          medication: "无（合成）",
                          family: "待确认",
                        }
                      : {
                          symptoms: "偶有疲劳（合成）",
                          history: "演示慢病随访",
                          medication: "仅模拟记录",
                          family: "待确认",
                        },
                });
            }}
          >
            <option value="">选择模板并填入</option>
            <option value="routine">常规内科问诊</option>
            <option value="follow">复查问诊</option>
          </select>
        </label>
      </div>
      {[
        ["symptoms", "主诉"],
        ["history", "既往史"],
        ["medication", "用药史"],
        ["family", "家族史"],
      ].map(([key, label]) => (
        <label className="field" key={key}>
          {label}
          <input
            value={a.examInquiry?.[key] || ""}
            onChange={(e) =>
              save({ examInquiry: { ...a.examInquiry, [key]: e.target.value } })
            }
          />
        </label>
      ))}
      <label className="field">
        报告图片上传
        <input
          aria-label="报告图片上传"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => loadFile(e.target.files?.[0], "images")}
        />
      </label>
      <div className="item-grid">
        {(a.images || []).map((im: any) => (
          <figure key={im.id}>
            <img
              src={im.src}
              alt={"合成报告图片 " + im.name}
              style={{ maxWidth: "100%", maxHeight: 160 }}
            />
            <figcaption>{im.name}</figcaption>
            <button
              className="text-btn"
              onClick={() =>
                save({ images: a.images.filter((x: any) => x.id !== im.id) })
              }
            >
              删除图片
            </button>
          </figure>
        ))}
      </div>
      <label className="field">
        合成音频导入
        <input
          aria-label="合成音频导入"
          type="file"
          accept="audio/mpeg,audio/wav,audio/ogg"
          onChange={(e) => loadFile(e.target.files?.[0], "audio")}
        />
      </label>
      {(a.audio || []).map((f: any) => (
        <div key={f.id}>
          {f.name}
          <audio controls src={f.src} />
          <button
            className="text-btn"
            onClick={() =>
              save({ audio: a.audio.filter((x: any) => x.id !== f.id) })
            }
          >
            删除音频
          </button>
        </div>
      ))}
      <h3>检查申请单与结果预览</h3>
      <select
        aria-label="选择申请项目"
        value={application}
        onChange={(e) => setApplication(e.target.value)}
      >
        <option value="">请选择项目</option>
        {a.items.map((i) => (
          <option key={i}>{i}</option>
        ))}
      </select>
      {application && (
        <div className="callout">
          <div>
            <strong>
              申请单 {a.id}-{a.items.indexOf(application) + 1}
            </strong>
            <p>
              项目：{application}；结果：{a.results[application] || "待检查"}
              ；重推{a.applicationPushes?.[application]?.count || 0}次，
              {a.applicationPushes?.[application]?.status || "未模拟推送"}
            </p>
            <QRCodeSVG
              value={"DEMO-APPLICATION:" + a.id + ":" + application}
              size={80}
            />
            <div className="actions">
              <button
                className="btn"
                onClick={() =>
                  exportCsv("单项目结果.csv", [
                    {
                      体检号: a.id,
                      项目: application,
                      结果: a.results[application] || "未录入",
                    },
                  ])
                }
              >
                导出单项结果
              </button>
              <button
                className="btn"
                onClick={() => {
                  if (busy.current) return;
                  busy.current = true;
                  save({
                    applicationPushes: {
                      ...a.applicationPushes,
                      [application]: {
                        count:
                          (a.applicationPushes?.[application]?.count || 0) + 1,
                        status: "模拟失败",
                        at: new Date().toISOString(),
                      },
                    },
                  });
                  busy.current = false;
                }}
              >
                模拟推送失败
              </button>
              <button
                className="btn"
                onClick={() =>
                  save({
                    applicationPushes: {
                      ...a.applicationPushes,
                      [application]: {
                        count:
                          (a.applicationPushes?.[application]?.count || 0) + 1,
                        status: "模拟成功",
                        at: new Date().toISOString(),
                      },
                    },
                  })
                }
              >
                模拟重推成功
              </button>
            </div>
            <small>仅本地状态，不发送医院医嘱。</small>
          </div>
        </div>
      )}
      <label className="check-line">
        <input
          type="checkbox"
          checked={!!a.examinationEnded}
          onChange={(e) =>
            save({
              examinationEnded: e.target.checked,
              examinationEndedAt: e.target.checked
                ? new Date().toISOString()
                : null,
            })
          }
        />
        独立标记检查结束（不跳过结果校验）
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </details>
  );
}
export function UndoExam() {
  const { state, act } = useDemo();
  const [id, setId] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const orders = state.appointments.filter(
    (a) => a.status === "review" && !a.locked && (a.reviewStage || 0) === 0,
  );
  return (
    <details>
      <summary>撤销未审核的分检提交</summary>
      <label>
        待撤销订单
        <select
          aria-label="待撤销订单"
          value={id}
          onChange={(e) => setId(e.target.value)}
        >
          <option value="">请选择</option>
          {orders.map((a) => (
            <option key={a.id} value={a.id}>
              {state.patients.find((p) => p.id === a.patientId)?.name} · {a.id}
            </option>
          ))}
        </select>
      </label>
      <label>
        撤销原因
        <input
          aria-label="撤销原因"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <button
        className="btn"
        disabled={!id || !reason.trim()}
        onClick={() => {
          act({ type: "UNDO_RESULTS", payload: { id, reason } });
          setMessage(
            "已撤销提交，结果保留为可编辑草稿；审核中及已审核订单不能撤销。",
          );
          setId("");
          setReason("");
        }}
      >
        确认撤销分检提交
      </button>
      {message && <p role="status">{message}</p>}
    </details>
  );
}

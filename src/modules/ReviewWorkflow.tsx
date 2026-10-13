import { useState } from "react";
import { useDemo } from "../store";
import type { Appointment, DemoState } from "../model";
import {
  clinicalAbnormalities,
  clinicalRules,
  reviewNodes,
} from "../clinicalRules";
import { Badge } from "../ui";
export function reviewCollectedText(
  state: DemoState,
  a: Appointment,
  mode: string,
) {
  if (mode === "小结合并")
    return (
      (a.examSummaries || [])
        .map(
          (r: any) => `${r.department || "分检"}：${r.text || r.summary || ""}`,
        )
        .filter(Boolean)
        .join("\n") ||
      a.examSummary ||
      "未录入分检小结"
    );
  return (
    clinicalAbnormalities(state, a.results)
      .map((r) => `${r.item}：${r.value}；${r.reason}`)
      .join("\n") || "当前已配置规则未检出异常（演示，需人工审核）"
  );
}
export function ReviewWorkflowSettings() {
  const { state, act } = useDemo();
  const [doctor, setDoctor] = useState("周医生"),
    [min, setMin] = useState(1),
    [max, setMax] = useState(3),
    [role, setRole] = useState("doctor"),
    [depts, setDepts] = useState<string[]>([]),
    [error, setError] = useState("");
  const departments = [
    ...new Set(clinicalRules(state).map((r) => r.department)),
  ];
  return (
    <details className="panel">
      <summary>审核流程、医生等级与分检科室授权</summary>
      <label className="check-line">
        <input
          type="checkbox"
          checked={reviewNodes(state).includes("初审")}
          onChange={(e) =>
            act({
              type: "UPDATE_CONFIG",
              payload: {
                initialReviewEnabled: e.target.checked,
                reviewStages: e.target.checked ? 3 : 2,
              },
            })
          }
        />
        启用初审节点
      </label>
      <p>
        新报告流程：{reviewNodes(state).join(" → ")}
        ；已开始审核的报告保留节点快照。
      </p>
      <fieldset>
        <legend>允许撤销上一级审核的岗位</legend>
        {[
          "admin",
          "reviewer",
          "doctor",
          "reception",
          "finance",
          "guide",
          "health",
          "enterprise",
        ].map((role) => (
          <label className="check-line" key={role}>
            <input
              type="checkbox"
              aria-label={"审核撤销权限 " + role}
              checked={(
                state.config.reviewUndoRoles || ["admin", "reviewer"]
              ).includes(role)}
              onChange={(e) =>
                act({
                  type: "UPDATE_CONFIG",
                  payload: {
                    reviewUndoRoles: e.target.checked
                      ? [
                          ...new Set([
                            ...(state.config.reviewUndoRoles || [
                              "admin",
                              "reviewer",
                            ]),
                            role,
                          ]),
                        ]
                      : (
                          state.config.reviewUndoRoles || ["admin", "reviewer"]
                        ).filter((x: string) => x !== role),
                  },
                })
              }
            />
            {role}
          </label>
        ))}
      </fieldset>
      <div className="form-grid">
        <label>
          医生姓名
          <input value={doctor} onChange={(e) => setDoctor(e.target.value)} />
        </label>
        <label>
          最低报告难度
          <input
            type="number"
            min="1"
            max="5"
            value={min}
            onChange={(e) => setMin(Number(e.target.value))}
          />
        </label>
        <label>
          最高报告难度
          <input
            type="number"
            min="1"
            max="5"
            value={max}
            onChange={(e) => setMax(Number(e.target.value))}
          />
        </label>
      </div>
      <button
        className="btn"
        onClick={() => {
          if (!doctor.trim() || min < 1 || max > 5 || min > max) {
            setError("医生及难度区间无效");
            return;
          }
          act({
            type: "UPSERT_RECORD",
            payload: {
              collection: "reviewDoctorLevels",
              record: {
                id: "LEVEL-" + doctor.trim(),
                name: doctor.trim(),
                minDifficulty: min,
                maxDifficulty: max,
                enabled: true,
              },
            },
          });
          setError("等级匹配已生效");
        }}
      >
        保存医生等级区间
      </button>
      <p>
        {(state.records.reviewDoctorLevels || [])
          .map((r) => `${r.name}：${r.minDifficulty}—${r.maxDifficulty}级`)
          .join("；") || "未配置等级时，保留已有演示医生"}
      </p>
      <label>
        授权岗位
        <select
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            setDepts(
              state.config.doctorAllowedDepartments?.[e.target.value] || [],
            );
          }}
        >
          <option value="doctor">分检医生</option>
          <option value="admin">系统管理员</option>
          <option value="reviewer">总检医生</option>
        </select>
      </label>
      <div className="checkbox-grid">
        {departments.map((d) => (
          <label key={d}>
            <input
              type="checkbox"
              checked={depts.includes(d)}
              onChange={(e) =>
                setDepts(
                  e.target.checked
                    ? [...depts, d]
                    : depts.filter((x) => x !== d),
                )
              }
            />
            {d}
          </label>
        ))}
      </div>
      <button
        className="btn"
        disabled={!depts.length}
        onClick={() =>
          act({
            type: "UPDATE_CONFIG",
            payload: {
              doctorAllowedDepartments: {
                ...state.config.doctorAllowedDepartments,
                [role]: depts,
              },
            },
          })
        }
      >
        保存岗位允许科室
      </button>
      {error && <p role="status">{error}</p>}
    </details>
  );
}
export function ReviewWorkflowTools({
  appointment,
  onConclusion,
}: {
  appointment: Appointment;
  onConclusion: (text: string) => void;
}) {
  const { state, act } = useDemo(),
    a = appointment;
  const [mode, setMode] = useState("异常汇总"),
    [reason, setReason] = useState(""),
    [error, setError] = useState("");
  const node = reviewNodes(state, a)[a.reviewStage || 0];
  return (
    <section className="panel">
      <h3>审核上下文与流程控制</h3>
      <div className="form-grid">
        <label>
          报告难度
          <select
            aria-label="报告难度"
            value={a.reviewDifficulty || 1}
            onChange={(e) =>
              act({
                type: "UPDATE_APPOINTMENT",
                payload: { id: a.id, reviewDifficulty: Number(e.target.value) },
              })
            }
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}级
              </option>
            ))}
          </select>
        </label>
        <label>
          汇总抓取模式
          <select
            aria-label="汇总抓取模式"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <option>异常汇总</option>
            <option>小结合并</option>
          </select>
        </label>
      </div>
      <pre style={{ whiteSpace: "pre-wrap" }}>
        {reviewCollectedText(state, a, mode)}
      </pre>
      <button
        className="btn"
        onClick={() => onConclusion(reviewCollectedText(state, a, mode))}
      >
        载入所选来源到结论草稿
      </button>
      <div className="image-grid">
        {(a.images || []).map((r: any, i: number) => (
          <figure key={r.id || i}>
            {(r.dataUrl || r.src || r.url)?.startsWith("data:image/") ? (
              <img
                src={r.dataUrl || r.src || r.url}
                alt={r.name || "本地影像"}
                style={{ maxWidth: "100%", maxHeight: 240 }}
              />
            ) : (
              <span>无可显示的本地影像</span>
            )}
            <figcaption>
              {r.name || "合成影像"} · {r.source || "订单附件"}
            </figcaption>
          </figure>
        ))}
      </div>
      {!a.images?.length && (
        <p className="muted">该订单无本地影像附件，未连接PACS。</p>
      )}
      <label>
        流程退回/撤销原因
        <input
          aria-label="审核撤销原因"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <div className="actions">
        <button
          className="btn"
          disabled={
            !reason.trim() ||
            !a.reviewStage ||
            !(state.config.reviewUndoRoles || ["admin", "reviewer"]).includes(
              state.config.role,
            )
          }
          onClick={() => {
            act({
              type: "UNDO_REVIEW_STAGE",
              payload: { id: a.id, expectedStage: a.reviewStage, reason },
            });
            setReason("");
          }}
        >
          撤销上一级通过
        </button>
        {node === "总检" && (
          <button
            className="btn danger"
            disabled={!reason.trim() || a.locked}
            onClick={() => {
              act({ type: "REJECT_TO_MAIN", payload: { id: a.id, reason } });
              setReason("");
              setError("已退回主检，分检结果保留");
            }}
          >
            总检退回主检
          </button>
        )}
      </div>
      {error && <p role="status">{error}</p>}
      <details>
        <summary>审核履历</summary>
        {(a.reviewHistory || []).map((r: any, i: number) => (
          <p key={i}>
            <Badge>{r.node}</Badge> {r.doctor} · {r.completedAt} · {r.status}
          </p>
        ))}
        {(a.reviewUndoHistory || []).map((r: any, i: number) => (
          <p key={"u" + i}>
            撤销第{r.stage + 1}级 · {r.reason} · {r.actor} · {r.at}
          </p>
        ))}
      </details>
    </section>
  );
}

import { useState } from "react";
import { useDemo } from "../store";
export const defaultCustomerTypes = [
  { id: "regular", name: "个人常规", orderType: "个检", queueArea: "常规区" },
  { id: "group", name: "单位职工", orderType: "团检", queueArea: "团检区" },
  { id: "job", name: "入职客户", orderType: "入职", queueArea: "常规区" },
];
export function RegistrationProfile({ patientId }: { patientId?: string }) {
  const { state, act } = useDemo();
  const p = state.patients.find((p) => p.id === patientId);
  const [name, setName] = useState(p?.name || "演示新客户");
  const [sex, setSex] = useState(p?.sex || "女");
  const [age, setAge] = useState(p?.age || 30);
  const [certificateType, setCertificateType] = useState(
    p?.certificateType || "演示身份证",
  );
  const [certificate, setCertificate] = useState(
    p?.certificate || "DEMO-NEW-001",
  );
  const [customerType, setCustomerType] = useState(
    p?.customerType || "regular",
  );
  const [company, setCompany] = useState(p?.company || "个检");
  const [pastMedicalHistory, setPastMedicalHistory] = useState(
    p?.pastMedicalHistory || "合成：无特殊既往史",
  );
  const [message, setMessage] = useState("");
  const [mapping, setMapping] = useState("regular");
  const types = state.records.customerTypes || defaultCustomerTypes;
  const selected = types.find((t) => t.id === mapping) || types[0];
  const [orderType, setOrderType] = useState(selected.orderType);
  const [queueArea, setQueueArea] = useState(selected.queueArea);
  const questionnaire = [
    ...(state.records.bookingQuestionnaires || []),
    ...(state.records.patientQuestionnaires || []),
    ...(state.records.questionnaires || []),
  ].find((q) => q.patientId === patientId);
  return (
    <div>
      <div className="notice">
        仅手工登记DEMO开头的合成证件标识，不读取/校验真实身份。基本资料变更会留审计，不改变已审核临床结果。
      </div>
      <div className="form-grid">
        <label>
          客户姓名
          <input
            aria-label="登记客户姓名"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          性别
          <select value={sex} onChange={(e) => setSex(e.target.value)}>
            <option>女</option>
            <option>男</option>
          </select>
        </label>
        <label>
          年龄
          <input
            type="number"
            min="18"
            max="120"
            value={age}
            onChange={(e) => setAge(Number(e.target.value))}
          />
        </label>
        <label>
          证件类型
          <select
            value={certificateType}
            onChange={(e) => setCertificateType(e.target.value)}
          >
            <option>演示身份证</option>
            <option>演示护照</option>
            <option>演示军人证</option>
            <option>演示港澳台证件</option>
            <option>其他演示证件</option>
          </select>
        </label>
        <label>
          合成证件标识
          <input
            aria-label="合成证件标识"
            value={certificate}
            onChange={(e) => setCertificate(e.target.value)}
          />
        </label>
        <label>
          客户类型
          <select
            value={customerType}
            onChange={(e) => setCustomerType(e.target.value)}
          >
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          所属单位
          <input value={company} onChange={(e) => setCompany(e.target.value)} />
        </label>
      </div>
      <label>
        自定义既往史（仅合成资料）
        <textarea
          aria-label="自定义既往史（仅合成资料）"
          value={pastMedicalHistory}
          onChange={(e) => setPastMedicalHistory(e.target.value)}
          maxLength={500}
        />
      </label>
      <p className="muted">
        以“合成：”开头，此文本会提示后续分检医生，不生成医学诊断。
      </p>
      <button
        className="btn btn-primary"
        onClick={() => {
          if (
            !name.trim() ||
            age < 18 ||
            age > 120 ||
            !/^DEMO-[A-Za-z0-9-]{3,40}$/.test(certificate)
          )
            return setMessage("请核对姓名/18–120岁/DEMO-合成标识");
          if (
            state.patients.some(
              (x) => x.id !== p?.id && x.certificate === certificate,
            )
          )
            return setMessage("合成证件已存在，请勿重复登记");
          if (!pastMedicalHistory.startsWith("合成："))
            return setMessage("既往史只接受以合成：开头的演示资料");
          act({
            type: "UPSERT_PATIENT",
            payload: {
              ...p,
              id: p?.id || "P-DEMO-" + certificate,
              name,
              sex,
              age,
              certificateType,
              certificate,
              customerType,
              pastMedicalHistory,
              company,
              phone: p?.phone || "演示未填写",
              risk: p?.risk || "待评估",
            },
          });
          setMessage(
            p
              ? "基本资料已更新并记录审计"
              : "手工登记完成，可在预约体检人中选择",
          );
        }}
      >
        保存客户基本资料
      </button>
      {p && (
        <details>
          <summary>检前问卷带入病史</summary>
          {questionnaire ? (
            <>
              <pre>{JSON.stringify(questionnaire, null, 2)}</pre>
              <button
                className="btn"
                onClick={() => {
                  act({
                    type: "UPSERT_PATIENT",
                    payload: {
                      ...p,
                      preExamHistory: {
                        history:
                          questionnaire.history ||
                          questionnaire.medicalHistory ||
                          "",
                        medication: questionnaire.medication || "",
                        family:
                          questionnaire.family ||
                          questionnaire.familyHistory ||
                          "",
                        answers:
                          questionnaire.answers ||
                          questionnaire.questionAnswers ||
                          {},
                        sourceId: questionnaire.id,
                      },
                    },
                  });
                  setMessage(
                    "已将已存问卷回答带入客户检前资料，不生成新的医学结论",
                  );
                }}
              >
                带入已保存问卷
              </button>
            </>
          ) : (
            <p>该客户没有已保存问卷，不能用固定病史代替。</p>
          )}
        </details>
      )}
      <details>
        <summary>客户类型→订单类型→导检区域配置</summary>
        <div className="form-grid">
          <label>
            映射客户类型
            <select
              value={mapping}
              onChange={(e) => {
                setMapping(e.target.value);
                const r = types.find((t) => t.id === e.target.value);
                setOrderType(r.orderType);
                setQueueArea(r.queueArea);
              }}
            >
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            映射订单类型
            <select
              value={orderType}
              onChange={(e) => setOrderType(e.target.value)}
            >
              <option>个检</option>
              <option>团检</option>
              <option>入职</option>
              <option>公务员</option>
              <option>职业病</option>
            </select>
          </label>
          <label>
            默认导检区域
            <input
              value={queueArea}
              onChange={(e) => setQueueArea(e.target.value)}
            />
          </label>
        </div>
        <button
          className="btn"
          onClick={() => {
            for (const t of types)
              act({
                type: "UPSERT_RECORD",
                payload: {
                  collection: "customerTypes",
                  record: t.id === mapping ? { ...t, orderType, queueArea } : t,
                },
              });
            setMessage("类型映射已保存，新开单时实际带入订单类型和导检区域");
          }}
        >
          保存类型映射
        </button>
      </details>
      {message && <p role="status">{message}</p>}
    </div>
  );
}

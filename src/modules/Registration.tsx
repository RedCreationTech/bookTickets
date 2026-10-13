import { useState } from "react";
import { useDemo } from "../store";
export const CERTIFICATE_TYPES = [
  "演示身份证",
  "演示医保卡",
  "演示电子医保",
  "演示就诊卡",
  "演示电子健康卡",
  "演示护照",
  "演示外国人永久居住证",
  "演示台胞证",
  "演示军人证",
  "演示港澳台证件",
  "其他演示证件",
];
export const DEFAULT_ORDER_TYPES = ["个检", "团检", "入职", "公务员", "职业病"];
export const DEFAULT_CARD_READERS = [
  { id: "DEMO-USB-A", name: "红创演示 USB 读卡器 A" },
  { id: "DEMO-DUAL-B", name: "红创演示双接口读卡器 B" },
  { id: "DEMO-NFC-C", name: "红创演示 NFC 读卡器 C" },
];
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
  const [initials, setInitials] = useState(p?.initials || "");
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
            {CERTIFICATE_TYPES.map((type) => (
              <option key={type}>{type}</option>
            ))}
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
          客户姓名简拼
          <input
            aria-label="客户姓名简拼"
            value={initials}
            onChange={(event) => setInitials(event.target.value.toUpperCase())}
            placeholder="例如 HC，仅用于合成检索"
          />
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
              initials: initials.trim().toUpperCase(),
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
              {[
                ...new Set([
                  ...DEFAULT_ORDER_TYPES.map(
                    (name) =>
                      (state.records.orderTypes || []).find(
                        (row) => row.id === `OT-${name}`,
                      )?.name || name,
                  ),
                  ...(state.records.orderTypes || []).map((row) => row.name),
                  ...types.map((row) => row.orderType),
                ]),
              ].map((name) => (
                <option key={name}>{name}</option>
              ))}
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
      <RegistrationTypeSettings />
      {message && <p role="status">{message}</p>}
    </div>
  );
}

export function RegistrationTypeSettings() {
  const { state, act } = useDemo();
  const types = state.records.customerTypes?.length
    ? state.records.customerTypes
    : defaultCustomerTypes;
  const [kind, setKind] = useState("customer"),
    [existingId, setExistingId] = useState(""),
    [typeName, setTypeName] = useState(""),
    [message, setMessage] = useState("");
  const [readerName, setReaderName] = useState(""),
    [readerId, setReaderId] = useState(
      state.config.cardReaderModel || DEFAULT_CARD_READERS[0].id,
    );
  const readers = [
    ...DEFAULT_CARD_READERS,
    ...(state.records.cardReaderModels || []).filter(
      (r) => !DEFAULT_CARD_READERS.some((d) => d.id === r.id),
    ),
  ];
  const orderTypes = [
    ...(state.records.orderTypes || []),
    ...DEFAULT_ORDER_TYPES.map((name) => ({ id: `OT-${name}`, name })),
  ].filter((r, index, all) => all.findIndex((a) => a.id === r.id) === index);
  const choices = kind === "customer" ? types : orderTypes;
  return (
    <>
      <details>
        <summary>新增与重命名客户 / 订单类型</summary>
        <div className="form-grid">
          <label>
            类型类别
            <select
              aria-label="类型类别"
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setExistingId("");
                setTypeName("");
              }}
            >
              <option value="customer">客户类型</option>
              <option value="order">订单类型</option>
            </select>
          </label>
          <label>
            维护目标类型
            <select
              aria-label="维护目标类型"
              value={existingId}
              onChange={(e) => {
                setExistingId(e.target.value);
                setTypeName(
                  choices.find((r) => r.id === e.target.value)?.name || "",
                );
              }}
            >
              <option value="">新增类型</option>
              {choices.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            类型名称
            <input
              aria-label="类型名称"
              value={typeName}
              onChange={(e) => setTypeName(e.target.value)}
            />
          </label>
        </div>
        <button
          className="btn"
          onClick={() => {
            const name = typeName.trim();
            if (
              !name ||
              name.length > 40 ||
              choices.some((row) => row.id !== existingId && row.name === name)
            ) {
              setMessage("请填写不重复且不超过40字的类型名称。");
              return;
            }
            const id = existingId || `TYPE-${kind}-${encodeURIComponent(name)}`,
              collection = kind === "customer" ? "customerTypes" : "orderTypes";
            if (kind === "customer")
              types.forEach((row) =>
                act({
                  type: "UPSERT_RECORD",
                  payload: { collection, record: row },
                }),
              );
            const old = choices.find((row) => row.id === id);
            act({
              type: "UPSERT_RECORD",
              payload: {
                collection,
                record:
                  kind === "customer"
                    ? {
                        ...(old || { orderType: "个检", queueArea: "常规区" }),
                        id,
                        name,
                      }
                    : { id, name },
              },
            });
            if (kind === "order" && old && old.name !== name)
              types
                .filter((row) => row.orderType === old.name)
                .forEach((row) =>
                  act({
                    type: "UPSERT_RECORD",
                    payload: {
                      collection: "customerTypes",
                      record: { ...row, orderType: name },
                    },
                  }),
                );
            setTypeName("");
            setExistingId("");
            setMessage(
              "类型已保存，登记下拉与新开单映射共用此配置；历史订单保留原记录。",
            );
          }}
        >
          保存自定义类型
        </button>
        <ul>
          {choices.map((row) => (
            <li key={row.id}>{row.name}</li>
          ))}
        </ul>
      </details>
      <details>
        <summary>模拟读卡器型号配置</summary>
        <p>仅维护本地合成设备型号，不读取真实证件或连接设备驱动。</p>
        <div className="form-grid">
          <label>
            当前模拟读卡器
            <select
              aria-label="当前模拟读卡器"
              value={readerId}
              onChange={(e) => setReaderId(e.target.value)}
            >
              {readers.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            自定义读卡器型号
            <input
              aria-label="自定义读卡器型号"
              value={readerName}
              onChange={(e) => setReaderName(e.target.value)}
            />
          </label>
        </div>
        <button
          className="btn"
          onClick={() => {
            const name = readerName.trim();
            if (!name || readers.some((r) => r.name === name)) {
              setMessage("请填写不重复的合成读卡器型号。");
              return;
            }
            const id = `DEMO-CUSTOM-${encodeURIComponent(name)}`;
            act({
              type: "UPSERT_RECORD",
              payload: {
                collection: "cardReaderModels",
                record: { id, name, simulated: true },
              },
            });
            setReaderId(id);
            setReaderName("");
            setMessage("自定义模拟读卡器已加入列表，请保存当前选择。");
          }}
        >
          新增模拟读卡器型号
        </button>
        <button
          className="btn btn-primary"
          onClick={() => {
            if (!readers.some((r) => r.id === readerId)) return;
            act({
              type: "UPDATE_CONFIG",
              payload: { cardReaderModel: readerId },
            });
            setMessage("当前模拟读卡器已保存。");
          }}
        >
          保存读卡器选择
        </button>
      </details>
      {message && <p role="status">{message}</p>}
    </>
  );
}

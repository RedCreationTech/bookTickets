import { useEffect, useRef, useState } from "react";
import { Download, FileCheck2, LoaderCircle, X } from "lucide-react";
import { useDemo } from "../store";
import { getReportLayout, REPORT_LAYOUTS } from "../reportLayouts";
import type { ReportLayoutId } from "../reportLayouts";
import {
  generateReportBatch,
  getReportDeliveryCandidates,
  mergeReportPdfs,
  requireReportAccess,
} from "../reportPdf";
import type {
  GeneratedReportPdf,
  MergedReportPdf,
  ReportBatchResult,
  ReportPdfOptions,
  ReportPdfScope,
} from "../reportPdf";

export interface ReportDeliveryProps {
  selectedIds?: string[];
  /** Required for H5: confines every generated/downloaded file to this synthetic person. */
  patientId?: string;
  compact?: boolean;
  pdfOptions?: Omit<ReportPdfOptions, "signal">;
}
type Preview = {
  filename: string;
  bytes: Uint8Array;
  appointmentIds: string[];
  fingerprint: string;
};
const toBlob = (bytes: Uint8Array) =>
  new Blob([new Uint8Array(bytes).buffer], { type: "application/pdf" });

export default function ReportDelivery({
  selectedIds,
  patientId,
  compact = false,
  pdfOptions,
}: ReportDeliveryProps) {
  const { state, act } = useDemo();
  const [layoutId, setLayoutId] = useState<ReportLayoutId>(
    pdfOptions?.layoutId || "standard",
  );
  const scope: ReportPdfScope = patientId
    ? { kind: "patient", patientId }
    : { kind: "staff" };
  const candidates = getReportDeliveryCandidates(state, scope);
  const selection = [
    ...new Set(
      selectedIds || (patientId ? candidates.map((row) => row.id) : []),
    ),
  ];
  const allowedSelection = selection.filter((id) =>
    candidates.some((order) => order.id === id),
  );
  const fingerprint = JSON.stringify({
    scope,
    layoutId,
    selection,
    allowed: candidates.map((order) => ({
      order,
      patient: state.patients.find((p) => p.id === order.patientId),
    })),
    clinicalItemRules: state.records.clinicalItemRules || [],
    packageItems: state.packages.map((p) => ({ id: p.id, items: p.items })),
    pdfOptions: {
      layoutId: pdfOptions?.layoutId,
      createdAt: pdfOptions?.createdAt,
    },
    role: state.config.role,
    customRole: state.config.customRoleId,
  });
  const live = useRef({ state, scope, fingerprint });
  live.current = { state, scope, fingerprint };
  const running = useRef(false);
  const job = useRef(0),
    controller = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState({ done: 0, total: 0 });
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<
    (ReportBatchResult & { fingerprint: string }) | null
  >(null);
  const [preview, setPreview] = useState<Preview | null>(null),
    [previewUrl, setPreviewUrl] = useState("");
  const downloads = useRef(new Set<string>());
  const visibleResult = result?.fingerprint === fingerprint ? result : null;
  const visiblePreview = preview?.fingerprint === fingerprint ? preview : null;
  useEffect(() => {
    controller.current?.abort();
    job.current += 1;
    running.current = false;
    setBusy(false);
    setResult(null);
    setPreview(null);
    setNotice("");
    return () => {
      controller.current?.abort();
      job.current += 1;
    };
  }, [fingerprint]);
  useEffect(() => {
    setPreviewUrl("");
    if (!preview || preview.fingerprint !== fingerprint) return;
    try {
      const url = URL.createObjectURL(toBlob(preview.bytes));
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } catch {
      setNotice(
        "本地PDF已生成，但当前浏览器不能创建预览链接，请使用支持Blob的浏览器。",
      );
    }
  }, [preview, fingerprint]);
  useEffect(
    () => () => {
      downloads.current.forEach((url) => URL.revokeObjectURL(url));
      downloads.current.clear();
    },
    [],
  );
  const validate = (ids: string[]) => {
    if (live.current.fingerprint !== fingerprint)
      throw new Error("报告选择或访问范围已变更，请重新生成。");
    ids.forEach((id) =>
      requireReportAccess(live.current.state, id, live.current.scope),
    );
  };
  const showPreview = (file: GeneratedReportPdf | MergedReportPdf) => {
    const ids =
      "appointmentIds" in file ? file.appointmentIds : [file.appointmentId];
    try {
      validate(ids);
      setPreview({
        filename: file.filename,
        bytes: file.bytes,
        appointmentIds: ids,
        fingerprint,
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "报告不可访问");
    }
  };
  const start = async (ids: string[], preserve = false) => {
    if (running.current) return;
    if (!ids.length) {
      setNotice("请先选择审核通过的可交付报告。");
      return;
    }
    running.current = true;
    const current = ++job.current,
      active = new AbortController();
    controller.current = active;
    const previous = preserve ? visibleResult?.files || [] : [];
    setBusy(true);
    setNotice("正在本地生成真实PDF，不会上传数据或调用打印。");
    setProgress({ done: 0, total: [...new Set(ids)].length });
    if (!preserve) {
      setResult(null);
      setPreview(null);
    }
    try {
      const generated = await generateReportBatch(state, ids, scope, {
        ...pdfOptions,
        layoutId,
        signal: active.signal,
        onProgress: (done, total) => {
          if (job.current === current) setProgress({ done, total });
        },
      });
      if (job.current !== current) return;
      if (previous.length) {
        generated.files = [
          ...new Map(
            [...previous, ...generated.files].map((file) => [
              file.appointmentId,
              file,
            ]),
          ).values(),
        ];
        if (!generated.cancelled && generated.files.length)
          generated.merged = await mergeReportPdfs(generated.files, {
            signal: active.signal,
            createdAt: pdfOptions?.createdAt,
          });
      }
      if (job.current !== current) return;
      validate(generated.files.map((file) => file.appointmentId));
      setResult({ ...generated, fingerprint });
      setNotice(
        generated.cancelled
          ? `已取消后续生成，保留已完成 ${generated.files.length} 份，可逐份下载。`
          : `已生成 ${generated.files.length} 份有效PDF${generated.failures.length ? `，${generated.failures.length} 份失败，可重试` : ""}。`,
      );
      if (!generated.cancelled && generated.files.length)
        showPreview(
          generated.files.length === 1 ? generated.files[0] : generated.merged!,
        );
    } catch (error) {
      if (job.current === current)
        setNotice(
          active.signal.aborted
            ? "已取消本次生成。"
            : error instanceof Error
              ? error.message
              : "PDF生成失败，请重试。",
        );
    } finally {
      if (job.current === current) {
        running.current = false;
        setBusy(false);
      }
    }
  };
  const download = (file: GeneratedReportPdf | MergedReportPdf) => {
    const ids =
      "appointmentIds" in file ? file.appointmentIds : [file.appointmentId];
    try {
      validate(ids);
      const url = URL.createObjectURL(toBlob(file.bytes));
      downloads.current.add(url);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.filename;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => {
        URL.revokeObjectURL(url);
        downloads.current.delete(url);
      }, 1500);
      act({
        type: "ADD_AUDIT",
        payload: {
          message: `请求本地PDF下载：${ids.join("、")}，合成报告${ids.length}份；未调用打印或外部交付。`,
        },
      });
      setNotice(
        "已请求浏览器下载PDF，请查看浏览器下载记录；浏览器可能要求您确认保存。",
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "PDF下载请求失败，请重试。",
      );
    }
  };
  const layoutOrder = candidates.find((row) => row.id === allowedSelection[0]);
  const layoutPreview = layoutOrder
    ? getReportLayout(state, layoutOrder, layoutId)
    : null;
  return (
    <section
      className={compact ? "pt-note" : "panel"}
      aria-label="真实PDF报告交付"
      style={{ marginTop: 16, padding: compact ? 16 : 20 }}
    >
      <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <FileCheck2 size={20} /> 本地 PDF 报告
      </h3>
      <p className="muted">
        仅生成已审核合成报告，中文字体内嵌。单份可预览下载，批量合并为一个PDF；不上传、不打印、不进行真实医疗交付。
      </p>
      <label>
        报告用途与版式
        <select
          aria-label="报告用途与版式"
          value={layoutId}
          disabled={busy}
          onChange={(e) => setLayoutId(e.target.value as ReportLayoutId)}
        >
          {REPORT_LAYOUTS.map((layout) => (
            <option key={layout.id} value={layout.id}>
              {layout.name}
            </option>
          ))}
        </select>
      </label>
      {layoutPreview && (
        <details open aria-label="所选报告版式预览">
          <summary>{layoutPreview.heading} · 章节预览</summary>
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                layoutPreview.layout === "cards"
                  ? "repeat(auto-fit,minmax(200px,1fr))"
                  : "1fr",
              gap: 12,
            }}
          >
            {layoutPreview.sections.map((section) => (
              <article
                key={section.key}
                style={{
                  border: "1px solid #dce8e5",
                  padding: layoutPreview.layout === "compact" ? 10 : 18,
                  background: section.pageBreakBefore ? "#edf8f5" : "white",
                  gridColumn: section.pageBreakBefore ? "1 / -1" : undefined,
                }}
              >
                <h4>
                  {section.heading}
                  {section.pageBreakBefore ? " · PDF另起一页" : ""}
                </h4>
                {(section.lines.length
                  ? section.lines
                  : ["本次未登记此类项目。"]
                ).map((line, index) => (
                  <p
                    key={index}
                    style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                  >
                    {line}
                  </p>
                ))}
              </article>
            ))}
          </div>
        </details>
      )}
      {!selection.length || !allowedSelection.length ? (
        <p role="note">当前没有选中的可交付报告，请先选择已审核报告。</p>
      ) : (
        <p>
          本次选择 {selection.length} 份，当前范围可交付{" "}
          {allowedSelection.length} 份（每批最多30份）。
        </p>
      )}
      {selection.length > allowedSelection.length && (
        <p role="note">部分选择未审核或不在当前访问范围，不会生成其内容。</p>
      )}
      <div
        className="actions"
        style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
      >
        <button
          className={compact ? "pt-primary" : "btn btn-primary"}
          disabled={busy || !allowedSelection.length || selection.length > 30}
          onClick={() => void start(selection)}
        >
          {busy ? <LoaderCircle size={16} /> : <FileCheck2 size={16} />}
          {selection.length > 1 ? "批量生成合并PDF" : "生成并预览PDF"}
        </button>
        {busy && (
          <button
            className={compact ? "pt-secondary" : "btn"}
            onClick={() => {
              controller.current?.abort();
              setNotice("正在取消生成，尚未完成的文件不会提供下载。");
            }}
          >
            取消生成
          </button>
        )}
      </div>
      {busy && (
        <p role="status">
          生成进度 {progress.done} / {progress.total}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {visibleResult && (
        <div>
          {visibleResult.files.length > 1 && visibleResult.merged && (
            <div className="actions" style={{ margin: "12px 0" }}>
              <button
                className="btn btn-primary"
                onClick={() => download(visibleResult.merged!)}
              >
                <Download size={16} />
                下载合并PDF（{visibleResult.files.length}份）
              </button>
              <button
                className="btn"
                onClick={() => showPreview(visibleResult.merged!)}
              >
                预览合并PDF
              </button>
            </div>
          )}
          {visibleResult.files.map((file) => (
            <div
              key={file.appointmentId}
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 10,
                padding: "8px 0",
                borderBottom: "1px solid #dbe5e4",
              }}
            >
              <span>
                {file.filename} · {file.pageCount} 页 ·{" "}
                {Math.ceil(file.bytes.length / 1024)} KB
              </span>
              <button className="btn" onClick={() => showPreview(file)}>
                预览 {file.appointmentId}
              </button>
              <button className="btn" onClick={() => download(file)}>
                下载 {file.appointmentId}
              </button>
            </div>
          ))}
          {visibleResult.failures.length > 0 && (
            <div role="alert">
              <p>以下报告未生成文件：</p>
              {visibleResult.failures.map((failure, index) => (
                <p key={failure.appointmentId}>
                  第 {index + 1} 份：{failure.message}
                </p>
              ))}
              <button
                className="btn"
                disabled={busy}
                onClick={() =>
                  void start(
                    visibleResult.failures.map(
                      (failure) => failure.appointmentId,
                    ),
                    true,
                  )
                }
              >
                重试失败报告
              </button>
            </div>
          )}
        </div>
      )}
      {visiblePreview && previewUrl && (
        <section aria-label="PDF预览区域" style={{ marginTop: 16 }}>
          <div
            className="actions"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <b>{visiblePreview.filename}</b>
            <button
              className="btn"
              aria-label="关闭PDF预览"
              onClick={() => setPreview(null)}
            >
              <X size={16} />
              关闭预览
            </button>
          </div>
          <iframe
            title="PDF本地预览"
            src={previewUrl}
            style={{
              width: "100%",
              height: 540,
              border: "1px solid #dbe5e4",
              marginTop: 8,
              background: "white",
            }}
          />
          <small>
            预览由浏览器内置PDF阅读器提供；若当前浏览器不支持，请使用上方下载按钮查看真实PDF文件。
          </small>
        </section>
      )}
    </section>
  );
}

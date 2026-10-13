import { clinicalItems } from "./clinicalRules";
import type { Appointment, DemoState } from "./model";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { getReportLayout } from "./reportLayouts";
import type { ReportLayoutId } from "./reportLayouts";

export type ReportPdfScope =
  { kind: "patient"; patientId: string } | { kind: "staff" };
export interface GeneratedReportPdf {
  appointmentId: string;
  patientId: string;
  filename: string;
  bytes: Uint8Array;
  pageCount: number;
}
export interface MergedReportPdf {
  appointmentIds: string[];
  filename: string;
  bytes: Uint8Array;
  pageCount: number;
}
export interface ReportPdfOptions {
  signal?: AbortSignal;
  layoutId?: ReportLayoutId;
  fontBytes?: Uint8Array;
  createdAt?: Date;
  loadFont?: (signal?: AbortSignal) => Promise<Uint8Array>;
}
export class ReportPdfError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ReportPdfError";
  }
}
const abortCheck = (signal?: AbortSignal) => {
  if (signal?.aborted)
    throw new ReportPdfError("aborted", "已取消PDF生成，未生成部分内容文件。");
};
const staffRoles = new Set([
  "admin",
  "reception",
  "doctor",
  "reviewer",
  "finance",
]);
function withinScope(
  state: DemoState,
  order: Appointment,
  scope: ReportPdfScope,
) {
  if (scope.kind === "patient")
    return !!scope.patientId && order.patientId === scope.patientId;
  const role = (state.records.roles || []).find(
    (row) => row.id === state.config.customRoleId,
  );
  if (!role) return staffRoles.has(state.config.role || "admin");
  const patient = state.patients.find((row) => row.id === order.patientId);
  return (
    role.menuPaths?.includes("/reports") &&
    (!role.allowedPatientIds?.length ||
      role.allowedPatientIds.includes(order.patientId)) &&
    (!role.allowedCampus || role.allowedCampus === order.campus) &&
    (!role.examTypes?.length ||
      role.examTypes.includes(
        order.orderType || (patient?.company === "个检" ? "个检" : "团检"),
      ))
  );
}
export function getReportDeliveryCandidates(
  state: DemoState,
  scope: ReportPdfScope,
) {
  return state.appointments.filter(
    (order) =>
      ["approved", "printed"].includes(order.status) &&
      withinScope(state, order, scope) &&
      state.patients.some((patient) => patient.id === order.patientId),
  );
}
export function requireReportAccess(
  state: DemoState,
  appointmentId: string,
  scope: ReportPdfScope,
) {
  const order = state.appointments.find((row) => row.id === appointmentId);
  if (
    !order ||
    !withinScope(state, order, scope) ||
    !state.patients.some((patient) => patient.id === order.patientId)
  )
    throw new ReportPdfError("forbidden", "当前范围没有可访问的此份报告。");
  if (!["approved", "printed"].includes(order.status))
    throw new ReportPdfError(
      "not_ready",
      "仅审核通过或已领取的合成报告可以生成PDF。",
    );
  return order;
}
let cachedFont: Uint8Array | undefined;
export async function loadReportFont(signal?: AbortSignal) {
  abortCheck(signal);
  if (cachedFont) return cachedFont;
  try {
    const base = import.meta.env.BASE_URL || "./";
    const response = await fetch(`${base}fonts/HongchuangDemoCJK.ttf`, {
      signal,
      credentials: "same-origin",
    });
    if (!response.ok) throw new Error("font not found");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length < 1000) throw new Error("invalid font");
    abortCheck(signal);
    cachedFont = bytes;
    return bytes;
  } catch {
    abortCheck(signal);
    throw new ReportPdfError(
      "font_load",
      "本地中文字体加载失败，请确认字体资源可用后重试。",
    );
  }
}
const safeFilename = (text: string) =>
  text.replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g, "_").slice(0, 80);
const clean = (value: unknown) =>
  String(value ?? "")
    .replaceAll("\r", "")
    .replaceAll("\t", "  ");

export async function generateReportPdf(
  state: DemoState,
  appointmentId: string,
  scope: ReportPdfScope,
  options: ReportPdfOptions = {},
): Promise<GeneratedReportPdf> {
  abortCheck(options.signal);
  const order = requireReportAccess(state, appointmentId, scope);
  const patient = state.patients.find((row) => row.id === order.patientId)!;
  const template = getReportLayout(state, order, options.layoutId);
  const createdAt = options.createdAt || new Date();
  const allText = [
    template.heading,
    template.footer,
    patient.name,
    order.id,
    ...template.sections.flatMap((section) => [
      section.heading,
      ...section.lines,
    ]),
  ]
    .map(clean)
    .join("\n");
  if (allText.length > 60000 || clinicalItems(state, order).length > 500)
    throw new ReportPdfError(
      "too_large",
      "该合成报告内容过长（上限6万字、500项目），请先调整数据。",
    );
  try {
    const fontBytes =
      options.fontBytes ||
      (await (options.loadFont || loadReportFont)(options.signal));
    abortCheck(options.signal);
    requireReportAccess(state, appointmentId, scope);
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    // Embed the build-time reduced TrueType font intact. Runtime fontkit subsetting
    // produced missing outlines with this converted CJK font in Poppler visual tests.
    const font = await pdf.embedFont(fontBytes, { subset: false });
    const charset = new Set(font.getCharacterSet());
    for (const character of allText) {
      if (character !== "\n" && !charset.has(character.codePointAt(0)!))
        throw new ReportPdfError(
          "unsupported_character",
          "报告含当前中文字体未覆盖的字符，请调整合成文本后重试；不会静默省略文字。",
        );
    }
    abortCheck(options.signal);
    pdf.setTitle(`Hongchuang synthetic report ${order.id}`);
    pdf.setAuthor("Hongchuang local demo");
    pdf.setSubject(
      `Synthetic data only - layout:${template.id} - not for medical diagnosis`,
    );
    pdf.setCreator("Hongchuang browser PDF delivery");
    pdf.setProducer("pdf-lib / Hongchuang demo");
    pdf.setCreationDate(createdAt);
    pdf.setModificationDate(createdAt);
    const width = 595.28,
      height = 841.89,
      margin = 44,
      contentWidth = width - margin * 2;
    const navy = rgb(0.08, 0.18, 0.26),
      teal = rgb(0.06, 0.45, 0.42),
      muted = rgb(0.36, 0.43, 0.46);
    let page = pdf.addPage([width, height]),
      y = 0;
    const pages = [page];
    const header = () => {
      page.drawRectangle({
        x: 0,
        y: height - 12,
        width,
        height: 12,
        color: teal,
      });
      page.drawText("红创 HEALTH REPORT", {
        x: margin,
        y: height - 41,
        size: 11,
        font,
        color: teal,
      });
      page.drawText("合成演示 / SYNTHETIC", {
        x: width - margin - 138,
        y: height - 41,
        size: 9,
        font,
        color: muted,
      });
      y = height - 74;
    };
    header();
    const nextPage = () => {
      page = pdf.addPage([width, height]);
      pages.push(page);
      header();
    };
    const space = (needed: number) => {
      if (y - needed < 67) nextPage();
    };
    const wrap = (text: string, size: number) => {
      const lines: string[] = [];
      for (const paragraph of clean(text).split("\n")) {
        let line = "",
          used = 0;
        for (const character of paragraph) {
          const charWidth = font.widthOfTextAtSize(character, size);
          if (used + charWidth > contentWidth && line) {
            lines.push(line);
            line = "";
            used = 0;
          }
          line += character;
          used += charWidth;
        }
        lines.push(line);
      }
      return lines;
    };
    const text = (value: string, size = 10, color = navy, gap = 4) => {
      for (const line of wrap(value, size)) {
        space(size + gap);
        if (line) page.drawText(line, { x: margin, y, size, font, color });
        y -= size + gap;
      }
    };
    text(template.heading, 20, navy, 8);
    text("合成演示报告，不作为诊断、处方或真实健康决策依据。", 9, muted, 8);
    for (const section of template.sections) {
      abortCheck(options.signal);
      if (section.pageBreakBefore) {
        page = pdf.addPage([width, height]);
        pages.push(page);
        header();
      }
      space(42);
      y -= 11;
      page.drawLine({
        start: { x: margin, y: y + 8 },
        end: { x: width - margin, y: y + 8 },
        thickness: 0.6,
        color: rgb(0.78, 0.85, 0.84),
      });
      if (template.layout === "cards")
        page.drawRectangle({
          x: margin - 6,
          y: y - 7,
          width: contentWidth + 12,
          height: 22,
          color: rgb(0.91, 0.96, 0.95),
        });
      text(
        section.heading,
        template.layout === "compact" ? 11 : 12,
        teal,
        template.layout === "compact" ? 4 : 8,
      );
      for (const line of section.lines.length
        ? section.lines
        : ["暂无此章节内容。"]) {
        text(line, 10, navy, template.layout === "compact" ? 3 : 5);
        y -= template.layout === "compact" ? 1 : 4;
      }
    }
    y -= 8;
    text(template.footer, 9, muted, 4);
    pages.forEach((current, index) => {
      current.drawLine({
        start: { x: margin, y: 50 },
        end: { x: width - margin, y: 50 },
        thickness: 0.5,
        color: rgb(0.82, 0.87, 0.87),
      });
      current.drawText(
        `本地生成 ${createdAt.toISOString().slice(0, 10)}  |  合成数据`,
        { x: margin, y: 33, size: 8, font, color: muted },
      );
      current.drawText(`${index + 1} / ${pages.length}`, {
        x: width - margin - 40,
        y: 33,
        size: 8,
        font,
        color: muted,
      });
    });
    abortCheck(options.signal);
    const bytes = await pdf.save({ useObjectStreams: false });
    abortCheck(options.signal);
    return {
      appointmentId,
      patientId: patient.id,
      filename: `红创_${safeFilename(patient.name)}_${safeFilename(order.id)}_${template.id}.pdf`,
      bytes,
      pageCount: pages.length,
    };
  } catch (error) {
    abortCheck(options.signal);
    if (error instanceof ReportPdfError) throw error;
    throw new ReportPdfError(
      "generation_failed",
      "PDF生成失败，未提供不完整文件；请检查本地字体和合成报告后重试。",
    );
  }
}
export async function mergeReportPdfs(
  files: GeneratedReportPdf[],
  options: Pick<ReportPdfOptions, "signal" | "createdAt"> = {},
): Promise<MergedReportPdf> {
  abortCheck(options.signal);
  if (!files.length)
    throw new ReportPdfError("empty", "没有成功生成的PDF可合并。");
  const merged = await PDFDocument.create();
  const date = options.createdAt || new Date();
  merged.setTitle("Hongchuang synthetic report batch");
  merged.setCreationDate(date);
  merged.setModificationDate(date);
  for (const file of files) {
    abortCheck(options.signal);
    const input = await PDFDocument.load(file.bytes);
    const pages = await merged.copyPages(input, input.getPageIndices());
    pages.forEach((page) => merged.addPage(page));
  }
  const bytes = await merged.save({ useObjectStreams: false });
  abortCheck(options.signal);
  return {
    appointmentIds: files.map((file) => file.appointmentId),
    filename: `红创_合成报告批量_${date.toISOString().slice(0, 10)}_${files.length}份.pdf`,
    bytes,
    pageCount: merged.getPageCount(),
  };
}
export interface ReportBatchResult {
  files: GeneratedReportPdf[];
  failures: { appointmentId: string; code: string; message: string }[];
  cancelled: boolean;
  merged?: MergedReportPdf;
}
export async function generateReportBatch(
  state: DemoState,
  ids: string[],
  scope: ReportPdfScope,
  options: ReportPdfOptions & {
    onProgress?: (completed: number, total: number) => void;
  } = {},
): Promise<ReportBatchResult> {
  const unique = [...new Set(ids)];
  if (!unique.length) throw new ReportPdfError("empty", "请先选择可交付报告。");
  if (unique.length > 30)
    throw new ReportPdfError("too_many", "每批最多30份，请分批选择。");
  const result: ReportBatchResult = {
    files: [],
    failures: [],
    cancelled: false,
  };
  for (const id of unique) {
    if (options.signal?.aborted) {
      result.cancelled = true;
      break;
    }
    try {
      result.files.push(await generateReportPdf(state, id, scope, options));
    } catch (error) {
      if (
        options.signal?.aborted ||
        (error instanceof ReportPdfError && error.code === "aborted")
      ) {
        result.cancelled = true;
        break;
      }
      result.failures.push({
        appointmentId: id,
        code:
          error instanceof ReportPdfError ? error.code : "generation_failed",
        message: error instanceof Error ? error.message : "PDF生成失败",
      });
    }
    options.onProgress?.(
      result.files.length + result.failures.length,
      unique.length,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  if (options.signal?.aborted) result.cancelled = true;
  if (!result.cancelled && result.files.length) {
    try {
      result.merged = await mergeReportPdfs(result.files, options);
    } catch (error) {
      if (options.signal?.aborted) result.cancelled = true;
      else throw error;
    }
  }
  return result;
}

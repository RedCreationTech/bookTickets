// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { readFileSync, writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import ReportDelivery from "../src/modules/ReportDelivery";
import { DemoProvider, useDemo } from "../src/store";
import { createInitialState } from "../src/model";
import {
  generateReportPdf,
  generateReportBatch,
  getReportDeliveryCandidates,
  loadReportFont,
  requireReportAccess,
} from "../src/reportPdf";
const fontBytes = new Uint8Array(
  readFileSync(process.cwd() + "/public/fonts/HongchuangDemoCJK.ttf"),
);
const fixedDate = new Date("2026-10-13T08:00:00Z");
const options = { fontBytes, createdAt: fixedDate };
const STORAGE = "hongchuang.health.demo.v1";
function reportState() {
  const state = createInitialState();
  state.appointments = [
    {
      ...state.appointments[0],
      id: "PDF-ONE",
      patientId: "P001",
      status: "approved",
      conclusion: "合成结论：样例指标供演示，不作为诊疗依据。",
      items: ["一般检查", "血常规", "心电图"],
      results: {
        一般检查: "合成正常值",
        血常规: "演示结果",
        心电图: "合成节律结果",
      },
      reviewSuggestions: ["合成建议：规律作息。"],
    },
    {
      ...state.appointments[0],
      id: "PDF-TWO",
      patientId: "P002",
      status: "approved",
      conclusion: "其他客户的合成专属结果",
      items: ["一般检查"],
      results: { 一般检查: "合成正常值" },
    },
    {
      ...state.appointments[0],
      id: "PDF-PENDING",
      patientId: "P001",
      status: "review",
    },
  ];
  state.config.role = "admin";
  return state;
}
function Probe() {
  const { state } = useDemo();
  return (
    <pre hidden data-testid="pdf-state">
      {JSON.stringify(state)}
    </pre>
  );
}
function currentState() {
  return JSON.parse(screen.getByTestId("pdf-state").textContent || "{}");
}
function click(name: string) {
  fireEvent.click(screen.getByRole("button", { name, exact: true }));
}
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("真实PDF字节、字体与交付隔离", () => {
  it("生成可解析真实PDF及内嵌中文字体，不是改后缀文本", async () => {
    const state = reportState();
    const file = await generateReportPdf(
      state,
      "PDF-ONE",
      { kind: "patient", patientId: "P001" },
      options,
    );
    const source = new TextDecoder("latin1").decode(file.bytes);
    expect(source.startsWith("%PDF-")).toBe(true);
    expect(source).toContain("/Type /Catalog");
    expect(source.includes("/FontFile2")).toBe(true);
    expect(source).toContain("/ToUnicode");
    expect(source.trimEnd().endsWith("%%EOF")).toBe(true);
    const pdf = await PDFDocument.load(file.bytes);
    expect(pdf.getPageCount()).toBe(file.pageCount);
    expect(pdf.getTitle()).toContain("PDF-ONE");
    expect(file.filename.endsWith(".pdf")).toBe(true);
    expect(file.bytes.length).toBeGreaterThan(10000);
    expect(state.appointments[0].status).toBe("approved");
    expect(window.print).not.toHaveBeenCalled();
    if (process.env.WRITE_PDF_SAMPLE)
      writeFileSync("/tmp/hongchuang-report-sample.pdf", file.bytes);
  }, 15000);
  it("长结论自动分页，批量合并每份独立页面并消除重复选择", async () => {
    const state = reportState();
    state.appointments[0].conclusion =
      "这是用于分页校验的合成中文报告内容。".repeat(220);
    const result = await generateReportBatch(
      state,
      ["PDF-ONE", "PDF-TWO", "PDF-ONE"],
      { kind: "staff" },
      options,
    );
    expect(result.files).toHaveLength(2);
    expect(result.files[0].pageCount).toBeGreaterThan(1);
    expect(result.merged?.appointmentIds).toEqual(["PDF-ONE", "PDF-TWO"]);
    const merged = await PDFDocument.load(result.merged!.bytes);
    expect(merged.getPageCount()).toBe(
      result.files.reduce((sum, file) => sum + file.pageCount, 0),
    );
    expect(result.failures).toHaveLength(0);
    if (process.env.WRITE_PDF_SAMPLE)
      writeFileSync(
        "/tmp/hongchuang-report-multipage.pdf",
        result.merged!.bytes,
      );
  }, 20000);
  it("H5不可生成他人报告，未审核报告也不能生成", async () => {
    const state = reportState();
    const loadFont = vi.fn().mockResolvedValue(fontBytes);
    await expect(
      generateReportPdf(
        state,
        "PDF-TWO",
        { kind: "patient", patientId: "P001" },
        { loadFont },
      ),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      generateReportPdf(
        state,
        "PDF-PENDING",
        { kind: "patient", patientId: "P001" },
        { loadFont },
      ),
    ).rejects.toMatchObject({ code: "not_ready" });
    expect(loadFont).not.toHaveBeenCalled();
    expect(
      getReportDeliveryCandidates(state, {
        kind: "patient",
        patientId: "P001",
      }).map((row) => row.id),
    ).toEqual(["PDF-ONE"]);
  });
  it("员工自定义角色按菜单、客户、院区隔离，普通无报告角色禁止", () => {
    const state = reportState();
    state.config.customRoleId = "LIMITED";
    state.records.roles = [
      {
        id: "LIMITED",
        menuPaths: ["/reports"],
        allowedPatientIds: ["P001"],
        allowedCampus: state.appointments[0].campus,
      },
    ];
    expect(
      getReportDeliveryCandidates(state, { kind: "staff" }).map(
        (row) => row.id,
      ),
    ).toEqual(["PDF-ONE"]);
    expect(() =>
      requireReportAccess(state, "PDF-TWO", { kind: "staff" }),
    ).toThrow("当前范围");
    state.records.roles[0].menuPaths = ["/appointments"];
    expect(getReportDeliveryCandidates(state, { kind: "staff" })).toHaveLength(
      0,
    );
    state.config.customRoleId = null;
    state.config.role = "enterprise";
    expect(getReportDeliveryCandidates(state, { kind: "staff" })).toHaveLength(
      0,
    );
  });
  it("字体缺失、损坏和未覆盖字形均明确失败，不漏字交付", async () => {
    const state = reportState();
    await expect(
      generateReportPdf(
        state,
        "PDF-ONE",
        { kind: "staff" },
        { fontBytes: new Uint8Array([1, 2, 3]) },
      ),
    ).rejects.toMatchObject({ code: "generation_failed" });
    state.appointments[0].conclusion = "合成扩展字形🦄";
    await expect(
      generateReportPdf(state, "PDF-ONE", { kind: "staff" }, options),
    ).rejects.toMatchObject({ code: "unsupported_character" });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("missing local font"));
    await expect(loadReportFont()).rejects.toMatchObject({ code: "font_load" });
    expect(fetchMock.mock.calls[0][0]).toContain("fonts/HongchuangDemoCJK.ttf");
  }, 15000);
  it("批量保留成功文件并列出单份失败，不把失败内容混进合并PDF", async () => {
    const state = reportState();
    const result = await generateReportBatch(
      state,
      ["PDF-PENDING", "PDF-ONE", "PDF-TWO"],
      { kind: "patient", patientId: "P001" },
      options,
    );
    expect(result.files.map((file) => file.appointmentId)).toEqual(["PDF-ONE"]);
    expect(result.failures.map((row) => row.code)).toEqual([
      "not_ready",
      "forbidden",
    ]);
    expect(result.merged?.appointmentIds).toEqual(["PDF-ONE"]);
    expect((await PDFDocument.load(result.merged!.bytes)).getPageCount()).toBe(
      result.files[0].pageCount,
    );
  }, 15000);
  it("单份预取消与批量中途取消均停止后续生成", async () => {
    const state = reportState();
    const controller = new AbortController();
    controller.abort();
    await expect(
      generateReportPdf(
        state,
        "PDF-ONE",
        { kind: "staff" },
        { ...options, signal: controller.signal },
      ),
    ).rejects.toMatchObject({ code: "aborted" });
    const during = new AbortController();
    const progress = vi.fn(() => during.abort());
    const result = await generateReportBatch(
      state,
      ["PDF-ONE", "PDF-TWO"],
      { kind: "staff" },
      { ...options, signal: during.signal, onProgress: progress },
    );
    expect(result.cancelled).toBe(true);
    expect(result.files.map((file) => file.appointmentId)).toEqual(["PDF-ONE"]);
    expect(result.merged).toBeUndefined();
    expect(progress).toHaveBeenCalledTimes(1);
  }, 15000);
  it("空选与超大批次有明确守卫", async () => {
    const state = reportState();
    await expect(
      generateReportBatch(state, [], { kind: "staff" }, options),
    ).rejects.toMatchObject({ code: "empty" });
    await expect(
      generateReportBatch(
        state,
        Array.from({ length: 31 }, (_, i) => String(i)),
        { kind: "staff" },
        options,
      ),
    ).rejects.toMatchObject({ code: "too_many" });
  });
});

describe("PDF交付组件状态与下载", () => {
  it("生成后在本地iframe查看并请求真实PDF下载，关闭时释放URL", async () => {
    localStorage.setItem(STORAGE, JSON.stringify(reportState()));
    window.location.hash = "#/patient";
    const download = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    render(
      <DemoProvider>
        <ReportDelivery
          selectedIds={["PDF-ONE"]}
          patientId="P001"
          pdfOptions={options}
        />
        <Probe />
      </DemoProvider>,
    );
    click("生成并预览PDF");
    await screen.findByRole(
      "button",
      { name: "下载 PDF-ONE" },
      { timeout: 12000 },
    );
    expect(await screen.findByTitle("PDF本地预览")).toHaveAttribute(
      "src",
      "blob:test",
    );
    click("下载 PDF-ONE");
    expect(download).toHaveBeenCalledTimes(1);
    expect(vi.mocked(URL.createObjectURL).mock.calls.at(-1)?.[0]).toMatchObject(
      { type: "application/pdf" },
    );
    expect(
      currentState().audit.some((row: { message: string }) =>
        row.message.includes("请求本地PDF下载"),
      ),
    ).toBe(true);
    expect(currentState().appointments[0].status).toBe("approved");
    expect(window.print).not.toHaveBeenCalled();
    click("关闭PDF预览");
    expect(screen.queryByTitle("PDF本地预览")).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  }, 15000);
  it("批量提供一个合并下载按钮，不自动触发多次浏览器下载", async () => {
    localStorage.setItem(STORAGE, JSON.stringify(reportState()));
    window.location.hash = "#/reports";
    const download = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    render(
      <DemoProvider>
        <ReportDelivery
          selectedIds={["PDF-ONE", "PDF-TWO"]}
          pdfOptions={options}
        />
      </DemoProvider>,
    );
    click("批量生成合并PDF");
    const button = await screen.findByRole(
      "button",
      { name: "下载合并PDF（2份）" },
      { timeout: 15000 },
    );
    expect(download).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(download).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "下载 PDF-TWO" })).toBeTruthy();
  }, 18000);
  it("单份失败后可重试，错误状态不会提供无效文件", async () => {
    localStorage.setItem(STORAGE, JSON.stringify(reportState()));
    const loadFont = vi
      .fn()
      .mockRejectedValueOnce(new Error("synthetic font failure"))
      .mockResolvedValue(fontBytes);
    render(
      <DemoProvider>
        <ReportDelivery
          selectedIds={["PDF-ONE"]}
          patientId="P001"
          pdfOptions={{ loadFont }}
        />
      </DemoProvider>,
    );
    click("生成并预览PDF");
    await screen.findByRole("button", { name: "重试失败报告" });
    expect(screen.queryByRole("button", { name: "下载 PDF-ONE" })).toBeNull();
    click("重试失败报告");
    await screen.findByRole(
      "button",
      { name: "下载 PDF-ONE" },
      { timeout: 12000 },
    );
    expect(loadFont).toHaveBeenCalledTimes(2);
  }, 15000);
  it("取消等待中的生成后不产生文件，双击不会启动重复任务", async () => {
    localStorage.setItem(STORAGE, JSON.stringify(reportState()));
    let release!: (font: Uint8Array) => void;
    const loadFont = vi.fn(
      () =>
        new Promise<Uint8Array>((resolve) => {
          release = resolve;
        }),
    );
    render(
      <DemoProvider>
        <ReportDelivery
          selectedIds={["PDF-ONE"]}
          patientId="P001"
          pdfOptions={{ loadFont }}
        />
      </DemoProvider>,
    );
    const start = screen.getByRole("button", { name: "生成并预览PDF" });
    act(() => {
      fireEvent.click(start);
      fireEvent.click(start);
    });
    expect(loadFont).toHaveBeenCalledTimes(1);
    click("取消生成");
    await act(async () => {
      release(fontBytes);
    });
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "取消生成" })).toBeNull(),
    );
    expect(screen.queryByRole("button", { name: "下载 PDF-ONE" })).toBeNull();
    expect(screen.getByText(/已取消后续生成/)).toBeTruthy();
  });
  it("生成过程中切换体检人会撤销旧任务和预览，不能暴露旧报告", async () => {
    localStorage.setItem(STORAGE, JSON.stringify(reportState()));
    let release!: (font: Uint8Array) => void;
    const loadFont = () =>
      new Promise<Uint8Array>((resolve) => {
        release = resolve;
      });
    const first = render(
      <DemoProvider>
        <ReportDelivery
          selectedIds={["PDF-ONE"]}
          patientId="P001"
          pdfOptions={{ loadFont }}
        />
      </DemoProvider>,
    );
    click("生成并预览PDF");
    first.rerender(
      <DemoProvider>
        <ReportDelivery
          selectedIds={["PDF-ONE"]}
          patientId="P002"
          pdfOptions={{ loadFont }}
        />
      </DemoProvider>,
    );
    await act(async () => {
      release(fontBytes);
    });
    expect(screen.queryByTitle("PDF本地预览")).toBeNull();
    expect(screen.queryByRole("button", { name: "下载 PDF-ONE" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "生成并预览PDF" }),
    ).toBeDisabled();
  });
  it("未审核选择和无权限报告均显示空守卫，不加载字体", () => {
    localStorage.setItem(STORAGE, JSON.stringify(reportState()));
    const loadFont = vi.fn();
    render(
      <DemoProvider>
        <ReportDelivery
          selectedIds={["PDF-PENDING", "PDF-TWO"]}
          patientId="P001"
          pdfOptions={{ loadFont }}
        />
      </DemoProvider>,
    );
    expect(
      screen.getByRole("button", { name: "批量生成合并PDF" }),
    ).toBeDisabled();
    expect(loadFont).not.toHaveBeenCalled();
    expect(screen.queryByText(/其他客户的合成专属结果/)).toBeNull();
  });
});

describe("T0329/T0356 genuine report-purpose layouts", () => {
  it("same visit produces different section structure and an actual extra VIP page", async () => {
    const state = reportState();
    const { getReportLayout } = await import("../src/reportLayouts");
    const standard = getReportLayout(state, state.appointments[0], "standard");
    const employment = getReportLayout(
      state,
      state.appointments[0],
      "employment",
    );
    const driver = getReportLayout(state, state.appointments[0], "driver");
    const seafarer = getReportLayout(state, state.appointments[0], "seafarer");
    const occupational = getReportLayout(
      state,
      state.appointments[0],
      "occupational",
    );
    expect(employment.sections.map((s) => s.key)).not.toEqual(
      standard.sections.map((s) => s.key),
    );
    expect(driver.sections.some((s) => s.heading === "视听及辨色项目")).toBe(
      true,
    );
    expect(seafarer.sections.some((s) => s.heading === "检验与影像分区")).toBe(
      true,
    );
    expect(
      occupational.sections.find((s) => s.key === "exposure")?.lines,
    ).toContain("接触因素：未登记");
    const normal = await generateReportPdf(
      state,
      "PDF-ONE",
      { kind: "patient", patientId: "P001" },
      { ...options, layoutId: "employment" },
    );
    const vip = await generateReportPdf(
      state,
      "PDF-ONE",
      { kind: "patient", patientId: "P001" },
      { ...options, layoutId: "vip" },
    );
    expect((await PDFDocument.load(normal.bytes)).getSubject()).toContain(
      "layout:employment",
    );
    expect((await PDFDocument.load(vip.bytes)).getSubject()).toContain(
      "layout:vip",
    );
    expect(vip.pageCount).toBeGreaterThan(normal.pageCount);
    expect(vip.filename).toContain("_vip.pdf");
    expect(state.appointments[0].reportTemplateId).toBeUndefined();
    if (process.env.WRITE_PDF_SAMPLE) {
      writeFileSync("/tmp/hongchuang-employment.pdf", normal.bytes);
      writeFileSync("/tmp/hongchuang-vip.pdf", vip.bytes);
    }
  }, 15000);
  it("changing purpose updates preview content, clears old generated files and exports chosen purpose", async () => {
    localStorage.setItem(STORAGE, JSON.stringify(reportState()));
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:layout-preview");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    render(
      <DemoProvider>
        <ReportDelivery
          selectedIds={["PDF-ONE"]}
          patientId="P001"
          pdfOptions={options}
        />
      </DemoProvider>,
    );
    fireEvent.change(screen.getByLabelText("报告用途与版式"), {
      target: { value: "employment" },
    });
    expect(screen.getByLabelText("所选报告版式预览").textContent).toContain(
      "入职检查明细",
    );
    expect(screen.getByLabelText("所选报告版式预览").textContent).not.toContain(
      "有序建议",
    );
    click("生成并预览PDF");
    await waitFor(() => expect(screen.getByTitle("PDF本地预览")).toBeTruthy(), {
      timeout: 15000,
    });
    fireEvent.change(screen.getByLabelText("报告用途与版式"), {
      target: { value: "driver" },
    });
    expect(screen.queryByTitle("PDF本地预览")).toBeNull();
    expect(screen.queryByRole("button", { name: /下载单份PDF/ })).toBeNull();
    expect(screen.getByLabelText("所选报告版式预览").textContent).toContain(
      "视听及辨色项目",
    );
  }, 15000);
});

it("PDF and layout preview expand the shared clinical parent-to-report-child mapping", async () => {
  const s = reportState();
  s.records.clinicalItemRules = [
    {
      id: "BLOOD",
      item: "血常规",
      department: "检验科",
      kind: "text",
      reportItems: ["白细胞", "血红蛋白"],
    },
  ];
  s.appointments[0].items = ["血常规"];
  s.appointments[0].results = {
    血常规: "聚合父项不可代替明细",
    白细胞: "5.8",
    血红蛋白: "140",
  };
  const { getReportLayout } = await import("../src/reportLayouts");
  const layout = getReportLayout(s, s.appointments[0], "standard");
  expect(
    layout.sections.find((section) => section.key === "results")?.lines,
  ).toEqual(["白细胞：5.8", "血红蛋白：140"]);
  const file = await generateReportPdf(
    s,
    "PDF-ONE",
    { kind: "patient", patientId: "P001" },
    options,
  );
  expect((await PDFDocument.load(file.bytes)).getPageCount()).toBeGreaterThan(
    0,
  );
  if (process.env.WRITE_PDF_SAMPLE)
    writeFileSync("/tmp/hongchuang-child-results.pdf", file.bytes);
}, 15000);

function MutateReportContent() {
  const { act } = useDemo();
  return (
    <button
      onClick={() =>
        act({
          type: "UPDATE_APPOINTMENT",
          payload: { id: "PDF-ONE", conclusion: "已修改的合成结论" },
        })
      }
    >
      修改同状态报告结论
    </button>
  );
}
describe("PDF content version invalidation", () => {
  it("invalidates downloaded bytes and iframe when approved report content changes without changing status", async () => {
    localStorage.setItem(STORAGE, JSON.stringify(reportState()));
    window.location.hash = "#/reports";
    render(
      <DemoProvider>
        <ReportDelivery selectedIds={["PDF-ONE"]} pdfOptions={options} />
        <MutateReportContent />
      </DemoProvider>,
    );
    click("生成并预览PDF");
    await screen.findByRole(
      "button",
      { name: "下载 PDF-ONE" },
      { timeout: 15000 },
    );
    expect(await screen.findByTitle("PDF本地预览")).toBeInTheDocument();
    click("修改同状态报告结论");
    expect(screen.queryByRole("button", { name: "下载 PDF-ONE" })).toBeNull();
    expect(screen.queryByTitle("PDF本地预览")).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  }, 18000);
});

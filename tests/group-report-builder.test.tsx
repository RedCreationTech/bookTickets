// @vitest-environment jsdom
import {
  act,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import JSZip from "jszip";
import {
  createInitialState,
  DemoProvider,
  exportCsv,
  useDemo,
} from "../src/store";
import { GroupReportBuilder } from "../src/modules/GroupReportBuilder";
import {
  buildGroupReport,
  defaultGroupReportFilter,
  groupReportPopulation,
  groupPositiveCsv,
  groupConclusionCsv,
} from "../src/groupReportRules";
import { createGroupReportDocx } from "../src/groupReportDocx";
vi.mock("../src/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/store")>()),
  exportCsv: vi.fn(),
}));
const key = "hongchuang.health.demo.v1";
function fixture() {
  const s = createInitialState();
  const p = s.patients[0],
    a = s.appointments[0];
  s.patients = [
    {
      ...p,
      id: "M",
      name: "合成男",
      sex: "男",
      age: 45,
      company: "红创合成单位",
      marriage: "已婚",
      companyDepartment: "研发部",
    },
    {
      ...p,
      id: "F",
      name: "合成女",
      sex: "女",
      age: 32,
      company: "红创合成单位",
      marriage: "未婚",
      companyDepartment: "财务部",
    },
    { ...p, id: "U", name: "未完成人", sex: "男", company: "红创合成单位" },
    { ...p, id: "X", name: "其他单位人", sex: "女", company: "其他单位" },
  ];
  const items = ["空腹血糖", "一般检查", "血脂四项"];
  s.appointments = [
    {
      ...a,
      id: "M-old",
      patientId: "M",
      date: "2026-10-10",
      items,
      results: { 空腹血糖: "5.0", 一般检查: "120/80", 血脂四项: "正常" },
      status: "review",
      source: "团检备单",
      groupCompany: "红创合成单位",
      conclusion: "旧单结论",
    },
    {
      ...a,
      id: "M-new",
      patientId: "M",
      date: "2026-10-13",
      items,
      results: { 空腹血糖: "8.9", 一般检查: "150/95", 血脂四项: "偏高" },
      status: "approved",
      source: "团检备单",
      groupCompany: "红创合成单位",
      conclusion: "合成男性实际总检结论",
    },
    {
      ...a,
      id: "F-new",
      patientId: "F",
      date: "2026-10-13",
      items,
      results: { 空腹血糖: "5.1", 一般检查: "125/80", 血脂四项: "偏高" },
      status: "review",
      source: "团检备单",
      groupCompany: "红创合成单位",
      conclusion: "合成女性待总检结论",
    },
    {
      ...a,
      id: "U-wait",
      patientId: "U",
      date: "2026-10-13",
      items,
      results: { 空腹血糖: "9.9" },
      status: "in_exam",
      source: "团检备单",
      groupCompany: "红创合成单位",
      conclusion: "",
    },
    {
      ...a,
      id: "X-other",
      patientId: "X",
      date: "2026-10-13",
      items,
      results: { 空腹血糖: "10", 一般检查: "180/100", 血脂四项: "偏高" },
      status: "approved",
      source: "团检备单",
      groupCompany: "其他单位",
      conclusion: "别的单位",
    },
  ];
  return s;
}
const filter = { ...defaultGroupReportFilter, company: "红创合成单位" };
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
function mount(s = fixture()) {
  localStorage.setItem(key, JSON.stringify(s));
  return render(
    <DemoProvider>
      <GroupReportBuilder />
      <Mutate />
    </DemoProvider>,
  );
}
function Mutate() {
  const { act } = useDemo();
  return (
    <button
      onClick={() =>
        act({
          type: "UPDATE_APPOINTMENT",
          payload: {
            id: "M-new",
            conclusion: "归档后的新结论",
            results: { 空腹血糖: "4.5", 一般检查: "120/80", 血脂四项: "正常" },
          },
        })
      }
    >
      改变归档后订单
    </button>
  );
}
describe("cohort selection and actual abnormal analysis", () => {
  it("includes only completed selected-unit group people, excludes incomplete and cancelled, and chooses latest completed order per patient", () => {
    const s = fixture();
    expect(
      groupReportPopulation(s, filter)
        .map((p) => p.appointmentId)
        .sort(),
    ).toEqual(["F-new", "M-new"]);
    s.appointments[1].status = "cancelled";
    expect(
      groupReportPopulation(s, filter).find((p) => p.patientId === "M")
        ?.appointmentId,
    ).toBe("M-old");
    s.appointments[0].waived = [...s.appointments[0].items];
    expect(groupReportPopulation(s, filter).map((p) => p.patientId)).toEqual([
      "F",
    ]);
  });
  it("combines date, marital, sex, age, package and unit department filters and excludes unknown demographics", () => {
    const s = fixture();
    const options = {
      ...filter,
      from: "2026-10-13",
      to: "2026-10-13",
      sex: "女",
      marriage: "未婚",
      ageMin: "30",
      ageMax: "40",
      packageId: s.appointments[2].packageId,
      department: "财务部",
    };
    expect(
      groupReportPopulation(s, options).map((p) => p.appointmentId),
    ).toEqual(["F-new"]);
    expect(groupReportPopulation(s, { ...options, marriage: "已婚" })).toEqual(
      [],
    );
    expect(
      groupReportPopulation(s, { ...options, from: "2026-10-14" }),
    ).toEqual([]);
  });
  it("sorts actual detected abnormalities, chooses attachments, computes gender topN and three-high deduplicated people", () => {
    const s = fixture();
    const report = buildGroupReport(s, filter, null, "检出数降序", 1);
    expect(report.summary[0]).toMatchObject({
      name: "血脂异常",
      count: 2,
      denominator: 2,
    });
    expect(report.maleTop).toHaveLength(1);
    expect(report.femaleTop).toEqual([
      expect.objectContaining({ name: "血脂异常", count: 1 }),
    ]);
    expect(report.threeHigh).toMatchObject({
      any: 2,
      allThree: 1,
      fullyKnown: 2,
    });
    const selected = buildGroupReport(s, filter, ["血糖升高"], "名称升序", 10);
    expect(selected.abnormalities).toHaveLength(1);
    expect(selected.abnormalities[0].name).toBe("合成男");
    expect(selected.femaleTop).toEqual([]);
    expect(selected.threeHigh.any).toBe(2);
    expect(groupPositiveCsv(selected)[0].结论).toBe("合成男性实际总检结论");
    expect(groupConclusionCsv(selected)).toHaveLength(2);
  });
  it("does not count missing or unparseable blood pressure as normal in three-high denominator", () => {
    const s = fixture();
    s.appointments[2].results.一般检查 = "正常";
    const report = buildGroupReport(s, filter);
    expect(report.threeHigh.fullyKnown).toBe(1);
    expect(
      report.threeHigh.counts.find((r) => r.name === "血压升高"),
    ).toMatchObject({ count: 1, denominator: 1 });
  });
});
describe("archived cohort UI", () => {
  it("changes selected anomalies and topN before storing exact membership without duplicate double-click snapshots", () => {
    mount();
    fireEvent.click(screen.getByText("清空所选异常"));
    fireEvent.click(screen.getByLabelText("纳入异常 血糖升高"));
    change("男女各前N异常", "1");
    const button = screen.getByText("归档当前人群报告");
    act(() => {
      button.click();
      button.click();
    });
    const rows = JSON.parse(localStorage.getItem(key)!).records
      .groupReportSnapshots;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      patientIds: expect.arrayContaining(["M", "F"]),
      appointmentIds: expect.arrayContaining(["M-new", "F-new"]),
      selectedAbnormalities: ["血糖升高"],
      topN: 1,
    });
    expect(rows[0].report.population).toHaveLength(2);
  });
  it("uses saved immutable results and conclusions after underlying appointments change, including both CSV attachments", () => {
    mount();
    fireEvent.click(screen.getByText("归档当前人群报告"));
    fireEvent.click(screen.getByText("改变归档后订单"));
    expect(
      within(screen.getByRole("table", { name: "团检报告纳入名单" })).getByText(
        "合成男性实际总检结论",
      ),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("table", { name: "团检报告纳入名单" }),
      ).queryByText("归档后的新结论"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("导出阳性明细CSV"));
    const positives = vi.mocked(exportCsv).mock.calls.at(-1)![1];
    expect(positives).toHaveLength(4);
    expect(positives.find((r) => r.异常 === "血糖升高")).toMatchObject({
      结果: "8.9",
      结论: "合成男性实际总检结论",
    });
    fireEvent.click(screen.getByText("导出单位结论CSV"));
    expect(vi.mocked(exportCsv).mock.calls.at(-1)![1]).toHaveLength(2);
  });
  it("reopens the archived population after unmount, and disallows export or empty snapshot before selection", () => {
    const view = mount();
    expect(screen.getByText("导出可编辑 Word")).toBeDisabled();
    change("团报婚姻", "未登记婚姻");
    fireEvent.click(screen.getByText("归档当前人群报告"));
    expect(screen.getByRole("status")).toHaveTextContent("没有完成体检人群");
    change("团报婚姻", "未婚");
    fireEvent.click(screen.getByText("归档当前人群报告"));
    const saved = JSON.parse(localStorage.getItem(key)!);
    const id = saved.records.groupReportSnapshots[0].id;
    view.unmount();
    mount(saved);
    change("已归档团检报告", id);
    const table = screen.getByRole("table", { name: "团检报告纳入名单" });
    expect(table).toHaveTextContent("合成女");
    expect(table).not.toHaveTextContent("合成男");
  });
});
describe("genuine editable DOCX export", () => {
  it("creates an OOXML ZIP containing editable Chinese paragraphs and tables, selected population and actual positive conclusions", async () => {
    const report = buildGroupReport(fixture(), filter, ["血糖升高"]);
    const bytes = await createGroupReportDocx(
      report,
      "合成单位可编辑报告",
      "SNAPSHOT-X",
      "2026-10-13T08:00:00Z",
    );
    expect(new Uint8Array(bytes).slice(0, 2)).toEqual(new Uint8Array([80, 75]));
    const zip = await JSZip.loadAsync(bytes);
    const contentTypes = await zip.file("[Content_Types].xml")!.async("string");
    expect(contentTypes).toContain(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
    );
    const xml = await zip.file("word/document.xml")!.async("string");
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
    expect(doc.getElementsByTagName("w:tbl").length).toBeGreaterThanOrEqual(5);
    expect(xml).toContain("合成男性实际总检结论");
    expect(xml).toContain("SNAPSHOT-X");
    expect(xml).toContain("M-new");
    expect(xml).not.toContain("U-wait");
    expect(xml).not.toContain("X-other");
    expect(xml).not.toContain("documentProtection");
  });
  it("generates a Word download from the selected snapshot through the actual UI and leaves archive unchanged", async () => {
    mount();
    fireEvent.click(screen.getByText("归档当前人群报告"));
    const before = JSON.parse(localStorage.getItem(key)!).records
      .groupReportSnapshots;
    const anchor = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    fireEvent.click(screen.getByText("导出可编辑 Word"));
    await waitFor(
      () =>
        expect(screen.getByRole("status")).toHaveTextContent(
          "Word .docx 文件已在本地生成",
        ),
      { timeout: 5000 },
    );
    expect(anchor).toHaveBeenCalledOnce();
    expect(
      JSON.parse(localStorage.getItem(key)!).records.groupReportSnapshots,
    ).toEqual(before);
  });
});
it("rejects invalid topN configuration before creating a snapshot", () => {
  mount();
  change("男女各前N异常", "0");
  fireEvent.click(screen.getByText("归档当前人群报告"));
  expect(screen.getByRole("status")).toHaveTextContent("1–20的整数");
  expect(
    JSON.parse(localStorage.getItem(key)!).records.groupReportSnapshots || [],
  ).toHaveLength(0);
});
it("sets explicit complete CJK font slots for every editable text run and Heading1/Title styles", async () => {
  const report = buildGroupReport(fixture(), filter);
  const bytes = await createGroupReportDocx(
    report,
    "中英标题 CJK Font Check",
    "CJK-FONT-CHECK",
    "2026-10-13T08:00:00Z",
  );
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file("word/document.xml")!.async("string");
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  for (const text of Array.from(doc.getElementsByTagName("w:t"))) {
    const run = text.parentElement!;
    const fonts = run.getElementsByTagName("w:rFonts")[0];
    expect(fonts, `字体缺失: ${text.textContent}`).toBeDefined();
    for (const attr of ["w:ascii", "w:hAnsi", "w:eastAsia", "w:cs"])
      expect(fonts.getAttribute(attr)).toBe("Noto Sans CJK SC");
  }
  const styles = new DOMParser().parseFromString(
    await zip.file("word/styles.xml")!.async("string"),
    "application/xml",
  );
  for (const name of ["Heading1", "Title"]) {
    const style = Array.from(styles.getElementsByTagName("w:style")).find(
      (s) => s.getAttribute("w:styleId") === name,
    )!;
    expect(
      style.getElementsByTagName("w:rFonts")[0].getAttribute("w:eastAsia"),
    ).toBe("Noto Sans CJK SC");
  }
  if (process.env.WRITE_GROUP_DOCX) {
    const fs = await import("node:fs/promises");
    await fs.mkdir("/tmp/health-word-font-qa", { recursive: true });
    await fs.writeFile(
      "/tmp/health-word-font-qa/fixed-group-report.docx",
      new Uint8Array(bytes),
    );
  }
});

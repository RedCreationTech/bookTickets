import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { DemoProvider, createInitialState } from "../src/store";
import { reducer } from "../src/model";
import { Exam, Review } from "../src/modules/Core";
import {
  ReviewWorkflowTools,
  ReviewWorkflowSettings,
} from "../src/modules/ReviewWorkflow";
import {
  SelectedResultPrint,
  PreExamContext,
} from "../src/modules/ClinicalWorkbench";
import { ReviewTools } from "../src/modules/ReviewTools";
import { reviewDoctorEligible } from "../src/clinicalRules";
const key = "hongchuang.health.demo.v1";
const read = () => JSON.parse(localStorage.getItem(key)!);
function fixture() {
  const s = createInitialState();
  s.config.role = "admin";
  s.appointments = [
    {
      ...s.appointments[0],
      id: "CLINICAL-INTEGRATION",
      status: "in_exam",
      date: "2026-10-13",
      items: ["一般检查", "空腹血糖"],
      results: {},
      locked: false,
      reviewStage: 0,
      conclusion: "合成结论",
    },
  ];
  return s;
}
function mount(s: any, node: React.ReactNode) {
  localStorage.setItem(key, JSON.stringify(s));
  return render(<DemoProvider>{node}</DemoProvider>);
}
describe("clinical remaining atom integration", () => {
  it("T0213/0220/0221 date, scan identity, reviewed list and permitted departments consume actual items", () => {
    const s = fixture(),
      a = s.appointments[0];
    s.records.clinicalItemRules = [
      { id: "a", item: "一般检查", department: "内科", kind: "text" },
      { id: "b", item: "空腹血糖", department: "检验", kind: "number" },
    ];
    s.config.doctorAllowedDepartments = { admin: ["内科", "检验"] };
    s.appointments.push(
      { ...a, id: "TOMORROW", date: "2026-10-14" },
      {
        ...a,
        id: "DONE-TODAY",
        status: "review",
        results: { 一般检查: "正常", 空腹血糖: "5.8" },
      },
    );
    mount(s, <Exam />);
    expect(screen.getByText("1 位客户")).toBeInTheDocument();
    expect(screen.getByLabelText("一般检查结果")).toBeInTheDocument();
    expect(screen.queryByLabelText("空腹血糖结果")).toBeNull();
    fireEvent.change(screen.getByLabelText("当前检查科室"), {
      target: { value: "检验" },
    });
    expect(screen.getByLabelText("空腹血糖结果")).toBeInTheDocument();
    expect(
      within(screen.getByLabelText("当前检查科室")).queryByText("超声"),
    ).toBeNull();
    fireEvent.change(screen.getByLabelText("姓名 / 体检号定位"), {
      target: { value: "NOT-FOUND" },
    });
    expect(screen.getByText("当前无待检查客户")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("姓名 / 体检号定位"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("当日检查范围"), {
      target: { value: "已检" },
    });
    expect(screen.getByText("1 位客户")).toBeInTheDocument();
    expect(screen.getByLabelText("空腹血糖结果")).toBeDisabled();
  });
  it("T0290 maintained doctor difficulty intervals restrict assignment and model review", () => {
    const s = fixture(),
      a = s.appointments[0];
    a.status = "review";
    a.reviewDifficulty = 4;
    a.doctor = "周医生";
    s.records.reviewDoctorLevels = [
      {
        id: "L",
        name: "周医生",
        minDifficulty: 1,
        maxDifficulty: 2,
        enabled: true,
      },
      {
        id: "H",
        name: "余医生",
        minDifficulty: 3,
        maxDifficulty: 5,
        enabled: true,
      },
    ];
    expect(reviewDoctorEligible(s, a, "周医生")).toBe(false);
    expect(
      reducer(s, { type: "REVIEW", payload: { id: a.id, expectedStage: 0 } }),
    ).toBe(s);
    expect(
      reducer(s, {
        type: "REVIEW",
        payload: { id: a.id, doctor: "余医生", expectedStage: 0 },
      }).appointments[0].reviewStage,
    ).toBe(1);
    s.records.reviewSchedules = [
      {
        id: "S",
        doctor: "周医生",
        date: "2026-10-13",
        stage: "全部环节",
        capacity: 20,
        status: "scheduled",
      },
    ];
    mount(s, <ReviewTools appointmentId={a.id} />);
    expect(screen.getByRole("button", { name: "分配给周医生" })).toBeDisabled();
  });
  it("T0221 settings persist allowed departments consumed by the exam screen", () => {
    const s = fixture();
    s.records.clinicalItemRules = [
      { id: "d", item: "空腹血糖", department: "检验", kind: "number" },
    ];
    const view = mount(s, <ReviewWorkflowSettings />);
    fireEvent.click(screen.getByText("审核流程、医生等级与分检科室授权"));
    fireEvent.click(screen.getByRole("checkbox", { name: "检验" }));
    fireEvent.click(screen.getByRole("button", { name: "保存岗位允许科室" }));
    expect(read().config.doctorAllowedDepartments.doctor).toEqual(["检验"]);
    view.unmount();
    const restored = read();
    restored.config.role = "doctor";
    mount(restored, <Exam />);
    expect(screen.getByLabelText("空腹血糖结果")).toBeInTheDocument();
    expect(screen.queryByLabelText("一般检查结果")).toBeNull();
  });
  it("T0218/0293 background loads only actual selected patient answers and history", () => {
    const s = fixture(),
      a = s.appointments[0];
    a.questionnaireAnswers = { smoking: "合成从不" };
    a.preExamHistory = "合成既往史A";
    s.records.questionnaires = [
      { id: "Q1", patientId: a.patientId, answer: "当前客户答案" },
      { id: "Q2", patientId: "P002", answer: "他人私密答案" },
    ];
    mount(s, <PreExamContext appointment={a} />);
    expect(screen.getByText(/当前客户答案/)).toBeInTheDocument();
    expect(screen.getByText(/合成从不/)).toBeInTheDocument();
    expect(screen.queryByText(/他人私密答案/)).toBeNull();
  });
  it("T0319 review displays current order local image and refuses external image URLs", () => {
    const s = fixture(),
      a = s.appointments[0];
    a.images = [
      { id: "IMG", name: "合成超声", src: "data:image/png;base64,aGVsbG8=" },
      { id: "EXT", name: "外部影像", src: "https://example.com/private" },
    ];
    mount(s, <ReviewWorkflowTools appointment={a} onConclusion={() => {}} />);
    expect(screen.getByRole("img", { name: "合成超声" })).toHaveAttribute(
      "src",
      a.images[0].src,
    );
    expect(screen.queryByRole("img", { name: "外部影像" })).toBeNull();
  });
  it("T0251 selected item preview contains only selected actual results and invokes local print", () => {
    const s = fixture(),
      a = s.appointments[0];
    a.results = { 一般检查: "合成文字A", 空腹血糖: "5.7" };
    mount(s, <SelectedResultPrint appointment={a} />);
    fireEvent.click(screen.getByText("单项检查结果打印"));
    fireEvent.click(screen.getByRole("checkbox", { name: "空腹血糖" }));
    fireEvent.click(screen.getByRole("button", { name: "预览选中单项结果" }));
    const modal = screen.getByRole("dialog");
    expect(within(modal).getByText(/5\.7/)).toBeInTheDocument();
    expect(within(modal).queryByText("合成文字A")).toBeNull();
    fireEvent.click(within(modal).getByRole("button", { name: /浏览器打印/ }));
    expect(window.print).toHaveBeenCalledOnce();
  });
  it("result metadata is not reassigned when another department saves unchanged existing results", () => {
    let s = fixture();
    const a = s.appointments[0];
    s = reducer(s, {
      type: "SAVE_RESULTS",
      payload: {
        id: a.id,
        results: { 一般检查: "正常" },
        doctor: "甲医生",
        department: "内科",
      },
    });
    s = reducer(s, {
      type: "SAVE_RESULTS",
      payload: {
        id: a.id,
        results: { 一般检查: "正常", 空腹血糖: "5.8" },
        metadataItems: ["空腹血糖"],
        doctor: "乙医生",
        department: "检验",
      },
    });
    expect(s.appointments[0].resultMetadata["一般检查"].doctor).toBe("甲医生");
    expect(s.appointments[0].resultMetadata["空腹血糖"].doctor).toBe("乙医生");
  });
});

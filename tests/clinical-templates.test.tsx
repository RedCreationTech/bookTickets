import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { DemoProvider, createInitialState } from "../src/store";
import { ExamExtras } from "../src/modules/ClinicalExtras";
import { Review } from "../src/modules/Core";
import {
  renderClinicalTemplate,
  getClinicalTemplates,
} from "../src/modules/ClinicalTemplates";
const KEY = "hongchuang.health.demo.v1";
const read = () => JSON.parse(localStorage.getItem(KEY)!);
describe("configured clinical templates are consumed by real business records", () => {
  it("T0469 configured level and substituted summary persist on its selected appointment", () => {
    const s = createInitialState();
    s.records.examDictionaries = [
      {
        id: "CUSTOM",
        name: "自定义重要小结",
        category: "三级小结模板",
        level: "重要",
        status: "已启用",
        description: "{姓名} / {体检号} / {日期}：请人工复核。",
      },
    ];
    localStorage.setItem(KEY, JSON.stringify(s));
    render(
      <DemoProvider>
        <ExamExtras appointmentId={s.appointments[0].id} />
      </DemoProvider>,
    );
    fireEvent.click(
      screen.getByText("分检扩展：分级小结、问诊、影像、音频与申请单"),
    );
    fireEvent.change(screen.getByLabelText("模板小结等级"), {
      target: { value: "重要" },
    });
    fireEvent.change(screen.getByLabelText("分检小结模板"), {
      target: { value: "CUSTOM" },
    });
    fireEvent.click(screen.getByRole("button", { name: "应用所选模板" }));
    fireEvent.click(screen.getByRole("button", { name: "添加分级小结" }));
    expect(read().appointments[0].examSummaries[0]).toMatchObject({
      level: "重要",
      text: expect.stringContaining("林知远 / TJ2026100001"),
    });
    expect(read().appointments[1].examSummaries).toBeUndefined();
  });
  it("T0474 rejection template becomes the actual saved rejection reason", () => {
    const s = createInitialState();
    s.records.examDictionaries = [
      {
        id: "R",
        name: "资料缺漏",
        category: "驳回意见",
        status: "已启用",
        description: "请补充{姓名}（{体检号}）的合成资料。",
      },
    ];
    localStorage.setItem(KEY, JSON.stringify(s));
    render(
      <DemoProvider>
        <Review />
      </DemoProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "驳回重检" }));
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.change(dialog.getByLabelText("驳回意见模板"), {
      target: { value: "R" },
    });
    fireEvent.click(dialog.getByRole("button", { name: "应用所选模板" }));
    fireEvent.click(dialog.getByRole("button", { name: "确认驳回" }));
    expect(
      read().appointments.find((a: any) => a.id === "TJ2026100003"),
    ).toMatchObject({
      status: "in_exam",
      rejectReason: "请补充陈映山（TJ2026100003）的合成资料。",
    });
  });
  it("rejects unknown variables and keeps literal markup as plain text", () => {
    expect(renderClinicalTemplate("{未知}", {}).error).toContain("未知");
    expect(
      renderClinicalTemplate("<script>{姓名}</script>", { 姓名: "合成" }).text,
    ).toBe("<script>合成</script>");
  });
  it("disabled dictionaries are not offered", () => {
    const s = createInitialState();
    s.records.examDictionaries = [
      { id: "OFF", category: "三级小结模板", status: "已停用" },
    ];
    expect(getClinicalTemplates(s, "summary").some((t) => t.id === "OFF")).toBe(
      false,
    );
  });
});

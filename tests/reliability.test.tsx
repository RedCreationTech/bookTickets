import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import App from "../src/App";
import { DemoProvider, createInitialState, reducer } from "../src/store";
describe("storage and explanation reliability", () => {
  it("R01 deletion audit never borrows another record as its after value", () => {
    let s = createInitialState();
    s = reducer(s, {
      type: "UPSERT_RECORD",
      payload: { collection: "test", record: { id: "X1", name: "一" } },
    });
    s = reducer(s, {
      type: "UPSERT_RECORD",
      payload: { collection: "test", record: { id: "X2", name: "二" } },
    });
    s = reducer(s, {
      type: "DELETE_RECORD",
      payload: { collection: "test", id: "X1" },
    });
    expect(s.audit[0].entity).toBe("X1");
    expect(s.audit[0].before.name).toBe("一");
    expect(s.audit[0].after).toBeNull();
    expect(s.records.test[0].id).toBe("X2");
  });
  it("R02 malformed persisted schema recovers initial synthetic data", () => {
    localStorage.setItem(
      "qinghe.health.demo.v1",
      JSON.stringify({
        version: 1,
        patients: [],
        appointments: [],
        config: null,
      }),
    );
    render(
      <DemoProvider>
        <App />
      </DemoProvider>,
    );
    expect(
      screen.getByRole("heading", { name: "每一份健康，都值得悉心守护" }),
    ).toBeInTheDocument();
    expect(
      JSON.parse(localStorage.getItem("qinghe.health.demo.v1")!).patients,
    ).toHaveLength(8);
  });
  it("R03 tutorial provides actual video, captions and chapter seeking without claiming a recording", () => {
    render(
      <DemoProvider>
        <App />
      </DemoProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "演示指南" }));
    const dialog = screen.getByRole("dialog");
    const video = within(dialog).getByLabelText(
      "体检全流程操作引导",
    ) as HTMLVideoElement;
    expect(video.querySelector("source")?.getAttribute("src")).toContain(
      "workflow-guide.mp4",
    );
    expect(video.querySelector("track")?.getAttribute("src")).toContain(
      "workflow-captions.vtt",
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "3. 科室分检" }),
    );
    expect(video.currentTime).toBe(12);
    expect(within(dialog).getByText(/不是实际界面录屏/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "关闭" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

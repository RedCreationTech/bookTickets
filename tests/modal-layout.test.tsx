import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "../src/ui";

describe("viewport modal isolation", () => {
  it("mounts outside overflowing page containers and retains actionable content", () => {
    const confirm = vi.fn();
    const close = vi.fn();
    const { container } = render(
      <div style={{ overflow: "auto", width: 200 }}>
        <Modal title="合成暂停" onClose={close}>
          <button onClick={confirm}>确认暂停</button>
        </Modal>
      </div>,
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(screen.getByRole("dialog").parentElement?.parentElement).toBe(
      document.body,
    );
    fireEvent.click(screen.getByRole("button", { name: "确认暂停" }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByRole("dialog").parentElement!);
    expect(close).toHaveBeenCalledTimes(1);
  });
  it("locks background scrolling until the last open modal unmounts and restores its prior value", () => {
    document.body.style.overflow = "auto";
    const first = render(
      <Modal title="第一层" onClose={() => {}}>
        合成
      </Modal>,
    );
    const second = render(
      <Modal title="第二层" onClose={() => {}}>
        合成
      </Modal>,
    );
    expect(document.body.style.overflow).toBe("hidden");
    first.unmount();
    expect(document.body.style.overflow).toBe("hidden");
    second.unmount();
    expect(document.body.style.overflow).toBe("auto");
    document.body.style.overflow = "";
  });
});

describe("report mobile overflow containment", () => {
  it("keeps the report list and preview tables in local scroll containers", async () => {
    const { DemoProvider } = await import("../src/store");
    const { Reports } = await import("../src/modules/Core");
    render(
      <DemoProvider>
        <Reports />
      </DemoProvider>,
    );
    const list = screen
      .getByRole("checkbox", { name: "全选报告" })
      .closest("table");
    expect(list?.parentElement).toHaveClass(
      "table-scroll",
      "report-table-scroll",
    );
    fireEvent.click(screen.getAllByRole("button", { name: "预览 / 管理" })[0]);
    const dialog = await screen.findByRole("dialog");
    const resultTable = dialog.querySelector(".report-paper table");
    expect(resultTable?.parentElement).toHaveClass("table-scroll");
  });
});

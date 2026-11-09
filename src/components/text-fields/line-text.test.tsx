import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LineText } from "@/components/text-fields/line-text";

afterEach(cleanup);

describe("LineText", () => {
  it("wraps a long value, submits on Enter, and keeps it one line", () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <label htmlFor="intent">Intent</label>
        <LineText id="intent" name="intent" defaultValue="Easy" />
      </form>,
    );
    const field = screen.getByLabelText("Intent") as HTMLTextAreaElement;
    expect(field.tagName).toBe("TEXTAREA");

    fireEvent.input(field, { target: { value: "Chest to wall\nthen free" } });
    expect(field.value).toBe("Chest to wall then free");

    fireEvent.keyDown(field, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledOnce();
  });
});

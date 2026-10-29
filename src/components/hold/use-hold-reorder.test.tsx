import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useHoldReorder } from "@/components/hold/use-hold-reorder";

const ROW_PX = 50;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(window, "scrollBy").mockImplementation(() => {});
  // jsdom lays nothing out: each item is a 50px row at its place in the list.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const index = [...(this.parentElement?.children ?? [])].indexOf(this);
      return DOMRect.fromRect({
        x: 0,
        y: index * ROW_PX,
        width: 300,
        height: ROW_PX,
      });
    },
  );
});

function List() {
  const [items, setItems] = useState(["a", "b", "c"]);
  const list = useRef<HTMLOListElement>(null);
  const { hold, keys, hint } = useHoldReorder(list, (key, to) =>
    setItems((current) => {
      const next = current.filter((item) => item !== key);
      next.splice(to, 0, key);
      return next;
    }),
  );
  return (
    <>
      <p {...hint} />
      <ol ref={list}>
        {items.map((item) => (
          <li key={item} data-hold-key={item} {...hold(item)}>
            <button type="button" {...keys(item)}>
              {item}
            </button>
          </li>
        ))}
      </ol>
    </>
  );
}

function pointer(target: EventTarget, type: string, y: number) {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientY: y });
  Object.assign(event, { pointerId: 1, pointerType: "touch", isPrimary: true });
  fireEvent(target as Element, event);
}

function order() {
  return screen.getAllByRole("button").map((button) => button.textContent);
}

describe("useHoldReorder", () => {
  it("puts the held item after every other one whose middle it passes", () => {
    render(<List />);

    pointer(screen.getByText("a"), "pointerdown", 100);
    act(() => vi.advanceTimersByTime(350));
    // Below b's middle (75) and c's (125); a's own row is not counted.
    pointer(document, "pointermove", 130);
    expect(order()).toEqual(["b", "c", "a"]);
    pointer(document, "pointermove", 70);
    expect(order()).toEqual(["b", "a", "c"]);
    pointer(document, "pointerup", 70);
    expect(order()).toEqual(["b", "a", "c"]);
  });

  it("puts it back where it was lifted from on Escape", () => {
    render(<List />);

    pointer(screen.getByText("b"), "pointerdown", 100);
    act(() => vi.advanceTimersByTime(350));
    pointer(document, "pointermove", 140);
    expect(order()).toEqual(["a", "c", "b"]);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(order()).toEqual(["a", "b", "c"]);
  });

  it("tells a screen reader the arrow keys move it", () => {
    render(<List />);

    expect(
      screen.getByRole("button", { name: "a" }),
    ).toHaveAccessibleDescription(
      "Arrow up or down moves this one in the list.",
    );
  });
});

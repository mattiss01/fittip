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
      return DOMRect.fromRect({
        x: 0,
        y: placeOf(this) * ROW_PX,
        width: 300,
        height: ROW_PX,
      });
    },
  );
  vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(
    function (this: HTMLElement) {
      return placeOf(this) * ROW_PX;
    },
  );
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(
    ROW_PX,
  );
});

function placeOf(element: HTMLElement) {
  return Math.max(
    0,
    [...(element.parentElement?.children ?? [])].indexOf(element),
  );
}

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
  it("lifts the held item and moves it to the place nearest its own middle", () => {
    render(<List />);
    const a = screen.getByText("a").closest("li");

    // Held 10px below its top edge, so its middle is 15px below the finger.
    pointer(screen.getByText("a"), "pointerdown", 10);
    act(() => vi.advanceTimersByTime(350));
    expect(a).toHaveAttribute("data-hold-lifted");
    // Its middle at 55: nearer b's (75) than its own place's (25).
    pointer(document, "pointermove", 40);
    expect(order()).toEqual(["b", "a", "c"]);
    // At 125, c's place.
    pointer(document, "pointermove", 110);
    expect(order()).toEqual(["b", "c", "a"]);
    // Back over the middle place, and no further: it does not overshoot.
    pointer(document, "pointermove", 60);
    expect(order()).toEqual(["b", "a", "c"]);
    pointer(document, "pointerup", 60);
    expect(order()).toEqual(["b", "a", "c"]);
    expect(a).not.toHaveAttribute("data-hold-lifted");
  });

  it("keeps a short item below a tall one, not swapping back on every move", () => {
    // a is 20px tall, b and c 100px: each sits below the ones before it.
    const height = (element: HTMLElement) =>
      element.dataset.holdKey === "a" ? 20 : 100;
    const top = (element: HTMLElement) =>
      [...(element.parentElement?.children ?? [])]
        .slice(0, placeOf(element))
        .reduce((sum, sibling) => sum + height(sibling as HTMLElement), 0);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(
      function (this: HTMLElement) {
        return height(this);
      },
    );
    vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(
      function (this: HTMLElement) {
        return top(this);
      },
    );
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        return DOMRect.fromRect({
          x: 0,
          y: top(this),
          width: 300,
          height: height(this),
        });
      },
    );
    render(<List />);

    // Held at its middle: a's middle follows the finger. Past 40, b's place
    // (middle 70) is nearer than its own (10).
    pointer(screen.getByText("a"), "pointerdown", 10);
    act(() => vi.advanceTimersByTime(350));
    pointer(document, "pointermove", 45);
    expect(order()).toEqual(["b", "a", "c"]);
    // Now below b, it stays there while it is held over b's old place.
    pointer(document, "pointermove", 46);
    pointer(document, "pointermove", 47);
    expect(order()).toEqual(["b", "a", "c"]);
    pointer(document, "pointermove", 30);
    expect(order()).toEqual(["a", "b", "c"]);
  });

  it("puts it back where it was lifted from on Escape", () => {
    render(<List />);

    pointer(screen.getByText("b"), "pointerdown", 60);
    act(() => vi.advanceTimersByTime(350));
    pointer(document, "pointermove", 110);
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

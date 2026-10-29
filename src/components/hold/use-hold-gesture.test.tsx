import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useHoldGesture, type HoldGesture } from "./use-hold-gesture";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  vi.useFakeTimers();
});

function Holdable({
  gesture,
  onClick,
}: {
  gesture: HoldGesture<string>;
  onClick: () => void;
}) {
  const hold = useHoldGesture(gesture);
  return (
    <div>
      <button type="button" onClick={onClick} {...hold("squat")}>
        Squat
      </button>
      <input aria-label="Name" {...hold("name")} />
    </div>
  );
}

// jsdom has no PointerEvent: a mouse event carries the coordinates.
function pointer(
  target: EventTarget,
  type: string,
  init: { x?: number; y?: number; pointerType?: string } = {},
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    clientX: init.x ?? 0,
    clientY: init.y ?? 0,
  });
  Object.assign(event, {
    pointerId: 1,
    pointerType: init.pointerType ?? "touch",
    isPrimary: true,
  });
  fireEvent(target as Element, event);
}

function setup() {
  const gesture = {
    onLift: vi.fn(),
    onMove: vi.fn(),
    onDrop: vi.fn(),
    onCancel: vi.fn(),
  };
  const onClick = vi.fn();
  render(<Holdable gesture={gesture} onClick={onClick} />);
  return { gesture, onClick, button: screen.getByRole("button") };
}

describe("useHoldGesture", () => {
  it("lifts what a finger rests on, follows it, and drops it where it is let go", () => {
    const { gesture, onClick, button } = setup();

    pointer(button, "pointerdown", { x: 10, y: 10 });
    act(() => vi.advanceTimersByTime(349));
    expect(gesture.onLift).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(gesture.onLift).toHaveBeenCalledWith("squat", 10, 10);

    pointer(document, "pointermove", { x: 10, y: 90 });
    expect(gesture.onMove).toHaveBeenLastCalledWith(10, 90);
    pointer(document, "pointerup");
    expect(gesture.onDrop).toHaveBeenCalledOnce();

    // The click that ends the hold is not a tap on the item.
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("lets a finger that moves before the hold scroll, and a tap stay a tap", () => {
    const { gesture, onClick, button } = setup();

    pointer(button, "pointerdown", { x: 10, y: 10 });
    pointer(document, "pointermove", { x: 10, y: 30 });
    act(() => vi.advanceTimersByTime(1000));
    pointer(document, "pointerup");
    expect(gesture.onLift).not.toHaveBeenCalled();

    pointer(button, "pointerdown", { x: 10, y: 10 });
    pointer(document, "pointerup");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
    expect(gesture.onDrop).not.toHaveBeenCalled();
  });

  it("lifts under a mouse on the first few pixels of a drag", () => {
    const { gesture, button } = setup();

    pointer(button, "pointerdown", { x: 10, y: 10, pointerType: "mouse" });
    pointer(document, "pointermove", { x: 10, y: 15, pointerType: "mouse" });
    expect(gesture.onLift).not.toHaveBeenCalled();
    pointer(document, "pointermove", { x: 10, y: 20, pointerType: "mouse" });
    expect(gesture.onLift).toHaveBeenCalledWith("squat", 10, 20);
  });

  it("puts it back on Escape, and leaves a text field's own press alone", () => {
    const { gesture, button } = setup();

    pointer(button, "pointerdown", { x: 10, y: 10 });
    act(() => vi.advanceTimersByTime(350));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(gesture.onCancel).toHaveBeenCalledOnce();
    pointer(document, "pointerup");
    expect(gesture.onDrop).not.toHaveBeenCalled();

    pointer(screen.getByLabelText("Name"), "pointerdown", { x: 10, y: 10 });
    act(() => vi.advanceTimersByTime(1000));
    expect(gesture.onLift).toHaveBeenCalledOnce();
  });
});

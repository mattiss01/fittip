"use client";

import styles from "./activity-editor.module.css";

/**
 * The drag handle of an ordered activity list, shared by the plan's editor and
 * the log.
 *
 * It is a button rather than a bare icon so it takes focus and answers the
 * arrow keys — a drag nobody can do without a pointer is a reorder some people
 * cannot do at all. The pointer is captured on the handle, and the row it is
 * over is found from the list item the handle sits in, so the caller supplies
 * no refs: only what a move means for its own state.
 */
export function ReorderHandle({
  label,
  className = styles.handle,
  onDragStateChange,
  onMove,
  onMoveTo,
}: {
  /** Read by a screen reader in place of the handle's picture. */
  label: string;
  className?: string;
  onDragStateChange: (dragging: boolean) => void;
  onMove: (delta: number) => void;
  onMoveTo: (index: number) => void;
}) {
  function handlePointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    onDragStateChange(true);

    function moveTo(clientY: number) {
      const list = handle.closest("li")?.parentElement;
      if (!list) return;
      const items = [...list.children] as HTMLElement[];
      for (const [position, item] of items.entries()) {
        const box = item.getBoundingClientRect();
        if (clientY < box.top + box.height / 2) {
          onMoveTo(position);
          return;
        }
      }
      onMoveTo(items.length - 1);
    }

    function onPointerMove(moveEvent: PointerEvent) {
      moveTo(moveEvent.clientY);
    }
    function onPointerUp() {
      onDragStateChange(false);
      handle.removeEventListener("pointermove", onPointerMove);
      handle.removeEventListener("pointerup", onPointerUp);
      handle.removeEventListener("pointercancel", onPointerUp);
    }
    handle.addEventListener("pointermove", onPointerMove);
    handle.addEventListener("pointerup", onPointerUp);
    handle.addEventListener("pointercancel", onPointerUp);
  }

  return (
    <button
      className={className}
      type="button"
      aria-label={label}
      onPointerDown={handlePointerDown}
      onKeyDown={(event) => {
        if (event.key === "ArrowUp") {
          event.preventDefault();
          onMove(-1);
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          onMove(1);
        }
      }}
    >
      <span aria-hidden="true">⠿</span>
    </button>
  );
}

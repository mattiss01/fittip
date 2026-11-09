"use client";

import type { ComponentProps } from "react";

/**
 * A one-line value that wraps to as many lines as it needs, so all of it can
 * be read while editing (owner, 9 Nov 2026: a session's intent showed only its
 * start in a single-line input). It stays one line of text: Enter submits the
 * form, as it did in the input, and a pasted line break becomes a space.
 */
export function LineText({
  style,
  onKeyDown,
  onInput,
  ...props
}: Omit<ComponentProps<"textarea">, "rows">) {
  return (
    <textarea
      {...props}
      rows={1}
      // Inline, so no form's own textarea height makes it a box of lines.
      style={{ minHeight: "3rem", resize: "none", ...style }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.key === "Enter" && !event.defaultPrevented) {
          event.preventDefault();
          event.currentTarget.form?.requestSubmit();
        }
      }}
      onInput={(event) => {
        const field = event.currentTarget;
        if (/[\r\n]/.test(field.value)) {
          field.value = field.value.replace(/[\r\n]+/g, " ");
        }
        onInput?.(event);
      }}
    />
  );
}

/**
 * Whether a status line floats as a toast (owner, 18 Nov 2026): while its
 * change is saving, and once it has landed, but never for a refusal, a
 * conflict, a stall or a lost response, which stay in the page. The value
 * goes on the line's `data-toast`; `globals.css` draws it.
 */
export type Toast = "saving" | "saved";

export function toastOf({
  saving,
  landed,
  text,
}: {
  /** The change is on its way and the line says so. */
  saving: boolean;
  /** The line reports a change that was stored. */
  landed: boolean;
  /** What the line says; an empty line never floats. */
  text: string | null | undefined;
}): Toast | undefined {
  if (!text) return undefined;
  if (saving) return "saving";
  return landed ? "saved" : undefined;
}

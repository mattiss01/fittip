/**
 * Takes the page behind a modal layer out of reach: not scrolled, not tabbed
 * to, not read out. Counted, so layers that open inside each other (a sheet,
 * then the coach wait over it) can close in any order, even in one commit,
 * and the page is given back only when the last one goes. An element that
 * was already inert before any layer is left as it was.
 */
const inertBy = new WeakMap<HTMLElement, number>();
let locks = 0;
let overflow = "";

export function lockPage(layer: Element | null): () => void {
  if (locks === 0) {
    overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  locks += 1;
  const background = Array.from(document.body.children).filter(
    (element): element is HTMLElement =>
      element instanceof HTMLElement &&
      element !== layer &&
      !element.contains(layer) &&
      (inertBy.has(element) || !element.inert),
  );
  for (const element of background) {
    inertBy.set(element, (inertBy.get(element) ?? 0) + 1);
    element.inert = true;
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const element of background) {
      const count = (inertBy.get(element) ?? 1) - 1;
      if (count > 0) {
        inertBy.set(element, count);
      } else {
        inertBy.delete(element);
        element.inert = false;
      }
    }
    locks -= 1;
    if (locks === 0) document.body.style.overflow = overflow;
  };
}

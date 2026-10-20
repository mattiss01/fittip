import { afterEach, describe, expect, it } from "vitest";

import { lockPage } from "./page-lock";

function child(id: string) {
  const element = document.createElement("div");
  element.id = id;
  document.body.appendChild(element);
  return element;
}

afterEach(() => {
  document.body.replaceChildren();
  document.body.style.overflow = "";
});

describe("lockPage", () => {
  it("gives the page back only when the last layer goes, in any order", () => {
    const page = child("page");
    const sheet = child("sheet");
    const releaseSheet = lockPage(sheet);
    const wait = child("wait");
    const releaseWait = lockPage(wait);
    expect(page.inert).toBe(true);
    expect(sheet.inert).toBe(true);

    // The sheet closes first, in the same moment as the wait over it.
    releaseSheet();
    expect(document.body.style.overflow).toBe("hidden");
    expect(page.inert).toBe(true);
    releaseWait();
    expect(document.body.style.overflow).toBe("");
    expect(page.inert).toBe(false);
    expect(sheet.inert).toBe(false);
  });

  it("leaves alone what was inert before any layer", () => {
    const already = child("already");
    already.inert = true;
    const release = lockPage(child("layer"));
    release();
    release();
    expect(already.inert).toBe(true);
  });
});

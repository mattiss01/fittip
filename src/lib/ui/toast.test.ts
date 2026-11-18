import { describe, expect, it } from "vitest";

import { toastOf } from "@/lib/ui/toast";

// Owner, 18 Nov 2026: saving and saved float at the top and a saved one
// fades; anything else stays in its page.
describe("toastOf", () => {
  it("floats a change on its way, and one that landed", () => {
    expect(toastOf({ saving: true, landed: false, text: "Saving…" })).toBe(
      "saving",
    );
    expect(
      toastOf({ saving: false, landed: true, text: "Session added." }),
    ).toBe("saved");
  });

  it("leaves a refusal in the page", () => {
    expect(
      toastOf({ saving: false, landed: false, text: "Check the date." }),
    ).toBeUndefined();
  });

  it("never floats an empty line", () => {
    expect(toastOf({ saving: true, landed: true, text: "" })).toBeUndefined();
    expect(
      toastOf({ saving: false, landed: true, text: null }),
    ).toBeUndefined();
  });
});

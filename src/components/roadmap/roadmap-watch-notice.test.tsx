import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RoadmapWatchNotice } from "./roadmap-watch-notice";

import { ROADMAP_CONTROL_COPY } from "@/lib/roadmap/roadmap-control-copy";

/**
 * What the watchdog is allowed to say, and when it must say nothing.
 *
 * A resource-timing entry proves a response arrived, never what it said, so
 * both wordings are pinned to the approved strings: each reports that the step
 * did not appear, and neither says the write was applied. And silence is the
 * normal case — this notice appearing on a healthy write is the defect round
 * two found.
 */

describe("RoadmapWatchNotice", () => {
  afterEach(cleanup);

  it("says nothing while a write is behaving", () => {
    const { container } = render(
      <RoadmapWatchNotice lostRender={false} recovered={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("explains the reload it is about to do, and claims nothing more", () => {
    render(<RoadmapWatchNotice lostRender recovered={false} />);

    const notice = document.querySelector(
      '[data-roadmap-notice="lost-render"]',
    );
    expect(notice?.textContent).toBe(ROADMAP_CONTROL_COPY.lostRender);
    expect(notice?.getAttribute("role")).toBe("status");
  });

  // Both at once is the reloaded document's own first write. The reload it is
  // in the middle of is the one worth explaining.
  it("prefers the reload it is doing over the one it already did", () => {
    render(<RoadmapWatchNotice lostRender recovered />);

    expect(
      document.querySelector('[data-roadmap-notice="recovered"]'),
    ).toBeNull();
    expect(screen.getByText(ROADMAP_CONTROL_COPY.lostRender)).toBeTruthy();
  });

  it("explains a reload that already happened", () => {
    render(<RoadmapWatchNotice lostRender={false} recovered />);

    const notice = document.querySelector('[data-roadmap-notice="recovered"]');
    expect(notice?.textContent).toBe(ROADMAP_CONTROL_COPY.recoveredReload);
  });
});

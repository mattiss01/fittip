import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { placeWeights, WeightChart } from "./weight-chart";

const ENTRIES = [
  { measuredOn: "2026-10-30", weightKg: 65.4 },
  { measuredOn: "2026-08-28", weightKg: 66.8 },
  { measuredOn: "2026-09-18", weightKg: 66.1 },
];

describe("placeWeights", () => {
  it("puts the oldest left and spaces days by their date", () => {
    const { points } = placeWeights(ENTRIES, "metric");
    expect(points.map((point) => point.measuredOn)).toEqual([
      "2026-08-28",
      "2026-09-18",
      "2026-10-30",
    ]);
    const [first, middle, last] = points;
    // 21 of 63 days in: a third of the way across.
    expect((middle.x - first.x) / (last.x - first.x)).toBeCloseTo(21 / 63);
  });

  it("starts the axis near the lowest weight, never at zero", () => {
    const { min, max, points } = placeWeights(ENTRIES, "metric");
    expect(min).toBeGreaterThan(60);
    expect(min).toBeLessThan(65.4);
    expect(max).toBeGreaterThan(66.8);
    // A heavier day is drawn higher, so lower on the screen's y.
    expect(points[0].y).toBeLessThan(points[2].y);
  });

  it("reads pounds for an owner who uses them", () => {
    const { points } = placeWeights([ENTRIES[0]], "imperial");
    expect(points[0].value).toBe(144.2);
  });
});

describe("WeightChart", () => {
  afterEach(cleanup);

  it("draws nothing without a weight", () => {
    const { container } = render(
      <WeightChart entries={[]} unitsSystem="metric" />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("states the latest weight and names the whole line for a screen reader", () => {
    render(<WeightChart entries={ENTRIES} unitsSystem="metric" />);
    expect(screen.getByText(/^Latest .*65\.4 kg$/)).toBeVisible();
    expect(screen.getByRole("img")).toHaveAccessibleName(
      /^Weight from .*66\.8 kg to .*65\.4 kg, 3 weights$/,
    );
  });

  it("reads out the day a touch is nearest", () => {
    render(<WeightChart entries={ENTRIES} unitsSystem="metric" />);
    const svg = screen.getByRole("img");
    svg.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 340, height: 150 }) as DOMRect;
    // Far left: the oldest day.
    fireEvent.pointerDown(svg, { clientX: 40, clientY: 50 });
    expect(screen.getByText(/66\.8 kg$/)).toBeVisible();
    // A finger lifting leaves the chart; the day it touched stays read out.
    fireEvent.pointerLeave(svg, { pointerType: "touch" });
    expect(screen.getByText(/66\.8 kg$/)).toBeVisible();
    fireEvent.pointerLeave(svg, { pointerType: "mouse" });
    expect(screen.getByText(/^Latest .*65\.4 kg$/)).toBeVisible();
  });
});

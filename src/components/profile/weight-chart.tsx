"use client";

import { useId, useState, type PointerEvent } from "react";

import { formatRoadmapDate } from "@/components/roadmap/roadmap-dates";
import {
  formatWeight,
  kgToPounds,
  type UnitsSystem,
} from "@/lib/profile/body-measures";
import type { WeightEntryView } from "@/lib/profile/profile-contract";
import styles from "./weight-chart.module.css";

const WIDTH = 340;
const HEIGHT = 150;
const PAD = { top: 12, right: 12, bottom: 22, left: 40 } as const;

export type WeightPoint = {
  measuredOn: string;
  weightKg: number;
  /** In the owner's units: what the axis is drawn in. */
  value: number;
  x: number;
  y: number;
};

/**
 * Places the weights on the chart, oldest left: by their day on x, so a gap
 * of weeks reads as one, and on y between the lowest and highest weight with
 * a little room, never from zero, which would flatten every change.
 */
export function placeWeights(
  entries: readonly WeightEntryView[],
  unitsSystem: UnitsSystem,
): { points: WeightPoint[]; min: number; max: number } {
  const ordered = [...entries]
    .sort((a, b) => a.measuredOn.localeCompare(b.measuredOn))
    .map((entry) => ({
      measuredOn: entry.measuredOn,
      weightKg: entry.weightKg,
      value:
        unitsSystem === "metric" ? entry.weightKg : kgToPounds(entry.weightKg),
    }));
  if (ordered.length === 0) return { points: [], min: 0, max: 0 };

  const values = ordered.map((entry) => entry.value);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const room = Math.max(1, (high - low) * 0.15);
  const min = Math.floor(low - room);
  const max = Math.ceil(high + room);

  const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
  const first = day(ordered[0].measuredOn);
  const span = day(ordered[ordered.length - 1].measuredOn) - first;
  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;

  return {
    min,
    max,
    points: ordered.map((entry) => ({
      ...entry,
      // One day alone sits in the middle.
      x:
        PAD.left +
        (span === 0
          ? plotWidth / 2
          : ((day(entry.measuredOn) - first) / span) * plotWidth),
      y: PAD.top + ((max - entry.value) / (max - min)) * plotHeight,
    })),
  };
}

/**
 * The weight over time (owner, 6 Nov 2026): one line, its days as dots, the
 * lowest and highest of the axis and the first and last day. Touching or
 * pointing at it reads the nearest day out. It states the weights and judges
 * none of them; the list below it is the same data as text.
 */
export function WeightChart({
  entries,
  unitsSystem,
}: {
  entries: readonly WeightEntryView[];
  unitsSystem: UnitsSystem;
}) {
  const { points, min, max } = placeWeights(entries, unitsSystem);
  const [active, setActive] = useState<number | null>(null);
  const titleId = useId();
  if (points.length === 0) return null;

  const first = points[0];
  const last = points[points.length - 1];
  const shown = active === null ? null : points[active];
  const describePoint = (point: WeightPoint) =>
    `${formatRoadmapDate(point.measuredOn)}: ${formatWeight(point.weightKg, unitsSystem)}`;

  const nearest = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * WIDTH;
    let best = 0;
    for (let index = 1; index < points.length; index += 1) {
      if (Math.abs(points[index].x - x) < Math.abs(points[best].x - x)) {
        best = index;
      }
    }
    setActive(best);
  };

  return (
    <figure className={styles.figure}>
      <p className={styles.readout} aria-live="polite">
        {shown === null
          ? `Latest ${describePoint(last)}`
          : describePoint(shown)}
      </p>
      <svg
        aria-labelledby={titleId}
        className={styles.chart}
        onPointerDown={nearest}
        // A finger lifting leaves the chart too; the day it touched stays
        // read out until the next touch. A mouse moving off clears it.
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") setActive(null);
        }}
        onPointerMove={nearest}
        role="img"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      >
        <title id={titleId}>
          {points.length === 1
            ? `One weight: ${describePoint(first)}`
            : `Weight from ${describePoint(first)} to ${describePoint(last)}, ${points.length} weights`}
        </title>
        {[max, min].map((value) => {
          const y = value === max ? PAD.top : HEIGHT - PAD.bottom;
          return (
            <g key={value}>
              <line
                className={styles.grid}
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={y}
                y2={y}
              />
              <text className={styles.axis} x={PAD.left - 6} y={y + 4}>
                {value}
              </text>
            </g>
          );
        })}
        <text className={styles.axisStart} x={PAD.left} y={HEIGHT - 4}>
          {formatRoadmapDate(first.measuredOn)}
        </text>
        {points.length > 1 ? (
          <text className={styles.axisEnd} x={WIDTH - PAD.right} y={HEIGHT - 4}>
            {formatRoadmapDate(last.measuredOn)}
          </text>
        ) : null}
        {shown === null ? null : (
          <line
            className={styles.cross}
            x1={shown.x}
            x2={shown.x}
            y1={PAD.top}
            y2={HEIGHT - PAD.bottom}
          />
        )}
        {points.length > 1 ? (
          <polyline
            className={styles.line}
            points={points.map((point) => `${point.x},${point.y}`).join(" ")}
          />
        ) : null}
        {points.map((point, index) => (
          <circle
            className={styles.dot}
            cx={point.x}
            cy={point.y}
            data-active={index === active || undefined}
            key={point.measuredOn}
            r={index === active ? 5 : 4}
          />
        ))}
      </svg>
    </figure>
  );
}

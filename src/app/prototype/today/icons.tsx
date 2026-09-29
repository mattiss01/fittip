/** PROTOTYPE — a handful of inline icons so no icon package is added yet. */

type IconProps = { size?: number; className?: string };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export function TodayIcon({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

export function PlanIcon({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="3" y="4.5" width="18" height="16" rx="3" />
      <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
    </svg>
  );
}

export function ProgressIcon({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M4 20V13M10 20V8M16 20v-5M22 20V4" />
    </svg>
  );
}

export function YouIcon({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </svg>
  );
}

export function CheckIcon({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} strokeWidth={2.6}>
      <path d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} />
    </svg>
  );
}

export function ChevronIcon({
  size = 20,
  className,
  direction = "right",
}: IconProps & { direction?: "left" | "right" | "down" }) {
  const rotate = { right: 0, left: 180, down: 90 }[direction];
  return (
    <svg
      {...base(size)}
      className={className}
      style={{ transform: `rotate(${rotate}deg)` }}
    >
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function FlameIcon({ size = 18, className }: IconProps) {
  return (
    <svg
      {...base(size)}
      className={className}
      fill="currentColor"
      stroke="none"
    >
      <path d="M12 2c.6 3.2 2.4 5 4.2 6.9C18 10.8 19 12.6 19 15a7 7 0 0 1-14 0c0-2.1.9-3.8 2.3-5.1.3 1.6 1 2.7 2.2 3.3C9 9.4 10 5.3 12 2z" />
    </svg>
  );
}

export function MoonIcon({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
    </svg>
  );
}

export const NAV = [
  { label: "Today", Icon: TodayIcon },
  { label: "Plan", Icon: PlanIcon },
  { label: "Progress", Icon: ProgressIcon },
  { label: "You", Icon: YouIcon },
] as const;

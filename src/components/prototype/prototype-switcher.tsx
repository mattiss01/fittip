"use client";

/**
 * PROTOTYPE — floating variant switcher for throwaway design prototypes.
 * Sits at the top on mobile, because the bottom belongs to the app's own nav.
 * Never rendered in a production build.
 */

import { useCallback, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

type Variant = { key: string; name: string };

export function PrototypeSwitcher({
  variants,
  current,
}: {
  variants: Variant[];
  current: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const index = Math.max(
    0,
    variants.findIndex((variant) => variant.key === current),
  );

  const cycle = useCallback(
    (delta: 1 | -1) => {
      const next =
        variants[(index + delta + variants.length) % variants.length];
      router.replace(`${pathname}?variant=${next.key}`, { scroll: false });
    },
    [index, pathname, router, variants],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest("input, textarea, select, [contenteditable='true']")
      ) {
        return;
      }
      if (event.key === "ArrowLeft") cycle(-1);
      if (event.key === "ArrowRight") cycle(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cycle]);

  if (process.env.NODE_ENV === "production") return null;

  const variant = variants[index];
  const buttonStyle = {
    all: "unset",
    display: "grid",
    placeItems: "center",
    width: 36,
    height: 36,
    borderRadius: 999,
    cursor: "pointer",
    fontSize: 18,
  } as const;

  return (
    <div
      style={{
        position: "fixed",
        zIndex: 1000,
        top: "calc(0.5rem + env(safe-area-inset-top))",
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: 4,
        borderRadius: 999,
        background: "#ffe600",
        color: "#000",
        boxShadow: "0 4px 16px rgb(0 0 0 / 0.35)",
        font: "600 13px/1 system-ui, sans-serif",
        whiteSpace: "nowrap",
      }}
      aria-label="Prototype variant switcher"
    >
      <button
        type="button"
        style={buttonStyle}
        onClick={() => cycle(-1)}
        aria-label="Previous variant"
      >
        ‹
      </button>
      <span style={{ padding: "0 6px" }}>
        {variant.key} — {variant.name}
      </span>
      <button
        type="button"
        style={buttonStyle}
        onClick={() => cycle(1)}
        aria-label="Next variant"
      >
        ›
      </button>
    </div>
  );
}

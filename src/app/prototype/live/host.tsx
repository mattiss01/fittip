"use client";

/**
 * PROTOTYPE — keeps one workout across variant switches, so the same session
 * can be looked at in all three.
 */

import { LivePrototype } from "./shared";
import { VariantA } from "./variant-a";
import { VariantB } from "./variant-b";
import { VariantC } from "./variant-c";

export function Host({ variant }: { variant: string }) {
  const Live =
    variant === "B" ? VariantB : variant === "C" ? VariantC : VariantA;
  return <LivePrototype Live={Live} />;
}

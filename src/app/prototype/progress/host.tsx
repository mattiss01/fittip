"use client";

/** PROTOTYPE — picks the variant named in ?variant=. */

import { VariantA, VariantB, VariantC, VariantD, VariantE } from "./variants";
import { VariantF, VariantG } from "./variants-fg";

const COMPONENTS: Record<string, () => React.JSX.Element> = {
  A: VariantA,
  B: VariantB,
  C: VariantC,
  D: VariantD,
  E: VariantE,
  F: VariantF,
  G: VariantG,
};

export function Host({ variant }: { variant: string }) {
  const Component = COMPONENTS[variant] ?? VariantA;
  return <Component />;
}

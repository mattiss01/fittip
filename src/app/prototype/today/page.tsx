/**
 * PROTOTYPE — three visual directions for Today, switchable with ?variant=A|B|C.
 * Sample data only, no account needed, nothing is saved. Throwaway: lives on
 * the prototype/today-design branch and never merges to master.
 */

import { notFound } from "next/navigation";

import { PrototypeSwitcher } from "@/components/prototype/prototype-switcher";
import { VariantA, name as nameA } from "./variant-a";
import { VariantB, name as nameB } from "./variant-b";
import { VariantC, name as nameC } from "./variant-c";

type Props = { searchParams: Promise<{ variant?: string | string[] }> };

const VARIANTS = [
  { key: "A", name: nameA },
  { key: "B", name: nameB },
  { key: "C", name: nameC },
];

export default async function PrototypeTodayPage({ searchParams }: Props) {
  if (process.env.NODE_ENV === "production") notFound();
  const raw = (await searchParams).variant;
  const variant = (Array.isArray(raw) ? raw[0] : raw)?.toUpperCase() ?? "A";

  return (
    <>
      {variant === "B" ? (
        <VariantB />
      ) : variant === "C" ? (
        <VariantC />
      ) : (
        <VariantA />
      )}
      <PrototypeSwitcher variants={VARIANTS} current={variant} />
    </>
  );
}

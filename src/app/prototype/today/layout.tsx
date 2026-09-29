/** PROTOTYPE — fonts for the three Today design variants. */

import type { ReactNode } from "react";
import {
  Archivo,
  Bricolage_Grotesque,
  DM_Mono,
  Hanken_Grotesk,
  Instrument_Sans,
  Schibsted_Grotesk,
} from "next/font/google";

import "./prototype.css";

const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
});
const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
});
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
});
const instrument = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument",
});
const schibsted = Schibsted_Grotesk({
  subsets: ["latin"],
  variable: "--font-schibsted",
});
const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dmmono",
});

export default function PrototypeLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={[
        archivo.variable,
        hanken.variable,
        bricolage.variable,
        instrument.variable,
        schibsted.variable,
        dmMono.variable,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

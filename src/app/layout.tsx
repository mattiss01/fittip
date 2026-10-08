import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Chivo_Mono, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";

const sans = Schibsted_Grotesk({
  subsets: ["latin", "latin-ext"],
  variable: "--font-schibsted",
  display: "swap",
});

// Chivo Mono, not DM Mono (owner, 5 and 8 Oct 2026): DM Mono draws 0 with a
// line through it and has no other zero to switch to. This one is as wide
// and draws a plain 0.
const mono = Chivo_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
  variable: "--font-mono-face",
  display: "swap",
});

export const metadata: Metadata = {
  title: "FitTip",
  description: "FitTip application foundation",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}

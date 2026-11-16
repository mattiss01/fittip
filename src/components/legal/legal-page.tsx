import Link from "next/link";
import { Logo } from "@/components/brand/logo";

import type { LegalDocument } from "@/lib/legal";
import styles from "./legal.module.css";

/** Where a reader came from: Settings, or (by default) sign-in. */
export type LegalReturn = "settings" | "sign-in";

const RETURNS: Record<LegalReturn, { href: string; label: string }> = {
  "sign-in": { href: "/", label: "Sign in" },
  settings: { href: "/home/you/settings", label: "Settings" },
};

/**
 * The privacy notice or the terms, readable without signing in, so they can
 * be linked from sign-in and opened beside the step that accepts them. The
 * way back goes to sign-in, or to Settings when opened from there (owner,
 * 15 Nov 2026).
 */
export function LegalPage({
  document,
  from = "sign-in",
}: {
  document: LegalDocument;
  from?: LegalReturn;
}) {
  const back = RETURNS[from];
  return (
    <main className={styles.page} id="main-content">
      <article className={styles.card}>
        <Link
          aria-label={`Back to ${back.label}`}
          className={styles.back}
          href={back.href}
          data-back-link
        >
          <span aria-hidden="true">‹</span> {back.label}
        </Link>
        <Logo />
        <h1 className={styles.title}>{document.title}</h1>
        <p className={styles.updated}>Last changed {document.updated}</p>
        {/* The first layer: what someone reading only this must know. */}
        <section aria-labelledby="in-short" className={styles.summary}>
          <h2 id="in-short">In short</h2>
          <ul>
            {document.summary.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
        <nav aria-label="Contents" className={styles.contents}>
          <h2>Contents</h2>
          <ol>
            {document.sections.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`}>{section.heading}</a>
              </li>
            ))}
          </ol>
        </nav>
        {document.sections.map((section) => (
          <section
            key={section.id}
            id={section.id}
            className={styles.section}
            aria-labelledby={`${section.id}-heading`}
          >
            <h2 id={`${section.id}-heading`}>{section.heading}</h2>
            <p className={styles.lead}>{section.lead}</p>
            {section.items ? (
              <dl className={styles.items}>
                {section.items.map((item) => (
                  <div key={item.label}>
                    <dt>{item.label}</dt>
                    {item.lines.map((line) => (
                      <dd key={line}>{line}</dd>
                    ))}
                  </div>
                ))}
              </dl>
            ) : null}
            {(section.paragraphs ?? []).map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>
        ))}
      </article>
    </main>
  );
}

/**
 * The two documents, side by side, wherever they are offered: in a card, or
 * quietly at the foot of the sign-in screen.
 */
export function LegalLinks({
  newTab = false,
  variant = "inline",
}: {
  newTab?: boolean;
  variant?: "inline" | "footer";
}) {
  const target = newTab
    ? ({ target: "_blank", rel: "noopener noreferrer" } as const)
    : {};
  return (
    <nav
      aria-label="Privacy and terms"
      className={variant === "footer" ? styles.footer : styles.links}
    >
      <Link href="/privacy" {...target}>
        Privacy notice
      </Link>
      <Link href="/terms" {...target}>
        Terms
      </Link>
    </nav>
  );
}

/** Reads `?from=` on a legal page; anything else goes back to sign-in. */
export function readLegalReturn(value: unknown): LegalReturn {
  return value === "settings" ? "settings" : "sign-in";
}

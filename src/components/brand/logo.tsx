import { Fredoka } from "next/font/google";

import styles from "./logo.module.css";

// The wordmark's own face, served from FitTip like the app's other fonts.
const fredoka = Fredoka({
  subsets: ["latin"],
  weight: "600",
  display: "swap",
});

/**
 * FitTip's wordmark: "fit" over "tip", the second in the accent (owner, 15
 * Nov 2026: H7 from the "FitTip logo ideas" canvas of 19 Oct 2026). Read
 * aloud as one word.
 */
export function Logo({
  size = "medium",
}: {
  size?: "medium" | "small" | "mini";
}) {
  return (
    <p
      aria-label="FitTip"
      className={`${fredoka.className} ${styles.logo} ${styles[size]}`}
      role="img"
    >
      <span aria-hidden="true">fit</span>
      <span aria-hidden="true" className={styles.tip}>
        tip
      </span>
    </p>
  );
}

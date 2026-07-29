import type { ReactNode } from "react";

import { ConnectionNotice } from "@/components/home/connection-notice";
import { MobileNavigation } from "@/components/home/mobile-navigation";
import styles from "./home.module.css";

export const dynamic = "force-dynamic";

export default function HomeLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.appShell}>
      <a className={styles.skipLink} href="#main-content">
        Skip to content
      </a>
      <ConnectionNotice />
      {children}
      <MobileNavigation />
    </div>
  );
}

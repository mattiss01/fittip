"use client";

import { useSyncExternalStore } from "react";

import styles from "@/app/home/home.module.css";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getSnapshot() {
  return navigator.onLine;
}

export function ConnectionNotice() {
  const online = useSyncExternalStore(subscribe, getSnapshot, () => true);
  if (online) return null;

  return (
    <p className={styles.offlineNotice} role="status">
      Offline. Visible records may be stale; reconnect before saving or
      refreshing.
    </p>
  );
}

"use client";

import { useSyncExternalStore } from "react";

import { isoDateInTimezone } from "@/features/completions/local-date";

export function BrowserLocalDate() {
  const label = useSyncExternalStore(
    subscribe,
    getBrowserSnapshot,
    () => "Your browser-local date",
  );
  return <span>{label}</span>;
}

function subscribe(callback: () => void) {
  window.addEventListener("focus", callback);
  document.addEventListener("visibilitychange", callback);
  const interval = window.setInterval(callback, 60_000);
  return () => {
    window.removeEventListener("focus", callback);
    document.removeEventListener("visibilitychange", callback);
    window.clearInterval(interval);
  };
}

function getBrowserSnapshot() {
  const timezoneName =
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  const localDate = isoDateInTimezone(new Date(), timezoneName);
  return `${formatLocalDate(localDate)} · ${timezoneName}`;
}

function formatLocalDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00.000Z`));
}

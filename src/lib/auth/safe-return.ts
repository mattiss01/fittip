const UUID =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const PROGRESS_DETAIL = new RegExp(
  `^/home/progress/(?:plan|completion)-${UUID}$`,
  "i",
);
const SIMPLE_DESTINATIONS = new Set([
  "/home/today",
  "/home/plan",
  "/home/progress",
  "/home/you",
]);

export function safeAuthReturn(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 300 ||
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return "/home/today";
  }

  const parsed = new URL(value, "https://fittip.invalid");
  if (
    parsed.origin !== "https://fittip.invalid" ||
    parsed.hash ||
    parsed.username ||
    parsed.password
  ) {
    return "/home/today";
  }

  if (SIMPLE_DESTINATIONS.has(parsed.pathname) && !parsed.search) {
    return parsed.pathname;
  }
  if (PROGRESS_DETAIL.test(parsed.pathname) && !parsed.search) {
    return parsed.pathname;
  }
  if (parsed.pathname !== "/home/log") return "/home/today";

  const keys = [...parsed.searchParams.keys()];
  if (
    keys.length !== 1 ||
    !["plannedSession", "completion"].includes(keys[0]) ||
    !new RegExp(`^${UUID}$`, "i").test(parsed.searchParams.get(keys[0]) ?? "")
  ) {
    return "/home/today";
  }
  return `${parsed.pathname}?${parsed.searchParams.toString()}`;
}

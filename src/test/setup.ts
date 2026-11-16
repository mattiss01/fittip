import "@testing-library/jest-dom/vitest";

import { vi } from "vitest";

vi.mock("server-only", () => ({}));

// `next/font` is compiled by Next.js, not Vitest: each face is a function only
// at build time. Components that load one (the wordmark) get a class name.
vi.mock("next/font/google", () => {
  const face = () => ({ className: "font", variable: "font", style: {} });
  return { Fredoka: face, Schibsted_Grotesk: face, Chivo_Mono: face };
});

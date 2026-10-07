import { describe, expect, it } from "vitest";

import {
  TypeGenerationError,
  cleanGeneratedTypes,
} from "./generate-database-types.mjs";

describe("cleanGeneratedTypes", () => {
  it("keeps generated types as they were printed, with one final newline", () => {
    expect(cleanGeneratedTypes("export type Database = {};\r\n\r\n")).toBe(
      "export type Database = {};\n",
    );
  });

  it("drops the telemetry error line the CLI can append to stdout", () => {
    const noise =
      '{"_tag":"Error","error":{"message":"Failed to flush PostHog."}}';
    expect(cleanGeneratedTypes(`export type Database = {};\n${noise}\n`)).toBe(
      "export type Database = {};\n",
    );
  });

  it("refuses output that is not the generated types", () => {
    expect(() => cleanGeneratedTypes("")).toThrow(TypeGenerationError);
    expect(() => cleanGeneratedTypes("failed to connect to postgres")).toThrow(
      TypeGenerationError,
    );
  });
});

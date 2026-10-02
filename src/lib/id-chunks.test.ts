import { describe, expect, it } from "vitest";

import { ID_CHUNK_SIZE, idChunks } from "@/lib/id-chunks";

describe("idChunks", () => {
  it("returns no chunk for no ids, so a caller makes no request", () => {
    expect(idChunks([])).toEqual([]);
  });

  it("keeps a list that fits as one chunk", () => {
    const ids = Array.from({ length: ID_CHUNK_SIZE }, (_, index) => `${index}`);
    expect(idChunks(ids)).toEqual([ids]);
  });

  it("splits a longer list in order and loses nothing", () => {
    const ids = Array.from({ length: 273 }, (_, index) => `${index}`);
    const chunks = idChunks(ids);

    expect(chunks.map((chunk) => chunk.length)).toEqual([100, 100, 73]);
    expect(chunks.flat()).toEqual(ids);
  });
});

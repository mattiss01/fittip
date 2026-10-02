/**
 * The most ids one `.in(...)` filter carries. An id is 36 characters and a
 * comma, and the filter travels in the request line, so a hundred is under
 * four kilobytes: well inside what the gateway accepts, whatever else the
 * query adds.
 */
export const ID_CHUNK_SIZE = 100;

/** Splits a list of ids into runs of at most `ID_CHUNK_SIZE`, in order. */
export function idChunks(ids: readonly string[]): string[][] {
  const chunks: string[][] = [];
  for (let start = 0; start < ids.length; start += ID_CHUNK_SIZE) {
    chunks.push(ids.slice(start, start + ID_CHUNK_SIZE));
  }
  return chunks;
}

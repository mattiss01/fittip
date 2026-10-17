/**
 * A stable RFC-4122-shaped id from a seed string.
 *
 * It needs to be deterministic and well distributed across the seeds one owner
 * produces in one review, not unguessable: the key is scoped to the owner's own
 * rows by `auth.uid()`, and a collision between two owners is meaningless
 * because the uniqueness constraint is per user.
 *
 * Every word is taken unsigned before it is printed. `h1 ^ h2` is a signed
 * 32-bit result in JavaScript, and a negative one printed as "-…" put a minus
 * inside the key whenever it was also small: about one review in 330 could
 * not be finished, and retrying the same choices kept failing (17 Oct 2026).
 */
export function uuidFromSeed(seed: string): string {
  let h1 = 0x9e3779b9;
  let h2 = 0x85ebca6b;
  for (let index = 0; index < seed.length; index += 1) {
    const code = seed.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (code + index), 0x85ebca6b) >>> 0;
  }
  const hex = (value: number) => (value >>> 0).toString(16).padStart(8, "0");
  const digits = `${hex(h1)}${hex(h2)}${hex(h1 ^ h2)}${hex(h1 + h2)}`;
  return [
    digits.slice(0, 8),
    digits.slice(8, 12),
    `4${digits.slice(13, 16)}`,
    `8${digits.slice(17, 20)}`,
    digits.slice(20, 32),
  ].join("-");
}

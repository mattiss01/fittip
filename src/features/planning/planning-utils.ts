let nextClientId = 0;

export function createClientId(prefix: string) {
  nextClientId += 1;
  return `${prefix}-${Date.now()}-${nextClientId}`;
}

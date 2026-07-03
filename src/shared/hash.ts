export function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function hashHex(input: string): string {
  return fnv1a(input).toString(16).padStart(8, "0");
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function stableNumber(seed: string, minInclusive: number, maxExclusive: number): number {
  const random = mulberry32(fnv1a(seed));
  return minInclusive + random() * (maxExclusive - minInclusive);
}

export function stableIndex(seed: string, length: number): number {
  if (length <= 0) {
    return 0;
  }
  return fnv1a(seed) % length;
}

export function stableSeed(siteKey: string, profileId: string, purpose = "default"): string {
  return hashHex(`${siteKey}:${profileId}:${purpose}`);
}

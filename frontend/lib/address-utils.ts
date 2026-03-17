export function sameAddress(a?: string, b?: string) {
  if (!a || !b) return false;
  try {
    return BigInt(a) === BigInt(b);
  } catch {
    return a.toLowerCase() === b.toLowerCase();
  }
}

export function normalizeAddress(address?: string) {
  if (!address) return "";
  return address.startsWith("0x") ? address : `0x${address}`;
}

export function padAddress(address?: string) {
  const normalized = normalizeAddress(address).toLowerCase();
  if (!normalized) return "";
  const hex = normalized.startsWith("0x") ? normalized.slice(2) : normalized;
  return `0x${hex.padStart(64, "0")}`;
}

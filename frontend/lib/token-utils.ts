const BIGINT_TEN = BigInt(10);
const BIGINT_ZERO = BigInt(0);
const BIGINT_ONE = BigInt(1);

function pow10(decimals: number) {
  let result = BIGINT_ONE;
  for (let i = 0; i < decimals; i += 1) {
    result *= BIGINT_TEN;
  }
  return result;
}

export function parseUnits(value: string, decimals: number): bigint {
  const [whole, fraction = ""] = value.split(".");
  const sanitizedWhole = whole.trim() === "" ? "0" : whole;
  const fractionPadded = (fraction + "0".repeat(decimals)).slice(0, decimals);
  const wholePart = BigInt(sanitizedWhole || "0");
  const fractionPart = BigInt(fractionPadded || "0");
  return wholePart * pow10(decimals) + fractionPart;
}

export function formatUnits(value: bigint, decimals: number) {
  const divisor = pow10(decimals);
  const whole = value / divisor;
  const fraction = value % divisor;
  if (fraction === BIGINT_ZERO) return whole.toString();
  const fractionStr = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole.toString()}.${fractionStr}`;
}

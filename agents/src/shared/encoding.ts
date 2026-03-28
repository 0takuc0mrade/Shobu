import { shortString } from 'starknet'

export function encodeShortString(value: string, label: string): string {
  try {
    return shortString.encodeShortString(value)
  } catch (err: any) {
    const msg = err?.message ?? String(err)
    throw new Error(`Failed to encode ${label} as short string: ${msg}`)
  }
}

export function decodeShortString(value: string, label: string): string {
  try {
    return shortString.decodeShortString(value)
  } catch (err: any) {
    const msg = err?.message ?? String(err)
    throw new Error(`Failed to decode ${label} from short string: ${msg}`)
  }
}

export function encodeFeltSpan(values: string[]): string[] {
  return [values.length.toString(), ...values.map((v) => String(v))]
}

// Round an hour-meter value to hundredths (0.00) so totals never accumulate
// long floating-point tails from repeated increments.
export function round2(value: number): number {
  return Math.round(value * 100) / 100
}

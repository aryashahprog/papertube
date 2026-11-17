export function tourPosition(value: string | null, length: number) {
  const position = Number(value);
  if (!Number.isSafeInteger(position) || position < 1) return 0;
  return Math.max(0, Math.min(position - 1, length - 1));
}

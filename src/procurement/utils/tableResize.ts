/** Move an internal divider without moving either outer table edge. */
export const resizeAdjacentColumns = (
  widths: readonly number[], minimums: readonly number[], index: number, delta: number,
): number[] => {
  const next = [...widths];
  if (index < 0 || index >= widths.length - 1 || !Number.isFinite(delta)) return next;
  const movement = Math.max(minimums[index] - widths[index],
    Math.min(delta, widths[index + 1] - minimums[index + 1]));
  next[index] += movement;
  next[index + 1] -= movement;
  return next;
};

/** Calcula uma data estimada; não constitui orientação médica. */
export function estimateNextPeriod(
  lastStart: string,
  cycleDays: number
): string | null {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(lastStart) ||
    !Number.isInteger(cycleDays) ||
    cycleDays < 20 ||
    cycleDays > 45
  ) {
    return null;
  }

  const [year, month, day] = lastStart.split("-").map(Number);

  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  date.setUTCDate(date.getUTCDate() + cycleDays);

  return date.toISOString().slice(0, 10);
}
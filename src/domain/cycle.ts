/** Calcula uma data estimada; não constitui orientação médica. */
export function estimateNextPeriod(lastStart: string, cycleDays: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lastStart) || !Number.isFinite(cycleDays) || cycleDays < 20 || cycleDays > 45) return null;
  const date = new Date(`${lastStart}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + cycleDays);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

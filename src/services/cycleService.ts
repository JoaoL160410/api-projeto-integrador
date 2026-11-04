import { estimateNextPeriod as estimateNextPeriodFromDomain } from "../domain/cycle";

export function estimateNextPeriod(
  lastStart: Date,
  cycleLengthDays = 28
): Date {
  if (Number.isNaN(lastStart.getTime())) {
    return new Date(Number.NaN);
  }

  const year = lastStart.getFullYear();
  const month = String(lastStart.getMonth() + 1).padStart(2, "0");
  const day = String(lastStart.getDate()).padStart(2, "0");

  const dateString = `${year}-${month}-${day}`;

  const estimatedDate = estimateNextPeriodFromDomain(
    dateString,
    cycleLengthDays
  );

  if (!estimatedDate) {
    return new Date(Number.NaN);
  }

  return new Date(`${estimatedDate}T00:00:00.000Z`);
}
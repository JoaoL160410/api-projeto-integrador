export function estimateNextPeriod(lastStart: Date, cycleLengthDays = 28): Date { const next = new Date(lastStart); next.setDate(next.getDate() + cycleLengthDays); return next; }

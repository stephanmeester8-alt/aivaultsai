/**
 * Prospect Acquisition Pipeline — werkdagentelling (pure, testbaar).
 *
 * Regel: een follow-up mag pas NA minimaal twee VOLLEDIGE werkdagen worden
 * voorbereid (ma-vr; Nederlandse feestdagen worden in v1 niet meegerekend —
 * dat is een bewuste, documenteerbare vereenvoudiging).
 */

export const MIN_FOLLOW_UP_FULL_WORKDAYS = 2;

/** Ma-vr = werkdag (UTC-datumdelen; tijden doen er niet toe). */
export function isWorkday(date: Date): boolean {
  const day = date.getUTCDay();
  return day >= 1 && day <= 5;
}

/** Aantal volledige werkdagen dat volledig tussen start (excl.) en end (incl.) ligt. */
export function fullWorkdaysBetween(start: Date, end: Date): number {
  if (end.getTime() <= start.getTime()) return 0;

  const dayMs = 86_400_000;
  const startDay = Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth(),
    start.getUTCDate(),
  );
  const endDay = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());

  // Volledige dagen na de startdag (startdag telt niet mee: "volledig").
  const firstCandidate = new Date(startDay + dayMs);
  const lastDay = new Date(endDay);

  let count = 0;
  const cursor = new Date(firstCandidate);
  while (cursor.getTime() <= lastDay.getTime()) {
    if (isWorkday(cursor)) count += 1;
    cursor.setTime(cursor.getTime() + dayMs);
  }
  return count;
}

/** Is de minimale wachttijd (2 volledige werkdagen) verstreken? */
export function followUpMinWaitElapsed(
  firstEmailSentAt: Date | string,
  now: Date,
): boolean {
  const start =
    typeof firstEmailSentAt === "string"
      ? new Date(firstEmailSentAt)
      : firstEmailSentAt;
  if (Number.isNaN(start.getTime())) return false;
  return fullWorkdaysBetween(start, now) >= MIN_FOLLOW_UP_FULL_WORKDAYS;
}

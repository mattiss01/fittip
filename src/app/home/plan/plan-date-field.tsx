import { DateField } from "@/components/date-field/date-field";

/** The owner-local dates a single session may be placed on, inclusive. */
export type PlanDateRange = { first: string; last: string };

/**
 * The date a single session is placed on (R3b-3). Typed, or picked from the
 * calendar beside it (owner, 5 Oct 2026), as a goal's target date is. `min`
 * and `max` bound the calendar as a convenience; the action reads the same
 * bounds again from the stored zone, and is what refuses a typed date
 * outside them.
 *
 * The value it opens on is always allowed by the calendar, even on a page
 * left open past midnight whose session is now a day behind.
 */
export function PlanDateInput({
  label,
  range,
  defaultValue,
}: {
  label: string;
  range: PlanDateRange;
  defaultValue: string;
}) {
  return (
    <DateField
      calendar
      initial={defaultValue}
      label={label}
      max={range.last}
      min={defaultValue < range.first ? defaultValue : range.first}
      name="localDate"
      required
    />
  );
}

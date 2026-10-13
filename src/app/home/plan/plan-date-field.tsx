import { DateField } from "@/components/date-field/date-field";

/** The owner-local dates a single session may be placed on, inclusive. */
export type PlanDateRange = { first: string; last: string };

/**
 * The date a single session is placed on (R3b-3): one date field, as a
 * goal's target date is. `min` and `max` hold it in the browser as a
 * convenience; the action reads the same bounds again from the stored zone,
 * and is what decides.
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
      initial={defaultValue}
      label={label}
      max={range.last}
      min={defaultValue < range.first ? defaultValue : range.first}
      name="localDate"
      required
    />
  );
}

/** The owner-local dates a single session may be placed on, inclusive. */
export type PlanDateRange = { first: string; last: string };

/**
 * The date a single session is placed on (R3b-3). A date field rather than a
 * list of every day: the range is six months, and the browser's own picker
 * reaches a day in it faster than a list of 181 would. `min` and `max` are a
 * convenience; the action reads the same bounds again from the stored zone.
 */
export function PlanDateInput({
  id,
  range,
  defaultValue,
}: {
  id: string;
  range: PlanDateRange;
  defaultValue: string;
}) {
  return (
    <input
      id={id}
      type="date"
      name="localDate"
      min={range.first}
      max={range.last}
      defaultValue={defaultValue}
      required
    />
  );
}

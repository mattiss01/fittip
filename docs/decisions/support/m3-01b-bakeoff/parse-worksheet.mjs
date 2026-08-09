/**
 * Reads WORKSHEET.md into structured slots.
 *
 * Split out of `worksheet.mjs` so the scorer and the reader see exactly the
 * same parse. Two parsers over one file is two ways to disagree about what the
 * product owner actually pasted.
 */

export function extractSlots(text) {
  const pattern =
    /<!--\s*BEGIN slot=(\w+) scenario=([\w-]+) op=(create_roadmap|create_seven_day_plan)\s*-->([\s\S]*?)<!--\s*END\s*-->/g;
  const slots = [];
  let match;
  while ((match = pattern.exec(text)) !== null) {
    slots.push({
      slot: match[1],
      scenario: match[2],
      operation: match[3],
      body: match[4].trim(),
    });
  }
  return slots;
}

/** The label table, so output names models rather than letters. */
export function extractLabels(text) {
  const labels = {};
  const section = text.split("**Record what you actually used:**")[1] ?? "";
  for (const row of section.split("\n").slice(0, 12)) {
    const match = row.match(/^\|\s*([ABC])\s*\|\s*(.*?)\s*\|\s*$/);
    if (match && match[2] && !/^-+$/.test(match[2]))
      labels[match[1]] = match[2];
  }
  return labels;
}

export function extractNotes(text) {
  const match = text.match(
    /<!--\s*BEGIN notes\s*-->([\s\S]*?)<!--\s*END notes\s*-->/,
  );
  return match ? match[1].trim() : "";
}

/** Tolerate a fence, a "json" tag, and stray prose on either side. */
export function parseJson(raw) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : raw).trim();
  if (!candidate) return { parsed: null, error: "slot is empty" };
  try {
    return { parsed: JSON.parse(candidate), error: null };
  } catch {
    const first = candidate.indexOf("{");
    const last = candidate.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return {
          parsed: JSON.parse(candidate.slice(first, last + 1)),
          error: null,
        };
      } catch (error) {
        return { parsed: null, error: `not valid JSON — ${error.message}` };
      }
    }
    return {
      parsed: null,
      error:
        "no JSON object found — if the model replied with prose or a clarifying question, that is itself the result",
    };
  }
}

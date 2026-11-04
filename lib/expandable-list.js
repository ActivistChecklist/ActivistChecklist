/**
 * How many items an <ExpandableList> shows before "Show N more". MDX attribute
 * values are strings (`show="2"`): blank or invalid means 1, and "0" hides all.
 * Shared by the component and its Keystatic preview so both say the same count.
 */
export function parseShowCount(show) {
  const parsed = Number.parseInt(show, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1;
}

/**
 * Task names are free text, so "Chicken tending" and "chicken Tending" are the
 * same job typed twice. Everything that groups or matches tasks goes through
 * this key so the totals, the duplicate check, and the per-task list agree.
 */
export function taskKey(task: string): string {
  return task.trim().toLowerCase();
}

/** Common farm tasks, offered as suggestions but never enforced. */
export const DEFAULT_TASKS = [
  "Livestock chores",
  "Fencing",
  "Irrigation",
  "Planting",
  "Harvest",
  "Equipment maintenance",
  "Pasture management",
  "Compost & soil",
  "Marketing & sales",
  "Recordkeeping",
];

/**
 * Suggestions for the task field: what this person has typed before, most
 * recent first, then any stock task they have not used yet.
 */
export function taskSuggestions(previous: string[]): string[] {
  const seen = new Set(previous.map(taskKey));
  return [...previous, ...DEFAULT_TASKS.filter((task) => !seen.has(taskKey(task)))];
}

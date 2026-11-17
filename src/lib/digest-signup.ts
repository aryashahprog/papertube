import { normalizeQuery } from "./follows";

export function digestTopics(follows: readonly { q: string }[]): string {
  return [...new Set(follows.map(follow => normalizeQuery(follow.q)).filter(Boolean))].sort().join("|") || "featured";
}

export interface Follow {
  q: string;
  label: string;
  followedAt: string;
  lastSeenAt: string;
  seenIds: string[];
}
type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
export const normalizeQuery = (q: string) => q.trim().replace(/\s+/g, " ").toLowerCase();
export function readFollows(storage: Storage): Follow[] {
  try {
    const value = JSON.parse(storage.getItem("pt-follows") || "[]");
    if (!Array.isArray(value)) return [];
    const queries = new Set<string>();
    return value.filter((f): f is Follow => {
      if (!f || typeof f.q !== "string" || !normalizeQuery(f.q) ||
        typeof f.label !== "string" || !Number.isFinite(Date.parse(f.followedAt)) ||
        !Number.isFinite(Date.parse(f.lastSeenAt)) || !Array.isArray(f.seenIds) ||
        !f.seenIds.every((id: unknown) => typeof id === "string")) return false;
      f.q = normalizeQuery(f.q);
      if (queries.has(f.q)) return false;
      queries.add(f.q);
      return true;
    });
  } catch { return []; }
}
export function writeFollows(storage: Storage, follows: Follow[]): boolean {
  try {
    storage.setItem("pt-follows", JSON.stringify(follows));
    return true;
  } catch { return false; }
}
export function newPaperIds(ids: string[], seenIds: string[]): string[] {
  const seen = new Set(seenIds);
  return [...new Set(ids)].filter((id) => !seen.has(id));
}
export function relativeDate(date: string): string {
  const days = Math.max(0, Math.floor((Date.now() - Date.parse(date)) / 86400000));
  return days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}
export async function countNewPapers(follow: Follow): Promise<number> {
  const date = follow.lastSeenAt.slice(0, 10);
  const cacheKey = `pt-count:${follow.q}:${follow.lastSeenAt}`;
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached !== null && Number.isFinite(JSON.parse(cached))) return JSON.parse(cached);
  } catch {}
  async function request(url: string) {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error("Index unavailable");
    return response.json();
  }
  const params = { mailto: "papertube@users.noreply.github.com" };
  let count: number;
  try {
    const data = await request("https://api.openalex.org/works?" + new URLSearchParams({
      ...params, search: follow.q, filter: `from_publication_date:${date}`, "per-page": "1",
    }));
    count = data.meta?.count;
    if (!Number.isFinite(count)) throw new Error("Invalid count");
  } catch {
    const data = await request("https://api.crossref.org/works?" + new URLSearchParams({
      ...params, query: follow.q, filter: `from-pub-date:${date}`, rows: "0",
    }));
    count = data.message?.["total-results"];
    if (!Number.isFinite(count)) throw new Error("Invalid count");
  }
  try { sessionStorage.setItem(cacheKey, JSON.stringify(count)); } catch {}
  return count;
}

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
export interface RecentPaper { id: string; title: string; year: number; url: string }
const countKey = (follow: Follow) => `pt-count:${follow.q}:${follow.lastSeenAt}`;
export function markTopicVisited(previous: Follow, updated: Follow) {
  try {
    sessionStorage.removeItem(countKey(previous));
    sessionStorage.removeItem(countKey(previous) + ":source");
    sessionStorage.setItem(countKey(updated), "0");
  } catch {}
}
async function recentWorks(follow: Follow, items: boolean): Promise<{ count: number; papers: RecentPaper[] }> {
  const date = follow.lastSeenAt.slice(0, 10);
  async function request(url: string) {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error("Index unavailable");
    return response.json();
  }
  const params = { mailto: "papertube@users.noreply.github.com" };
  let source: string | null = null;
  try { source = sessionStorage.getItem(countKey(follow) + ":source"); } catch {}
  try {
    if (items && source === "Crossref") throw new Error("Use counted source");
    const data = await request("https://api.openalex.org/works?" + new URLSearchParams({
      ...params, search: follow.q, filter: `from_publication_date:${date}`, "per-page": items ? "8" : "1", sort: "cited_by_count:desc",
    }));
    const count = data.meta?.count;
    if (!Number.isFinite(count)) throw new Error("Invalid count");
    if (items && !Array.isArray(data.results)) throw new Error("Invalid works");
    try { sessionStorage.setItem(countKey(follow) + ":source", "OpenAlex"); } catch {}
    return { count, papers: items ? data.results.map((w: any) => ({
      id: w.id, title: w.title, year: w.publication_year,
      url: w.doi || w.primary_location?.landing_page_url || w.id,
    })) : [] };
  } catch {
    const data = await request("https://api.crossref.org/works?" + new URLSearchParams({
      ...params, query: follow.q, filter: `from-pub-date:${date}`, rows: items ? "8" : "0", sort: "is-referenced-by-count", order: "desc",
    }));
    const count = data.message?.["total-results"];
    if (!Number.isFinite(count)) throw new Error("Invalid count");
    if (items && !Array.isArray(data.message.items)) throw new Error("Invalid works");
    try { sessionStorage.setItem(countKey(follow) + ":source", "Crossref"); } catch {}
    return { count, papers: items ? data.message.items.map((w: any) => ({
      id: "https://doi.org/" + w.DOI, title: w.title?.[0] || w.DOI,
      year: w.published?.["date-parts"]?.[0]?.[0] || 0,
      url: w.DOI ? "https://doi.org/" + w.DOI : w.URL,
    })) : [] };
  }
}
export async function countNewPapers(follow: Follow): Promise<number> {
  try {
    const cached = sessionStorage.getItem(countKey(follow));
    if (cached !== null && Number.isFinite(JSON.parse(cached))) return JSON.parse(cached);
  } catch {}
  const { count } = await recentWorks(follow, false);
  try { sessionStorage.setItem(countKey(follow), JSON.stringify(count)); } catch {}
  return count;
}
export async function recentPapers(follow: Follow): Promise<RecentPaper[]> {
  try { if (sessionStorage.getItem(countKey(follow)) === "0") return []; } catch {}
  return (await recentWorks(follow, true)).papers;
}

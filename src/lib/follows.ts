export interface Follow {
  q: string;
  label: string;
  followedAt: string;
  lastSeenAt: string;
  seenIds: string[];
  seenPapers?: { id: string; date: string }[];
}
type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
export function safeStorage(kind: "localStorage" | "sessionStorage", host = globalThis) {
  return {
    getItem(key: string): string | null {
      try { return host[kind].getItem(key); } catch { return null; }
    },
    setItem(key: string, value: string) { host[kind].setItem(key, value); },
    removeItem(key: string) { try { host[kind].removeItem(key); } catch {} },
  };
}
export const followsStorage = safeStorage("localStorage");
export const cacheStorage = safeStorage("sessionStorage");
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
      if (!Array.isArray(f.seenPapers) || !f.seenPapers.every((p: any) => typeof p?.id === "string" && typeof p.date === "string")) delete f.seenPapers;
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
export function relativeDate(date: string): string {
  const days = Math.max(0, Math.floor((Date.now() - Date.parse(date)) / 86400000));
  return days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}
export interface RecentPaper { id: string; title: string; year: number; url: string; date?: string }
export function comparisonDate(date: string): string {
  if (/^\d{4}$/.test(date)) return date + "-12-31";
  if (/^\d{4}-\d{2}$/.test(date)) {
    const [year, month] = date.split("-").map(Number);
    return `${date}-${new Date(Date.UTC(year, month, 0)).getUTCDate()}`;
  }
  return date;
}
export function cleanRecentPapers(papers: RecentPaper[], from: string, until: string): RecentPaper[] {
  const ids = new Set<string>(), titles = new Set<string>();
  return papers.filter((p) => {
    const date = p.date && comparisonDate(p.date);
    if (typeof p.title !== "string" || !p.title.trim() || !date || date < from || (p.date?.length === 10 && date > until)) return false;
    const title = p.title.trim().toLowerCase().replace(/\s+/g, " ");
    if (ids.has(p.id) || titles.has(title)) return false;
    ids.add(p.id); titles.add(title);
    return true;
  });
}
export function unreadPapers(papers: RecentPaper[], seenIds: string[]): RecentPaper[] {
  const seen = new Set(seenIds);
  return papers.filter((p) => !seen.has(p.id));
}
export function unreadTotal(total: number, papers: RecentPaper[], follow: Follow): number {
  const overlap = new Set(papers.filter((p) => follow.seenIds.includes(p.id)).map((p) => p.id));
  for (const p of follow.seenPapers || []) {
    if (comparisonDate(p.date) >= follow.lastSeenAt.slice(0, 10)) overlap.add(p.id);
  }
  return Math.max(0, total - overlap.size);
}
const countKey = (follow: Follow) => `pt-count-v4:${follow.q}:${follow.lastSeenAt.slice(0, 10)}`;
export function readCountCache(value: string | null, now = Date.now()): number | undefined {
  try {
    const entry = JSON.parse(value || "null");
    if (entry && Number.isFinite(entry.count) && entry.expiresAt > now) return entry.count;
  } catch {}
}
export function markTopicVisited(previous: Follow, updated: Follow) {
  try {
    cacheStorage.removeItem(countKey(previous));
    cacheStorage.removeItem(countKey(previous) + ":source");
    cacheStorage.removeItem(countKey(updated));
  } catch {}
}
async function recentWorks(follow: Follow, items: boolean): Promise<{ count: number; papers: RecentPaper[]; searchUrl: string }> {
  const date = follow.lastSeenAt.slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  async function request(url: string) {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error("Index unavailable");
    return response.json();
  }
  const params = { mailto: "papertube@users.noreply.github.com" };
  let source: string | null = null;
  try { source = cacheStorage.getItem(countKey(follow) + ":source"); } catch {}
  try {
    if (items && source === "Crossref") throw new Error("Use counted source");
    const searchUrl = "https://api.openalex.org/works?" + new URLSearchParams({
      ...params, search: follow.q, filter: `from_publication_date:${date},to_publication_date:${today}`, "per-page": items ? "8" : "1", sort: "cited_by_count:desc",
    });
    const data = await request(searchUrl);
    const count = data.meta?.count;
    if (!Number.isFinite(count)) throw new Error("Invalid count");
    if (items && !Array.isArray(data.results)) throw new Error("Invalid works");
    try { cacheStorage.setItem(countKey(follow) + ":source", "OpenAlex"); } catch {}
    return { count, searchUrl, papers: items ? cleanRecentPapers(data.results.map((w: any) => ({
      id: w.doi?.toLowerCase() || w.id, title: w.title, year: w.publication_year,
      date: w.publication_date,
      url: w.doi || w.primary_location?.landing_page_url || w.id,
    })), date, today) : [] };
  } catch {
    const searchUrl = "https://api.crossref.org/works?" + new URLSearchParams({
      ...params, query: follow.q, filter: `from-pub-date:${date},until-pub-date:${today}`, rows: items ? "8" : "0", sort: "is-referenced-by-count", order: "desc",
    });
    const data = await request(searchUrl);
    const count = data.message?.["total-results"];
    if (!Number.isFinite(count)) throw new Error("Invalid count");
    if (items && !Array.isArray(data.message.items)) throw new Error("Invalid works");
    try { cacheStorage.setItem(countKey(follow) + ":source", "Crossref"); } catch {}
    return { count, searchUrl, papers: items ? cleanRecentPapers(data.message.items.map((w: any) => ({
      id: w.DOI ? "https://doi.org/" + w.DOI.toLowerCase() : w.URL, title: w.title?.[0],
      year: w.published?.["date-parts"]?.[0]?.[0] || 0,
      date: w.published?.["date-parts"]?.[0]?.length >= 1 ? w.published["date-parts"][0].map((n: number, i: number) => i ? String(n).padStart(2, "0") : String(n)).join("-") : undefined,
      url: w.DOI ? "https://doi.org/" + w.DOI : w.URL,
    })), date, today) : [] };
  }
}
export async function countNewPapers(follow: Follow): Promise<number> {
  try {
    const cached = readCountCache(cacheStorage.getItem(countKey(follow)));
    if (cached !== undefined) return cached;
  } catch {}
  const batch = await recentWorks(follow, true);
  const count = unreadTotal(batch.count, batch.papers, follow);
  try { cacheStorage.setItem(countKey(follow), JSON.stringify({ count, expiresAt: Date.now() + 600000 })); } catch {}
  return count;
}
export async function recentPapers(follow: Follow): Promise<RecentPaper[]> {
  return (await recentBatch(follow)).papers;
}
export async function recentBatch(follow: Follow) {
  const batch = await recentWorks(follow, true);
  return { papers: unreadPapers(batch.papers, follow.seenIds), total: unreadTotal(batch.count, batch.papers, follow), searchUrl: batch.searchUrl };
}
export async function seedFollow(follow: Follow): Promise<Follow> {
  try {
    const papers = await recentPapers(follow);
    return { ...follow, seenIds: [...new Set([...follow.seenIds, ...papers.map((p) => p.id)])], seenPapers: [...(follow.seenPapers || []), ...papers.filter((p) => p.date).map((p) => ({ id: p.id, date: p.date! }))] };
  } catch { return follow; }
}

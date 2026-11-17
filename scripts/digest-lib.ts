import { normalizeQuery, titleMatchesTopic, type RecentPaper } from "../src/lib/follows";

export interface Subscriber { type: string; metadata?: { topics?: unknown } }
export interface Topic { query: string; label: string }
export function groupSubscribers(subscribers: Subscriber[]): Map<string, number> {
  const groups = new Map<string, number>();
  for (const subscriber of subscribers) {
    if (!["regular", "premium", "gifted"].includes(subscriber.type)) continue;
    const topics = typeof subscriber.metadata?.topics === "string" ? subscriber.metadata.topics : "";
    groups.set(topics, (groups.get(topics) || 0) + 1);
  }
  return groups;
}
export const parseTopics = (value: string) => [...new Set(value.split("|").map(normalizeQuery).filter(Boolean))].sort();
export function selectPapers(topics: string[], batches: Map<string, RecentPaper[]>, roundRobin = true): RecentPaper[] {
  const queues = topics.map(topic => [...(batches.get(topic) || [])]
    .filter(p => titleMatchesTopic(p.title, topic))
    .sort((a, b) => (b.citations || 0) - (a.citations || 0) || a.title.localeCompare(b.title)));
  if (!roundRobin) queues.splice(0, queues.length, queues.flat().sort((a, b) => (b.citations || 0) - (a.citations || 0) || a.title.localeCompare(b.title)));
  const selected: RecentPaper[] = [], ids = new Set<string>(), titles = new Set<string>();
  while (queues.some(queue => queue.length) && selected.length < 5) {
    for (const queue of queues) {
      while (queue.length) {
        const paper = queue.shift()!;
        const id = paper.id.toLowerCase(), title = normalizeQuery(paper.title);
        if (ids.has(id) || titles.has(title)) continue;
        ids.add(id); titles.add(title); selected.push(paper); break;
      }
      if (selected.length === 5) break;
    }
  }
  return selected;
}
export function isoWeek(date: Date): number {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7));
  return Math.ceil(((day.getTime() - Date.UTC(day.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
}
export function suggestions(featured: Topic[], followed: string[], date: Date): Topic[] {
  const candidates = [...featured].sort((a, b) => a.query.localeCompare(b.query))
    .filter(topic => !followed.includes(normalizeQuery(topic.query)));
  if (!candidates.length) return [];
  const offset = (isoWeek(date) - 1) % candidates.length;
  return [...candidates.slice(offset), ...candidates.slice(0, offset)].slice(0, 3);
}
export const audience = (topics: string) => ({ predicate: "and", groups: [], filters: [
  // Empty groups use equals ""; missing metadata is not assumed to match this filter.
  { field: "subscriber.metadata.topics", operator: "equals", value: topics },
] });
export const subjectFor = (papers: RecentPaper[]) => `${papers.length} paper${papers.length === 1 ? "" : "s"} this week`;
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const safeUrl = (value: string) => /^https?:\/\//i.test(value) ? escape(value) : "#";
export function renderEmail(papers: RecentPaper[], topics: Topic[]): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${subjectFor(papers)}</title></head><body style="margin:0;background:#fff;color:#202124;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',Inter,Helvetica,Arial,sans-serif"><main style="max-width:560px;margin:0 auto;padding:40px 24px"><p style="font-size:12px;color:#777;margin:0 0 28px">PaperTube · Weekly</p><h1 style="font-size:28px;font-weight:600;letter-spacing:-1px;margin:0 0 32px">${subjectFor(papers)}</h1>${papers.map(paper => `<article style="margin:0 0 28px"><h2 style="font-size:18px;line-height:1.4;font-weight:600;margin:0 0 8px"><a style="color:#202124;text-decoration:none" href="${safeUrl(paper.url)}">${escape(paper.title)}</a></h2><p style="font-size:12px;color:#777;margin:0 0 8px">${escape([paper.venue, paper.date].filter(Boolean).join(" · "))}</p>${paper.takeaway ? `<p style="font-size:14px;line-height:1.6;margin:0;color:#555">${escape(paper.takeaway)}</p>` : ""}</article>`).join("")}<section style="border-top:1px solid #eee;padding-top:22px;margin-top:32px"><p style="font-size:12px;color:#777">You might like</p><p style="font-size:13px;line-height:1.9">${topics.map(topic => `<a style="color:#444;margin-right:14px" href="https://aryashahprog.github.io/papertube/?q=${escape(encodeURIComponent(topic.query))}">${escape(topic.label)}</a>`).join(" ")}</p></section><footer style="margin-top:32px;font-size:12px"><a style="color:#777" href="https://aryashahprog.github.io/papertube/">PaperTube</a></footer></main></body></html>`;
}

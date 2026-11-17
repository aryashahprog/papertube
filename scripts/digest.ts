import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { recentWorks, titleMatchesTopic } from "../src/lib/follows";
import { examples, slug } from "../src/lib/pipeline";
import { audienceFields, deliveryPlan, parseTopics, previewTopics, renderEmail, selectPapers, subjectFor, suggestions, topicBatches, type Subscriber, type Topic } from "./digest-lib";

const api = "https://api.buttondown.com/v1/";
async function request(url: string, key: string, body?: unknown) {
  if (!url.startsWith(api)) throw new Error("Unexpected Buttondown pagination URL");
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Token ${key}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Buttondown ${response.status}`);
  return response.json();
}
async function main() {
  const { values } = parseArgs({ options: { "dry-run": { type: "boolean" }, topics: { type: "string" } } });
  const key = process.env.BUTTONDOWN_API_KEY;
  const dryRun = !!values["dry-run"];
  if (!key && !dryRun) { console.log("Weekly digest not configured: BUTTONDOWN_API_KEY is unset."); return; }
  if (values.topics !== undefined && !dryRun) throw new Error("--topics requires --dry-run");
  let groups: Map<string, number>;
  let unfiltered = false;
  const preview = previewTopics(dryRun, key, values.topics);
  if (preview !== undefined) groups = new Map([[preview, 0]]);
  else {
    const subscribers: Subscriber[] = [], visited = new Set<string>();
    let next: string | null = api + "subscribers";
    while (next) {
      if (visited.has(next)) throw new Error("Repeated Buttondown pagination URL");
      visited.add(next);
      const page = await request(next, key!);
      if (!Array.isArray(page.results) || !(page.next === null || typeof page.next === "string")) throw new Error("Invalid subscriber response");
      subscribers.push(...page.results);
      next = page.next;
    }
    ({ groups, unfiltered } = deliveryPlan(subscribers));
  }
  const featured: Topic[] = [];
  for (const file of (await readdir("public/data")).filter(file => file.endsWith(".json")).sort()) {
    const data = JSON.parse(await readFile(`public/data/${file}`, "utf8"));
    // Current snapshots omit topic metadata; their filenames map to the app's featured examples.
    const label = data.label || examples.find(topic => slug(topic) + ".json" === file) || file.slice(0, -5).replaceAll("-", " ");
    featured.push({ label, query: data.query || label.toLowerCase() });
  }
  const featuredQueries = featured.map(topic => topic.query);
  const wanted = [...new Set([...groups.keys()].flatMap(value => parseTopics(value).length ? parseTopics(value) : featuredQueries))];
  const topics = wanted.slice(0, 40);
  if (wanted.length > topics.length) console.warn(`Topic cap: fetching ${topics.length} of ${wanted.length} topics.`);
  const now = new Date(), from = new Date(now.getTime() - 28 * 86400000).toISOString();
  const batches = await topicBatches(topics, async topic => {
    const batch = await recentWorks({ q: topic, label: topic, followedAt: from, lastSeenAt: from, seenIds: [] }, true);
    const papers = batch.papers.filter(paper => titleMatchesTopic(paper.title, topic));
    console.log(`${topic}: ${papers.length} papers`);
    return papers;
  }, topic => console.warn(`${topic}: indexes unavailable; skipping topic.`));
  if (dryRun) await mkdir("digest-preview", { recursive: true });
  let index = 0;
  for (const [group, recipients] of groups) {
    const followed = parseTopics(group);
    const papers = followed.length ? selectPapers(followed, batches) :
      selectPapers(featuredQueries, batches, false);
    if (!papers.length) { console.log(`Skipping group ${JSON.stringify(group)}: no papers.`); continue; }
    const headings = followed.length ? followed.map(query => ({ query, label: featured.find(topic => topic.query === query)?.label || query })) : featured;
    const subject = subjectFor(papers), body = renderEmail(papers, suggestions(featured, followed, now), headings);
    if (dryRun) {
      const path = `digest-preview/${++index}.html`;
      await writeFile(path, body);
      console.log(`Dry-run: ${subject}; ${recipients} recipients${preview !== undefined ? " (preview only)" : ""}; ${path}`);
    } else {
      await request(api + "emails", key!, { subject, body, status: "about_to_send", archival_mode: "disabled", ...audienceFields(group, unfiltered) });
      console.log(`Queued: ${subject}; ${recipients} recipients`);
    }
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });

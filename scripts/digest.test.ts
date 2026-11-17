import { test } from "node:test";
import assert from "node:assert/strict";
import { audience, audienceFields, deliveryPlan, groupSubscribers, isoWeek, parseTopics, renderEmail, selectPapers, suggestions } from "./digest-lib";
import { recentWorks, type RecentPaper } from "../src/lib/follows";

const paper = (id: string, title: string, citations = 0): RecentPaper => ({ id, title, citations, url: `https://doi.org/${id}`, year: 2026, date: "2026-11-15" });
test("groups only deliverable subscriber types by exact metadata string", () => {
  assert.deepEqual([...groupSubscribers([
    { type: "regular", metadata: { topics: "crispr|longevity" } },
    { type: "premium", metadata: { topics: "crispr|longevity" } },
    { type: "gifted", metadata: { topics: "longevity|crispr" } },
    { type: "regular" }, { type: "regular", metadata: { topics: "" } },
    { type: "regular", metadata: { topics: "featured" } },
    { type: "unactivated" }, { type: "unsubscribed" },
    { type: "regular", metadata: { topics: ["crispr"] } },
  ])], [["crispr|longevity", 2], ["longevity|crispr", 1], ["featured", 4]]);
  assert.equal(groupSubscribers([]).size, 0);
  assert.deepEqual(parseTopics(" Longevity | CRISPR |crispr||"), ["crispr", "longevity"]);
  assert.equal(audience("").filters[0].value, "featured");
  assert.equal(audience("featured").filters[0].value, "featured");
  assert.deepEqual(parseTopics("featured"), []);
});
test("metadata-free regular subscribers get one general broadcast without filters", () => {
  const plan = deliveryPlan([{ type: "regular" }, { type: "regular", metadata: { topics: "" } },
    { type: "premium", metadata: { topics: "crispr" } }, { type: "unactivated" }]);
  assert.equal(plan.unfiltered, true);
  assert.deepEqual([...plan.groups], [["featured", 3]]);
  assert.deepEqual(audienceFields("featured", plan.unfiltered), {});
  assert.ok(!Object.hasOwn(audienceFields("featured", plan.unfiltered), "filters"));
  for (const topics of ["featured", "crispr"]) {
    const segmented = deliveryPlan([{ type: "regular", metadata: { topics } }, { type: "regular" }]);
    assert.equal(segmented.unfiltered, false);
    assert.deepEqual(audienceFields(topics, segmented.unfiltered), { filters: audience(topics) });
  }
  assert.equal(deliveryPlan([]).groups.size, 0);
  assert.equal(deliveryPlan([{ type: "unsubscribed" }]).groups.size, 0);
});
test("round robin sorts by citations, skips duplicates and unrelated titles, caps at five", () => {
  const a = [paper("1", "CRISPR longevity", 100), paper("2", "CRISPR two", 90), paper("3", "CRISPR three", 80), paper("4", "CRISPR four", 70)];
  const b = [a[0], paper("duplicate", "CRISPR longevity", 99), paper("5", "Longevity five", 20), paper("6", "Longevity six", 10), paper("7", "unrelated", 1000)];
  const batches = new Map([["crispr", a.reverse()], ["longevity", b]]);
  assert.deepEqual(selectPapers(["crispr", "longevity"], batches).map(p => p.id), ["1", "5", "2", "6", "3"]);
  assert.deepEqual(selectPapers(["crispr", "longevity"], batches, false).map(p => p.id), ["1", "2", "3", "4", "5"]);
  assert.deepEqual(selectPapers(["missing"], batches), []);
  assert.deepEqual(selectPapers([], new Map()), []);
});
test("suggestions exclude follows and rotate deterministically at ISO week boundaries", () => {
  const featured = ["a", "b", "c", "d", "e"].map(query => ({ query, label: query }));
  const date = new Date("2026-01-05T00:00:00Z");
  assert.equal(isoWeek(new Date("2025-12-29")), 1);
  assert.deepEqual(suggestions(featured, ["a"], date).map(t => t.query), ["c", "d", "e"]);
  assert.deepEqual(suggestions([...featured].reverse(), ["a"], date), suggestions(featured, ["a"], date));
  assert.notDeepEqual(suggestions(featured, ["a"], new Date("2026-01-12")), suggestions(featured, ["a"], date));
  assert.deepEqual(suggestions([], [], date), []);
  assert.deepEqual(suggestions(featured, featured.map(t => t.query), date), []);
});
test("rendering escapes text and URLs, rejects unsafe links, and tolerates missing details", () => {
  const html = renderEmail([{ ...paper("1", '<script>"&'), url: 'https://example.com/?x="&y=2', venue: "A&B", takeaway: "<finding>" }, { ...paper("2", "Safe"), url: "javascript:alert(1)" }], [{ query: "a&b", label: "<topic>" }]);
  assert.ok(html.includes("&lt;script&gt;&quot;&amp;"));
  assert.ok(html.includes("&lt;finding&gt;"));
  assert.ok(html.includes("&lt;topic&gt;"));
  assert.ok(html.includes("x=&quot;&amp;y=2"));
  assert.ok(html.includes("?q=a%26b"));
  assert.ok(!html.includes("javascript:"));
  assert.ok(!html.includes("<script>"));
  assert.ok(renderEmail([], []).includes("0 papers this week"));
});
test("recent fetching falls back to Crossref in Node and preserves citations and abstract takeaways", async () => {
  const original = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async input => {
    urls.push(String(input));
    if (urls.length === 1) return new Response("", { status: 429 });
    return Response.json({ message: { items: [{ DOI: "10.1/test", title: ["CRISPR treatments"], published: { "date-parts": [[2026, 11, 15]] }, "is-referenced-by-count": 12, "container-title": ["Journal"], abstract: "We found that CRISPR treatments reduced the measured disease burden in the experimental population." }] } });
  };
  try {
    const batch = await recentWorks({ q: "crispr", label: "CRISPR", followedAt: "2026-01-01", lastSeenAt: "2026-01-01", seenIds: [] }, true);
    assert.equal(batch.papers[0].citations, 12);
    assert.equal(batch.papers[0].venue, "Journal");
    assert.ok(batch.papers[0].takeaway);
    assert.ok(urls[0].includes("cited_by_count%3Adesc"));
    assert.ok(urls[1].includes("is-referenced-by-count"));
    globalThis.fetch = async () => { throw new Error("offline"); };
    await assert.rejects(recentWorks({ q: "crispr", label: "", followedAt: "2026-01-01", lastSeenAt: "2026-01-01", seenIds: [] }), /offline/);
  } finally { globalThis.fetch = original; }
});

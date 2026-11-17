import { test } from "node:test";
import assert from "node:assert/strict";
import { doi, workType, enrichPaper, request, priorityPapers } from "./enrich";
import type { Paper } from "../src/lib/pipeline";
test("DOI and publication types normalize to pipeline fields", () => {
  assert.equal(doi("https://doi.org/10.1/ABC"), "10.1/abc");
  assert.equal(workType(["JournalArticle", "News"]), "news");
  assert.equal(workType(["Editorial"]), "editorial");
  assert.equal(workType(["LettersAndComments"]), "comment");
  assert.equal(workType(["Published Erratum"]), "erratum");
  assert.equal(workType([]), undefined);
  assert.equal(workType(["Unknown"]), undefined);
});
test("enrichment cleans abstracts, regenerates takeaways and preserves missing metadata", () => {
  const p = { title: "Established baselines", abstract: "", takeaway: "", type: "article" } as Paper;
  const updated = enrichPaper(p, { abstract: "<p>We demonstrate a significant improvement over established baselines in all experiments.</p>", publicationTypes: ["Editorial"] });
  assert.match(updated.takeaway, /^We demonstrate/);
  assert.equal(updated.type, "editorial");
  assert.ok(!updated.abstract.includes("<p>"));
  assert.deepEqual(enrichPaper(p, null), p);
  assert.equal(enrichPaper(updated, null).abstract, updated.abstract);
});
test("enrichment validates replacement abstracts and uses valid existing text or no takeaway", () => {
  const paper = { title: "Diffusion image synthesis", abstract: "We improve diffusion image synthesis with neural networks.", takeaway: "" } as Paper;
  const valid = enrichPaper(paper, { abstract: "Unrelated work on marine ecosystems." });
  assert.equal(valid.abstract, paper.abstract);
  assert.ok(valid.takeaway);
  const missing = enrichPaper({ ...paper, abstract: "Diffusion models. docker pull example/model" }, null);
  assert.equal(missing.abstract, "");
  assert.equal(missing.takeaway, "");
  const replacement = enrichPaper(missing, { abstract: "We demonstrate improved diffusion image synthesis across benchmarks." });
  assert.match(replacement.takeaway, /diffusion image synthesis/);
});
test("requests retry 429 gently and surface permanent errors", async () => {
  let calls = 0; const waits: number[] = [];
  const fetcher = (async () => ++calls === 1 ? new Response("limited", { status: 429 }) : Response.json([null])) as typeof fetch;
  assert.deepEqual(await request("https://example.test", {}, fetcher, (async (ms: number) => { waits.push(ms); }) as any), [null]);
  assert.deepEqual(waits, [60000]);
  await assert.rejects(request("https://example.test", {}, (async () => new Response("unavailable", { status: 503 })) as typeof fetch), /HTTP 503 unavailable/);
});
test("priority includes the ranked forty and original Start here, with empty input valid", () => {
  const papers: Paper[] = Array.from({ length: 60 }, (_, i) => ({ id: String(i), doi: String(i), title: "Sleep finding " + i, year: 2020, citations: i, relevance: i, authors: [], venue: "", url: "", pdf: "", abstract: "", takeaway: "", references: [], theme: "Sleep", coherent: true, rank: i }));
  const data = { papers, source: "OpenAlex" as const, total: 60, fetchedAt: "" };
  const selected = priorityPapers(data, "sleep");
  assert.equal(selected.length, 45);
  assert.ok(selected.some(p => p.id === "59"));
  assert.ok(selected.some(p => p.id === "0"));
  assert.deepEqual(priorityPapers({ ...data, papers: [] }, "sleep"), []);
});

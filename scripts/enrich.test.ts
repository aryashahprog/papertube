import { test } from "node:test";
import assert from "node:assert/strict";
import { doi, workType, enrichPaper, request } from "./enrich";
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
  const p = { abstract: "", takeaway: "", type: "article" } as Paper;
  const updated = enrichPaper(p, { abstract: "<p>We demonstrate a significant improvement over established baselines in all experiments.</p>", publicationTypes: ["Editorial"] });
  assert.match(updated.takeaway, /^We demonstrate/);
  assert.equal(updated.type, "editorial");
  assert.ok(!updated.abstract.includes("<p>"));
  assert.deepEqual(enrichPaper(p, null), p);
  assert.equal(enrichPaper(updated, null).abstract, updated.abstract);
});
test("requests retry 429 gently and surface permanent errors", async () => {
  let calls = 0; const waits: number[] = [];
  const fetcher = (async () => ++calls === 1 ? new Response("limited", { status: 429 }) : Response.json([null])) as typeof fetch;
  assert.deepEqual(await request("https://example.test", {}, fetcher, (async (ms: number) => { waits.push(ms); }) as any), [null]);
  assert.deepEqual(waits, [10000]);
  await assert.rejects(request("https://example.test", {}, (async () => new Response("unavailable", { status: 503 })) as typeof fetch), /HTTP 503 unavailable/);
});

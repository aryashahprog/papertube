import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fromEuropePmc, discoverEuropePmc } from "./europe-pmc";
import { startHere, cluster, type Dataset } from "../src/lib/pipeline";
const record = { id: "123", source: "MED", title: "GLP-1 drugs improve outcomes", pubYear: "2020", citedByCount: 100, abstractText: "We demonstrate that GLP-1 drugs significantly improve clinical outcomes in this randomized trial.", pubTypeList: { pubType: ["Clinical Trial"] } };
test("Europe PMC records preserve research metadata and reject news or missing abstracts", () => {
  const paper = fromEuropePmc(record)!;
  assert.equal(paper.citations, 100);
  assert.equal(paper.year, 2020);
  assert.match(paper.takeaway, /^We demonstrate/);
  assert.equal(paper.workType, "article");
  assert.equal(fromEuropePmc({ ...record, pubTypeList: { pubType: ["News"] } }), null);
  assert.equal(fromEuropePmc({ ...record, abstractText: "" }), null);
  assert.equal(fromEuropePmc({ ...record, pubTypeList: { pubType: ["Review"] } })?.workType, "review");
});
test("Europe PMC discovery paginates and returns truthful source and themes", async () => {
  const urls: string[] = [];
  const fetcher = (async (url) => { urls.push(String(url)); return Response.json({ hitCount: 2, nextCursorMark: "next", resultList: { result: [record] } }); }) as typeof fetch;
  const data = await discoverEuropePmc("GLP-1 drugs", "GLP-1", 2, fetcher, (async () => {}) as any);
  assert.equal(data.source, "Europe PMC");
  assert.equal(data.papers.length, 1);
  assert.equal(new URL(urls[1]).searchParams.get("cursorMark"), "next");
  assert.match(new URL(urls[0]).searchParams.get("query")!, /sort_cited:y/);
});
test("Europe PMC empty and error responses are explicit", async () => {
  assert.deepEqual((await discoverEuropePmc("topic", "topic", 1, (async () => Response.json({ hitCount: 0, resultList: { result: [] } })) as typeof fetch)).papers, []);
  await assert.rejects(discoverEuropePmc("topic", "topic", 1, (async () => new Response("unavailable", { status: 503 })) as typeof fetch), /HTTP 503/);
  await assert.rejects(discoverEuropePmc("topic", "topic", 0), /1–10 pages/);
});
test("GLP-1 snapshot starts with five research excerpts and truthful provenance", () => {
  const data: Dataset = JSON.parse(readFileSync(new URL("../public/data/glp-1-drugs.json", import.meta.url), "utf8"));
  assert.equal(data.source, "Europe PMC");
  const top = startHere(data.papers, "GLP-1 drugs");
  assert.equal(top.length, 5);
  assert.ok(top.every(p => p.abstract && p.takeaway && p.citations > 100));
  assert.ok(data.papers.every(p => p.year <= new Date().getFullYear() && ["article", "review"].includes(p.workType || "")));
  assert.ok(new Set(data.papers.map(p => p.theme)).size > 1);
});
test("GLP-1 labels avoid mechanism fragments and retain meaningful loss phrases", () => {
  const data: Dataset = JSON.parse(readFileSync(new URL("../public/data/glp-1-drugs.json", import.meta.url), "utf8"));
  cluster(data.papers, "GLP-1 drugs");
  assert.ok(data.papers.every(p => !/\b(glucagon|like|peptide|receptors?|agonists?|type)\b/i.test(p.theme)));
  const papers = ["Weight loss with GLP-1 receptor agonists", "Weight loss with glucagon like peptide agonists"].map(title => ({ ...data.papers[0], title }));
  cluster(papers, "GLP-1 drugs");
  assert.deepEqual(papers.map(p => p.theme), ["Weight loss", "Weight loss"]);
});

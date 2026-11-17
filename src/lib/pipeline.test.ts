import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createAbstractHydrator } from "./abstracts";
import {
  reconstruct,
  takeaway,
  finish,
  refreshDataset,
  discover,
  RateLimitError,
  cleanAbstract,
  validatedAbstract,
  matchesQuery,
  publicationYear,
  cluster,
  suggestQuery,
  startHere,
  playThrough,
  examples,
  invalidQueryMessage,
  clampQuery,
  type Dataset,
  type Paper,
} from "./pipeline";
import { digestPapers, titleMatchesTopic, recentBatch, seedFollow, comparisonDate, cleanRecentPapers, unreadPapers, readCountCache, safeStorage, countNewPapers, readFollows, recentPapers, writeFollows } from "./follows";
test("recent feeds link to human search pages for the successful source", async () => {
  const original = globalThis.fetch;
  const follow = { q: "gene & crispr", label: "test", lastSeenAt: "2025-01-02", followedAt: "2025-01-02", seenIds: [] };
  try {
    globalThis.fetch = (async () => new Response(JSON.stringify({ meta: { count: 0 }, results: [] }))) as typeof fetch;
    const openalex = new URL((await recentBatch(follow)).searchUrl);
    assert.equal(openalex.origin + openalex.pathname, "https://openalex.org/works");
    assert.equal(openalex.searchParams.get("filter"), `title.search:${follow.q},publication_date:2025-01-02-${new Date().toISOString().slice(0, 10)}`);
    globalThis.fetch = (async (url) => String(url).includes("api.openalex.org") ? new Response("", { status: 503 }) : new Response(JSON.stringify({ message: { "total-results": 0, items: [] } }))) as typeof fetch;
    const crossref = new URL((await recentBatch(follow)).searchUrl);
    assert.equal(crossref.origin + crossref.pathname, "https://search.crossref.org/search/works");
    assert.equal(crossref.searchParams.get("q"), follow.q);
    assert.equal(crossref.searchParams.get("from_ui"), "yes");
    globalThis.fetch = (async () => new Response("", { status: 503 })) as typeof fetch;
    await assert.rejects(() => recentBatch(follow));
  } finally { globalThis.fetch = original; }
});
test("following seeds current recent ids without advancing the visit and tolerates errors", async () => {
  const original = globalThis.fetch;
  const follow = { q: "test", label: "test", lastSeenAt: "2025-01-02", followedAt: "2025-01-02", seenIds: [] };
  try {
    globalThis.fetch = (async () => new Response(JSON.stringify({ meta: { count: 1 }, results: [{ id: "same-day", title: "Test already visible", publication_date: "2025-01-02", publication_year: 2025 }] }))) as typeof fetch;
    const seeded = await seedFollow(follow);
    assert.deepEqual(seeded.seenIds, ["same-day"]);
    assert.equal(seeded.lastSeenAt, follow.lastSeenAt);
    assert.equal(await countNewPapers(seeded), 0);
    globalThis.fetch = (async () => new Response(JSON.stringify({ meta: { count: 0 }, results: [] }))) as typeof fetch;
    assert.deepEqual((await seedFollow(follow)).seenIds, []);
    globalThis.fetch = (async () => new Response("", { status: 503 })) as typeof fetch;
    assert.deepEqual(await seedFollow(follow), follow);
  } finally { globalThis.fetch = original; }
});
test("coarse publication dates use period end for since, not the fully specified today cap", () => {
  assert.equal(comparisonDate("2024-02"), "2024-02-29");
  assert.equal(comparisonDate("2025"), "2025-12-31");
  const paper = { id: "a", title: "Title", date: "2025-01", year: 2025, url: "" };
  assert.deepEqual(cleanRecentPapers([paper], "2025-01-20", "2025-01-25"), [paper]);
  assert.deepEqual(cleanRecentPapers([{ ...paper, date: "2025" }], "2025-01-20", "2025-01-25"), [{ ...paper, date: "2025" }]);
  assert.deepEqual(cleanRecentPapers([{ ...paper, date: "2025-01-26" }], "2025-01-20", "2025-01-25"), []);
});
test("digests require on-topic titles, exclude seen ids and cap at five in quality order", () => {
  const follow = { q: "CRISPR", label: "CRISPR", lastSeenAt: "2025-01-02", followedAt: "2025-01-01", seenIds: ["0"] };
  const papers = Array.from({ length: 9 }, (_, i) => ({ id: String(i), title: `CRISPR gene editing ${i}`, year: 2025, url: "" }));
  assert.deepEqual(digestPapers(papers, follow).map((p) => p.id), ["1", "2", "3", "4", "5"]);
  assert.deepEqual(digestPapers([{ ...papers[0], id: "other", title: "Decoding glioblastoma plasticity" }], follow), []);
  assert.deepEqual(digestPapers([], follow), []);
  assert.equal(titleMatchesTopic("Evaluating LLMs in clinical practice", "large language models"), true);
  assert.equal(titleMatchesTopic("Large language model evaluation", "large language models"), true);
  assert.equal(titleMatchesTopic("Microplastic pollution in rivers", "microplastics"), true);
  assert.equal(titleMatchesTopic("Language development in children", "large language models"), false);
  assert.equal(titleMatchesTopic("Notcrispr is unrelated", "CRISPR"), false);
  assert.equal(titleMatchesTopic("", "CRISPR"), false);
  assert.equal(titleMatchesTopic("Some paper", "?!"), false);
});
test("recent items reject missing titles, duplicates and out-of-window dates", () => {
  const paper = { id: "doi:1", title: "Real title", date: "2025-01-02", year: 2025, url: "https://example.org" };
  assert.deepEqual(cleanRecentPapers([paper, { ...paper, id: "other" }, { ...paper, title: "" }, { ...paper, date: "2099-01-01" }, { ...paper, date: "2024-01-01" }], "2025-01-01", "2025-01-31"), [paper]);
  assert.deepEqual(cleanRecentPapers([{ ...paper, date: "2025-01" }], "2025-01-01", "2025-01-31"), [{ ...paper, date: "2025-01" }]);
});
test("same-day publications already shown are excluded from badges and feeds", async () => {
  const papers = [{ id: "seen", title: "Old", year: 2025, url: "https://example.org" }, { id: "new", title: "New", year: 2025, url: "https://example.org" }];
  assert.deepEqual(unreadPapers(papers, ["seen"]), [papers[1]]);
  assert.deepEqual(unreadPapers([], []), []);
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ meta: { count: 4830 }, results: papers.map((p) => ({ id: p.id, title: "Test " + p.title, publication_year: p.year, publication_date: "2025-01-02" })) }))) as typeof fetch;
  try {
    const follow = { q: "test", label: "test", lastSeenAt: "2025-01-01", followedAt: "2025-01-01", seenIds: ["seen"] };
    assert.equal(await countNewPapers(follow), 1);
    assert.equal((await recentPapers(follow)).length, 1);
  } finally { globalThis.fetch = original; }
});
test("count caches expire, including zero; recent results always fetch fresh", async () => {
  assert.equal(readCountCache(JSON.stringify({ count: 0, expiresAt: 100 }), 99), 0);
  assert.equal(readCountCache(JSON.stringify({ count: 0, expiresAt: 100 }), 100), undefined);
  assert.equal(readCountCache("0"), undefined);
  assert.equal(readCountCache("bad"), undefined);
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return new Response(JSON.stringify({ meta: { count: 0 }, results: [] })); }) as typeof fetch;
  try {
    const follow = { q: "test", label: "test", lastSeenAt: "2025-01-01", followedAt: "2025-01-01", seenIds: [] };
    await recentPapers(follow);
    await recentPapers(follow);
    assert.equal(calls, 2);
  } finally { globalThis.fetch = original; }
});
test("throwing browser storage getters do not break reads or follow toggles", () => {
  const host = Object.defineProperty({}, "localStorage", { get() { throw new Error("SecurityError"); } });
  const storage = safeStorage("localStorage", host as typeof globalThis);
  assert.deepEqual(readFollows(storage), []);
  assert.equal(writeFollows(storage, []), false);
  assert.doesNotThrow(() => storage.removeItem("key"));
});
test("recent works share count filters, map links, handle empty and reject errors", async () => {
  const original = globalThis.fetch;
  const follow = { q: "crispr", label: "CRISPR", followedAt: "2025-01-01", lastSeenAt: "2025-01-02", seenIds: [] };
  try {
    const urls: URL[] = [];
    globalThis.fetch = (async (url) => {
      urls.push(new URL(String(url)));
      return new Response(JSON.stringify({ meta: { count: 4830 }, results: [{ id: "oa:1", title: "CRISPR finding", publication_year: 2025, publication_date: "2025-01-02", primary_location: { landing_page_url: "https://example.org/paper" } }] }));
    }) as typeof fetch;
    assert.equal(await countNewPapers(follow), 1);
    assert.deepEqual(await recentPapers(follow), [{ id: "oa:1", title: "CRISPR finding", year: 2025, date: "2025-01-02", url: "https://example.org/paper" }]);
    for (const key of ["search", "filter", "sort"]) assert.equal(urls[0].searchParams.get(key), urls[1].searchParams.get(key));
    assert.equal(urls[1].searchParams.get("per-page"), "50");
    assert.match(urls[1].searchParams.get("filter")!, /title_and_abstract.search:crispr/);
    globalThis.fetch = (async () => new Response(JSON.stringify({ meta: { count: 0 }, results: [] }))) as typeof fetch;
    assert.deepEqual(await recentPapers(follow), []);
    globalThis.fetch = (async (url) => String(url).includes("openalex") ? new Response("", { status: 503 }) : new Response(JSON.stringify({ message: { "total-results": 1, items: [{ DOI: "10/example", title: ["CRISPR fallback"], published: { "date-parts": [[2025, 1, 2]] } }] } }))) as typeof fetch;
    assert.equal((await recentPapers(follow))[0].url, "https://doi.org/10/example");
    globalThis.fetch = (async () => new Response("", { status: 503 })) as typeof fetch;
    await assert.rejects(recentPapers(follow));
  } finally { globalThis.fetch = original; }
});
test("cheap counts use OpenAlex, fall back to Crossref, and reject dual failure", async () => {
  const original = globalThis.fetch;
  const follow = { q: "crispr", label: "CRISPR", followedAt: "2025-01-01", lastSeenAt: "2025-01-02", seenIds: [] };
  try {
    const urls: string[] = [];
    globalThis.fetch = (async (url) => {
      urls.push(String(url));
      return new Response(JSON.stringify({ meta: { count: 0 }, results: [] }));
    }) as typeof fetch;
    assert.equal(await countNewPapers(follow), 0);
    assert.match(urls[0], /per-page=50/);
    assert.match(urls[0], /from_publication_date%3A2025-01-02/);
    globalThis.fetch = (async (url) => {
      urls.push(String(url));
      return String(url).includes("openalex") ? new Response("", { status: 503 }) : new Response(JSON.stringify({ message: { "total-results": 7, items: [] } }));
    }) as typeof fetch;
    assert.equal(await countNewPapers(follow), 0);
    assert.match(urls.at(-1)!, /rows=50/);
    assert.match(urls.at(-1)!, /query.bibliographic=crispr/);
    assert.match(urls.at(-1)!, /from-pub-date%3A2025-01-02/);
    globalThis.fetch = (async () => new Response("", { status: 503 })) as typeof fetch;
    await assert.rejects(countNewPapers(follow));
  } finally { globalThis.fetch = original; }
});
test("follow storage tolerates empty, malformed and unavailable storage", () => {
  let value: string | null = null;
  const storage = { getItem: () => value, setItem: (_key: string, next: string) => { value = next; } };
  assert.deepEqual(readFollows(storage), []);
  for (const bad of ["{", "null", "{}", '[null, {}, {"q":3}]']) {
    value = bad;
    assert.deepEqual(readFollows(storage), []);
  }
  const follow = { q: "crispr", label: "CRISPR", followedAt: "2025-01-01", lastSeenAt: "2025-01-02", seenIds: ["a"] };
  assert.equal(writeFollows(storage, [follow]), true);
  assert.deepEqual(readFollows(storage), [follow]);
  assert.equal(writeFollows(storage, []), true);
  assert.deepEqual(readFollows(storage), []);
  const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("quota"); } };
  assert.deepEqual(readFollows(blocked), []);
  assert.equal(writeFollows(blocked, [follow]), false);
});
test("query limits preserve code points and remove lone input surrogates", () => {
  assert.equal(clampQuery(""), "");
  assert.equal(clampQuery("a".repeat(201)), "a".repeat(200));
  const query = "a".repeat(199) + "😀" + "extra";
  assert.equal(clampQuery(query), "a".repeat(199) + "😀");
  assert.equal(Array.from(clampQuery("😀".repeat(201))).length, 200);
  assert.doesNotThrow(() => encodeURIComponent(clampQuery(query)));
  const truncatedInput = query.slice(0, 200);
  assert.equal(clampQuery(truncatedInput), "a".repeat(199));
  assert.doesNotThrow(() => encodeURIComponent(clampQuery(truncatedInput)));
  assert.equal(clampQuery("\uD800hello\uDFFF"), "hello");
});
test("abstract reconstruction and finding extraction", () => {
  assert.equal(
    reconstruct({ We: [0], show: [1], results: [2] }),
    "We show results",
  );
  assert.equal(reconstruct(null), "");
  assert.match(
    takeaway(
      "This is a broad introductory background sentence about the field. We demonstrate a significant improvement over established baselines in all experiments.",
    ),
    /^We demonstrate/,
  );
  assert.equal(takeaway(""), "");
});
test("abstract sanity retains distinctive title matches and rejects unrelated or missing text", () => {
  assert.equal(validatedAbstract("Graph networks", "<p>These graph networks improve classification.</p>"), "These graph networks improve classification.");
  assert.equal(validatedAbstract("Neural networks", "A neural network predicts protein structures."), "A neural network predicts protein structures.");
  assert.equal(validatedAbstract("AI methods", "We evaluate AI across benchmarks."), "We evaluate AI across benchmarks.");
  assert.equal(validatedAbstract("Graph networks", "The study presents a new model for sleep."), "");
  assert.equal(validatedAbstract("Graph networks", ""), "");
  assert.equal(validatedAbstract("", "Graph networks improve classification."), "");
  assert.equal(validatedAbstract("A new study", "A new study improves prediction."), "");
});
test("repository abstracts are rejected even when they share title tokens", () => {
  for (const instructions of ["docker pull example/model", "pip install example", "python -m pip install example", "git clone https://example.test/project", "```python\ntrain()\n```", "## Usage\nRun the model", "Installation:\nInstall the package", "1. System Requirements\nLinux"]) {
    assert.equal(validatedAbstract("Denoising Diffusion Probabilistic Models", `We study diffusion.\n${instructions}`), "", instructions);
  }
  assert.ok(validatedAbstract("Container performance", "We evaluate container performance using Docker and report resource usage in production."));
});
test("takeaways prefer findings and conclusions over background and methods", () => {
  for (const cue of ["We found", "Results show", "These findings suggest", "Conclusion:", "In summary,", "The treatment was associated with", "The treatment reduced", "The treatment increased"]) {
    const finding = `${cue} better blood sugar control in people with diabetes.`;
    const result = takeaway(`We aimed to assess a treatment in a large clinical trial. Methods: Participants were recruited from several hospitals. ${finding}`);
    assert.match(result, /better blood sugar control/i);
    assert.doesNotMatch(result, /aimed|Methods|recruited|Conclusion:|In summary/i);
  }
  assert.match(takeaway("This review discusses earlier treatment options and their history. We found fewer side effects with the new treatment."), /^We found/);
  assert.equal(takeaway("We found reduced risk, HR 0·88, 95% CI 0·82-0·94; p Interpretation Treatment improved glycaemic control without increased hypoglycaemia."), "Treatment improved blood sugar control without increased low blood sugar.");
});
test("takeaways remove statistics, acronym brackets, parentheticals and citations", () => {
  const result = takeaway("Results show reduced mortality (95% CI 0.70–0.90) (GLP-1 RA) [RCT] in participants (n=500), HR=0.80, OR 0.7, RR: 0.9, p < 0.001 [12, 13].");
  assert.equal(result, "Reduced death in people.");
  const unbracketed = takeaway("We found reduced mortality, 95% CI 0.7 to 0.9, n=500, p-value=0.02, compared with standard treatment.");
  assert.doesNotMatch(unbracketed, /95%|CI|n=|p-value|0\.02/);
  assert.match(takeaway("We found that one or 2 doses could help people with this condition."), /or 2 doses/);
});
test("takeaway glossary is conservative, case-preserving and word-boundary safe", () => {
  const glossary = [
    ["glycaemic control", "blood sugar control"], ["glycemic control", "blood sugar control"],
    ["cardiovascular", "heart"], ["renal", "kidney"], ["mortality", "death"],
    ["adverse events", "side effects"], ["efficacy", "effectiveness"],
    ["placebo-controlled", "compared with a placebo"], ["subjects", "people"],
    ["participants", "people"], ["obese people", "people with obesity"], ["obese", "with obesity"],
    ["in vivo", "in living animals"], ["in vitro", "in the lab"],
    ["bioaccumulate", "build up in the body"], ["bioaccumulates", "builds up in the body"],
    ["bioaccumulated", "built up in the body"], ["trophic levels", "the food chain"],
    ["bio-accumulated", "built up in the body"], ["glucose concentrations", "blood sugar levels"],
    ["glucose control", "blood sugar control"], ["hypoglycaemia", "low blood sugar"],
    ["hypoglycemia", "low blood sugar"], ["efficacious", "effective"],
    ["genome engineering", "gene editing"], ["genome editing", "gene editing"],
    ["genomic manipulation", "changing DNA"], ["genetic perturbation", "gene modification"],
    ["eukaryotic cells", "cells with a nucleus"], ["marine organisms", "sea life"], ["biota", "living things"],
    ["clustered regularly interspaced short palindromic repeats", "CRISPR"], ["Cas9-mediated", "Cas9-based"],
    ["elucidate", "understand"], ["functional organization of the genome", "organization of DNA"],
    ["embrittlement", "becoming brittle"], ["microcracking", "developing tiny cracks"], ["microparticles", "tiny particles"],
    ["ingestion", "swallowing"], ["hydrophobic", "water-repelling"],
    ["bioavailability", "availability to living things"], ["ubiquitous", "widespread"],
    ["can be used to facilitate", "can help with"], ["can be categorized as either", "can be grouped as"],
    ["short-acting compounds", "short-acting drugs"], ["long-acting compounds", "long-acting drugs"],
    ["short-lived receptor activation", "brief effects"], ["activate the GLP-1 receptor continuously", "act continuously"],
  ];
  for (const [term, replacement] of glossary) {
    assert.equal(takeaway(`We found that ${term} may affect outcomes in this setting.`), `We found that ${replacement} may affect outcomes in this setting.`);
  }
  assert.equal(takeaway("Cardiovascular outcomes were associated with renal outcomes."), "Heart outcomes were associated with kidney outcomes.");
  assert.equal(takeaway("CARDIOVASCULAR outcomes were associated with RENAL outcomes."), "HEART outcomes were associated with KIDNEY outcomes.");
  assert.match(takeaway("We found that adrenal outcomes may not improve with treatment."), /adrenal outcomes may not improve/);
});
test("takeaways end at a short clause or whole word and retain the legacy empty fallback", () => {
  const clause = "We found that the treatment reduced side effects in people with diabetes";
  const result = takeaway(`${clause}, while ${"additional ".repeat(35)}outcomes remained uncertain.`);
  assert.equal(result, clause + ".");
  assert.equal(takeaway(`${clause}, with an acceptable safety and tolerability profile ${"additional ".repeat(20)}detail.`), clause + ".");
  assert.equal(takeaway(`We demonstrate that the new tool can make precise cuts at specific locations in human and mouse cells ${"additional ".repeat(20)}detail.`), "We demonstrate that the new tool can make precise cuts at specific locations.");
  const long = takeaway(`We found ${"improved ".repeat(40)}outcomes.`);
  assert.ok(long.split(/\s+/).length <= 30);
  assert.match(long, /improved\.$/);
  assert.doesNotMatch(long, /…/);
  assert.equal(takeaway(""), "");
  assert.equal(takeaway("Methods: We review the background."), "");
  assert.equal(takeaway("Brief note."), "");
});
const p: Paper = {
  id: "a",
  doi: "10/a",
  title: "A finding",
  year: 2020,
  citations: 10,
  relevance: 2,
  authors: [],
  venue: "",
  url: "",
  pdf: "",
  abstract: "",
  takeaway: "",
  theme: "Topic",
  references: [],
  rank: 0,
};
test("finish sanitizes stored abstracts and stale takeaways without mutating input", () => {
  const paper = { ...p, title: "Diffusion image synthesis", abstract: "Diffusion models. docker pull example/model", takeaway: "An unrelated result." };
  const result = finish([paper], "OpenAlex", "diffusion", 1);
  assert.equal(result.papers.length, 1);
  assert.equal(result.papers[0].abstract, "");
  assert.equal(result.papers[0].takeaway, "");
  assert.equal(paper.takeaway, "An unrelated result.");
});
test("candidate vocabulary corrects likely Latin typos without inventing topics", () => {
  const candidates = [
    { ...p, title: "Diffusion models for image generation", abstract: "Diffusion models generate images." },
    { ...p, title: "Conditional diffusion models" },
    { ...p, title: "Modes of transport" },
    { ...p, title: "Quantum computing fundamentals" },
    { ...p, title: "Photosynthesis in plants" },
  ];
  for (const [query, expected] of [
    ["difusion modles", "diffusion models"],
    ["quantm computing", "quantum computing"],
    ["photosynthsis", "photosynthesis"],
  ]) {
    assert.equal(suggestQuery(candidates, query), expected);
    assert.equal(finish(candidates, "Crossref", query, 5).suggestion, expected);
  }
  for (const query of ["asdkjh qwpoe zzxv", "diffusion models", "Quantum computing", "photosynthesis", "机器学习", "", "???!!!"])
    assert.equal(suggestQuery(candidates, query), undefined);
  assert.equal(suggestQuery([], "difusion modles"), undefined);
  assert.equal(suggestQuery([{ ...p, title: "Diffusion" }, { ...p, title: "Models" }], "difusion modles"), undefined);
  assert.equal(finish(candidates, "Crossref", "diffusion models", 5).suggestion, undefined);
});
test("discovery suggests from existing candidates without extra API calls", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return Response.json({ meta: { count: 1 }, results: [{
      id: "test", title: "Diffusion models", publication_year: 2020,
    }] });
  });
  const result = await discover("difusion modles");
  assert.deepEqual(result.papers, []);
  assert.equal(result.suggestion, "diffusion models");
  assert.equal(calls, 3);
});
test("known words require a frequent close neighbor before correction", () => {
  const typo = { ...p, title: "Quantm", abstract: "" };
  assert.equal(suggestQuery([typo, { ...p, title: "Quantum computing", abstract: "" }], "quantm computing"), undefined);
  assert.equal(suggestQuery([typo, {
    ...p, title: "Quantum computing", abstract: "Quantum computing uses quantum effects.",
  }], "quantm computing"), "quantum computing");
  assert.equal(suggestQuery([{ ...typo, title: "Quantm quantm quantm" }, {
    ...p, title: "Quantum computing", abstract: "Quantum states interact with quantum effects and quantum noise.",
  }], "quantm computing"), "quantum computing");
});
test("App dataset refresh preserves raw-candidate suggestions for every source", () => {
  const candidates = [{ ...p, title: "Diffusion models" }];
  for (const source of ["OpenAlex", "Crossref", "Europe PMC"] as const) {
    const discovered = finish(candidates, source, "difusion modles", 1);
    assert.deepEqual(discovered.papers, []);
    assert.equal(discovered.suggestion, "diffusion models");
    const refreshed = refreshDataset(discovered, "difusion modles");
    assert.equal(refreshed.suggestion, "diffusion models", source);
    assert.equal(refreshed.fetchedAt, discovered.fetchedAt);
    assert.equal(refreshed.source, source);
    assert.deepEqual(refreshed.papers, []);
    assert.equal(refreshDataset({ ...discovered, suggestion: undefined }, "asdkjh qwpoe zzxv").suggestion, undefined);
    assert.equal(refreshDataset({ ...discovered, papers: candidates }, "diffusion models").suggestion, undefined);
  }
});
test("real Crossref typo fixtures produce supported corrections without changing correct queries", async (t) => {
  for (const [query, suggestion, count] of [
    ["difusion modles", "diffusion models", 0],
    ["quantm computing", "quantum computing", 0],
    ["photosynthsis", undefined, 3],
    ["diffusion models", undefined, undefined],
    ["sleep and memory", undefined, undefined],
  ] as const) {
    const fixture = (kind: string) => JSON.parse(readFileSync(new URL(
      `./fixtures/crossref-typos/${query.replaceAll(" ", "-")}-${kind}.json`, import.meta.url,
    ), "utf8"));
    const candidates = ["relevance", "cited", "proceedings"].flatMap(kind =>
      fixture(kind).message.items.map((w: { title: string[]; abstract?: string }) => ({
        ...p, title: w.title?.[0] || "", abstract: cleanAbstract(w.abstract),
      })),
    );
    assert.equal(suggestQuery(candidates, query), suggestion, query);
    let calls = 0;
    const mock = t.mock.method(globalThis, "fetch", async (input: string) => {
      calls++;
      const url = new URL(String(input));
      if (url.hostname === "api.openalex.org") return new Response("", { status: 429 });
      return Response.json(fixture(url.searchParams.has("sort") ? "cited" :
        url.searchParams.has("filter") ? "proceedings" : "relevance"));
    });
    const result = await discover(query);
    mock.mock.restore();
    assert.equal(result.suggestion, suggestion, query);
    assert.equal(refreshDataset(result, query).suggestion, suggestion, query);
    if (count !== undefined) assert.equal(result.papers.length, count, query);
    else assert.ok(result.papers.length > 0, query);
    assert.equal(calls, 6, query);
    console.log(`${query}: ${result.papers.length} papers; suggestion: ${result.suggestion || "none"}`);
  }
});
test("Crossref suggestions include citation candidates dropped by the relevance prefilter", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url: string) => {
    calls++;
    if (String(url).includes("openalex")) return new Response("", { status: 503 });
    const cited = new URL(String(url)).searchParams.has("sort");
    return Response.json({ message: { "total-results": 0, items: cited ? [{
      DOI: "10/test", title: ["Diffusion models"], published: { "date-parts": [[2020]] },
    }] : [] } });
  });
  const result = await discover("difusion modles");
  assert.deepEqual(result.papers, []);
  assert.equal(result.suggestion, "diffusion models");
  assert.equal(calls, 6);
});
test("Unicode queries match accents and unspaced Chinese titles", () => {
  assert.ok(matchesQuery({ ...p, title: "基于机器学习的图像研究" }, "机器学习"));
  assert.ok(matchesQuery({ ...p, title: "Protein and proteine folding" }, "protéine"));
  assert.ok(matchesQuery({ ...p, title: "La protéine" }, "proteine"));
  assert.ok(matchesQuery({ ...p, title: "La prote\u0301ine" }, "protéine"));
  assert.ok(!matchesQuery({ ...p, title: "Unrelated work" }, "机器学习"));
  assert.ok(!matchesQuery(p, ""));
});
test("questions match content across title and abstract without accepting unrelated papers", () => {
  const query = "what are the most important papers explaining how diffusion models generate images and why they beat GANs";
  assert.ok(matchesQuery({
    ...p,
    title: "Diffusion for image synthesis",
    abstract: "We generate images and outperform GANs.",
  }, query));
  assert.ok(!matchesQuery({ ...p, title: "Important papers about marine biology" }, query));
  assert.ok(matchesQuery({ ...p, title: "Sleep memory consolidation" }, "what are the best papers about sleep and memory"));
  assert.ok(matchesQuery({ ...p, title: "Sleep improves memory" }, "sleep memory"));
});
test("long query coverage is independent of capitalization", () => {
  const relevant = { ...p, title: "Graph network applications", abstract: "Neural methods for drug discovery" };
  for (const query of ["graph neural network drug discovery", "Graph Neural Network Drug Discovery"]) {
    assert.ok(matchesQuery(relevant, query));
    assert.ok(!matchesQuery({ ...p, title: "Graph drawing algorithms" }, query));
  }
  for (const query of ["graph neural network", "Graph Neural Network"])
    assert.ok(matchesQuery(relevant, query));
});
test("short topic phrases retain meaningful stop words", () => {
  assert.ok(matchesQuery({ ...p, title: "Large language model capabilities" }, "large language models"));
  assert.ok(!matchesQuery({ ...p, title: "Large language corpora" }, "large language models"));
  assert.ok(!matchesQuery({ ...p, title: "Language acquisition" }, "language models"));
  assert.ok(matchesQuery({ ...p, title: "Protein folding analysis" }, "protein folding analysis"));
  assert.ok(!matchesQuery({ ...p, title: "Protein folding" }, "protein folding analysis"));
  assert.ok(matchesQuery({ ...p, title: "Sleep memory" }, "sleep and memory?"));
  assert.ok(matchesQuery({ ...p, title: "Sleep memory" }, "how sleep and memory"));
});
test("rewritten questions retain verbatim matches and require all short content terms", async () => {
  const original = globalThis.fetch;
  try {
    for (const [query, title] of [
      ["a theory of human motivation", "A theory of human motivation"],
      ["sleep and memory?", "Sleep and memory"],
    ]) {
      assert.ok(matchesQuery({ ...p, title }, query));
      globalThis.fetch = (async () => Response.json({
        meta: { count: 1 },
        results: [{ id: "test", title, publication_year: 2020 }],
      })) as typeof fetch;
      assert.equal((await discover(query)).papers.length, 1);
    }
    assert.ok(matchesQuery({ ...p, title: "Motivation", abstract: "A theory" }, "a theory of human motivation"));
    assert.ok(!matchesQuery({ ...p, title: "Sleep alone" }, "sleep and memory?"));
    assert.ok(!matchesQuery({ ...p, title: "Unrelated work" }, "sleep and memory?"));
    assert.ok(matchesQuery({ ...p, title: "Sleep improves memory" }, "sleep memory"));
    assert.ok(!matchesQuery({ ...p, title: "Quantum studies of error correction" }, "quantum error correction theory"));
  } finally {
    globalThis.fetch = original;
  }
});
test("featured topics retain any-order token and metadata matches", () => {
  const previous = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).map((w) => w.length > 4 ? w.replace(/s$/, "") : w).join(" ");
  for (const topic of examples) {
    const data: Dataset = JSON.parse(readFileSync(new URL(`../../public/data/${topic.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`, import.meta.url), "utf8"));
    const terms = previous(topic).split(" ");
    for (const paper of data.papers) {
      const text = new Set(previous(paper.title + " " + paper.abstract).split(" "));
      const topics = new Set(previous((paper.topics || []).join(" ")).split(" "));
      assert.equal(matchesQuery(paper, topic), terms.every((term) => text.has(term)) ||
        terms.every((term) => topics.has(term)), topic);
    }
  }
});
test("Unicode token and topic matching also keeps unspaced titles in Start here", () => {
  const chinese = { ...p, title: "基于图像的方法", topics: ["机器学习与图像分析"] };
  assert.ok(matchesQuery(chinese, "机器学习 图像"));
  assert.ok(!matchesQuery({ ...chinese, topics: [] }, "机器学习 图像"));
  assert.deepEqual(startHere([chinese], "机器学习 图像"), [chinese]);
  assert.ok(matchesQuery({ ...p, title: "La protéine", abstract: "Folding mechanisms" }, "proteine folding"));
});
test("punctuation-only queries reject before contacting either index", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = (async () => { calls++; throw new Error("Unexpected fetch"); }) as typeof fetch;
    for (const query of ["???!!!", "", "   "])
      await assert.rejects(() => discover(query), { message: invalidQueryMessage });
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = original;
  }
});
test("both indexes receive cleaned question content", async () => {
  const original = globalThis.fetch;
  const searches: string[] = [];
  try {
    globalThis.fetch = (async (url) => {
      const parsed = new URL(String(url));
      searches.push(parsed.searchParams.get("search") || parsed.searchParams.get("query") || "");
      return parsed.hostname.includes("openalex")
        ? new Response("", { status: 503 })
        : Response.json({ message: { items: [], "total-results": 0 } });
    }) as typeof fetch;
    assert.deepEqual((await discover("what are the best papers explaining sleep and memory")).papers, []);
    assert.ok(searches.length > 3);
    assert.ok(searches.every((query) => query === "sleep memory"));
  } finally {
    globalThis.fetch = original;
  }
});
test("Crossref citation-ranked results retain Unicode topic matches", async () => {
  const original = globalThis.fetch;
  try {
    for (const [query, title] of [
      ["机器学习", "基于机器学习的图像研究"],
      ["protéine", "La proteine et ses fonctions"],
    ]) {
      let citationRequests = 0;
      globalThis.fetch = (async (url) => {
        const parsed = new URL(String(url));
        if (parsed.hostname.includes("openalex"))
          return new Response("", { status: 503 });
        const cited = parsed.searchParams.get("sort") === "is-referenced-by-count";
        if (cited) citationRequests++;
        return Response.json({ message: {
          "total-results": 0,
          items: cited ? [title, "Unrelated biology"].map((name, i) => ({
            DOI: `10/test-${i}`,
            title: [name],
            published: { "date-parts": [[2020]] },
            "is-referenced-by-count": 1000,
          })) : [],
        } });
      }) as typeof fetch;
      const result = await discover(query);
      assert.equal(result.source, "Crossref");
      assert.equal(citationRequests, 1);
      assert.deepEqual(result.papers.map((paper) => paper.title), [title]);
    }
  } finally {
    globalThis.fetch = original;
  }
});
test("publication years choose earlier dates and never exceed the current year", () => {
  const year = new Date().getFullYear();
  assert.equal(publicationYear(year + 1, year - 1), year - 1);
  assert.equal(publicationYear(year + 1), year);
  assert.equal(publicationYear(), 0);
  assert.equal(publicationYear(NaN, -1, 0), 0);
  assert.equal(finish([{ ...p, year: year + 1 }], "Crossref", "finding", 1).papers[0].year, year);
});
test("themes skip generic words, prefer phrases and cover outliers", () => {
  const papers = ["New study after weight loss with bariatric surgery", "Data review of bariatric surgery effects", "Marine pollution study", "New marine pollution data"].map((title, i) => ({ ...p, id: String(i), title, coherent: false }));
  cluster(papers, "GLP-1 drugs");
  assert.equal(papers[0].theme, "Bariatric surgery");
  assert.equal(papers[2].theme, "Marine pollution");
  assert.ok(papers.every(p => !/^(After|Loss|New|Data|Study|Review|Other)$/.test(p.theme)));
  assert.doesNotThrow(() => cluster([], "test"));
  const sparse = [{ ...p, title: "A unique finding" }];
  cluster(sparse, "finding");
  assert.equal(sparse[0].theme, "Other");
});
test("OpenAlex themes use shared secondary topics and relabel misleading GAN names", () => {
  const titles = ["Denoising Diffusion Probabilistic Models", "Denoising Diffusion Models for Image Generation", "Improved Denoising Diffusion Models", "Image Diffusion Models with Denoising"];
  const papers = titles.map((title, i) => ({ ...p, id: title, doi: "", title,
    theme: i === 0 ? "Other" : "Generative Adversarial Networks and Image Synthesis",
    topics: [i === 0 ? "Probability Theory Research" : "Generative Adversarial Networks and Image Synthesis", "Diffusion Models and Applications"],
  }));
  const result = finish(papers, "OpenAlex", "diffusion models", 4);
  assert.equal(result.papers.length, 4);
  assert.ok(result.papers.every(p => p.theme === "Diffusion Models"));
  const misleading = finish(papers.map(p => ({ ...p, topics: ["Generative Adversarial Networks and Image Synthesis"] })), "OpenAlex", "diffusion models", 4);
  assert.ok(misleading.papers.every(p => /Diffusion/.test(p.theme) && !/Adversarial|Other/.test(p.theme)));
});
test("short theme labels merge duplicates and overlap rescues outliers without guessing", () => {
  const make = (id: string, title: string, theme: string): Paper => ({ ...p, id, doi: "", title, theme });
  const papers = [
    make("a", "Sleep breathing apnea diagnosis", "Sleep Breathing Research"),
    make("b", "Sleep breathing apnea treatment", "Sleep Breathing Techniques"),
    make("c", "Sleep breathing apnea screening", "Sleep Breathing Research"),
    make("d", "Sleep breathing apnea symptoms", "Sleep Breathing Techniques"),
    make("e", "Sleep apnea breathing outcomes", "Other"),
    make("f", "Sleep quantum entanglement", "Other"),
  ];
  const result = finish(papers, "OpenAlex", "sleep", papers.length);
  assert.equal(result.papers.find(p => p.id === "e")?.theme, "Sleep Breathing");
  assert.equal(result.papers.find(p => p.id === "f")?.theme, "Other");
  assert.ok(result.papers.every(p => p.theme.length <= 24 && p.theme.split(/\s+/).length <= 3));
  assert.deepEqual([...new Set(result.papers.map(p => p.theme))].sort(), ["Other", "Sleep Breathing"]);
  assert.deepEqual(finish([], "OpenAlex", "sleep", 0).papers, []);
  const cached = { ...result, fetchedAt: "2020-01-01" };
  const refreshed = refreshDataset(cached, "sleep");
  assert.equal(refreshed.fetchedAt, cached.fetchedAt);
  assert.deepEqual(refreshed.papers.map(p => p.theme), result.papers.map(p => p.theme));
  assert.ok(papers.every(p => p.theme !== "Sleep Breathing"));
  const quantum = finish(["Quantum error correction codes", "Quantum error correction decoding"].map(title => ({ ...p, id: title, doi: "", title, theme: "Unrelated Topic" })), "OpenAlex", "quantum", 2);
  assert.ok(quantum.papers.every(p => p.theme === "Quantum Error Correction"));
});
test("overlap ignores abstract boilerplate and labels end on complete short phrases", () => {
  const papers = [
    "Sleep Breathing Research", "Sleep Breathing Research", "Sleep Breathing Techniques",
    "Heart, Mortality, and Health Research", "Heart, Mortality, and Health Research",
    "Other",
  ].map((theme, i) => ({ ...p, id: String(i), doi: "", title: i < 3 ? `Sleep breathing apnea ${i}` : i < 5 ? `Sleep heart mortality breathing apnea ${i}` : "Sleep quantum entanglement",
    abstract: "We have shown that these results were significantly different between the two proposed methods.", theme }));
  const result = finish(papers, "OpenAlex", "sleep", 6);
  assert.equal(result.papers.find(p => p.id === "5")?.theme, "Other");
  assert.ok(result.papers.some(p => p.theme === "Heart"));
  assert.ok(result.papers.every(p => !/[,;:]$|\b(?:And|Of|In|For|With|The|To)$/.test(p.theme)));
});
test("all bundled themes are short and target snapshots keep Other below fifteen percent at load", () => {
  for (const topic of examples) {
    const name = topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const data = JSON.parse(readFileSync(new URL(`../../public/data/${name}.json`, import.meta.url), "utf8"));
    const refreshed = refreshDataset(data, topic);
    assert.ok(refreshed.papers.every(p => p.theme.length <= 24 && p.theme.split(/\s+/).length <= 3), topic);
    if (["microplastics", "diffusion-models"].includes(name))
      assert.ok(refreshed.papers.filter(p => p.theme === "Other").length / refreshed.papers.length <= 0.15, topic);
    if (name === "diffusion-models") {
      const ddpm = refreshed.papers.find(p => /^Denoising Diffusion Probabilistic Models$/i.test(p.title));
      assert.ok(ddpm && /Diffusion/.test(ddpm.theme), ddpm?.theme);
    }
  }
});
test("non-research types are excluded and weak Crossref records are demoted", () => {
  const research = { ...p, title: "Sleep research", citations: 173, relevance: 1 };
  const news = { ...p, id: "b", doi: "10/b", title: "Sleep news", citations: 7, relevance: 2, year: new Date().getFullYear() };
  assert.equal(finish([news, research], "Crossref", "sleep", 2).papers[0].id, research.id);
  for (const type of ["news", "editorial", "letter", "erratum", "paratext", "comment", "peer-review"]) {
    assert.equal(finish([{ ...research, type }], "OpenAlex", "sleep", 1).papers.length, 0);
  }
  assert.equal(finish([{ ...research, type: "article" }], "OpenAlex", "sleep", 1).papers.length, 1);
  assert.equal(finish([], "Crossref", "sleep", 0).papers.length, 0);
});
test("deduplication, junk filtering, empty results, ranking", () => {
  const d = finish(
    [
      p,
      { ...p, id: "b" },
      { ...p, id: "c", doi: "10/c", title: "Retracted research" },
    ],
    "OpenAlex",
    "finding",
    3,
  );
  assert.equal(d.papers.length, 1);
  assert.ok(d.papers[0].rank > 0);
  assert.deepEqual(finish([], "Crossref", "test", 0).papers, []);
});
test("publication variants deduplicate by title and first-author surname", () => {
  const original = { ...p, title: "GNNExplainer: A finding.", authors: ["Rex Ying"], doi: "", citations: 100 };
  const published = { ...original, id: "published", title: "gnnexplainer A FINDING", doi: "10/published", citations: 90 };
  const newer = { ...published, id: "newer", doi: "10/newer", citations: 120 };
  for (const input of [[original, published, newer], [newer, published, original]]) {
    const d = finish(input, "OpenAlex", "finding", 3);
    assert.equal(d.papers.length, 1);
    assert.equal(d.papers[0].id, "newer");
  }
  assert.equal(finish([original, published], "OpenAlex", "finding", 2).papers[0].id, "published");
  assert.equal(finish([original, { ...published, authors: ["Alex Smith"], year: published.year + 1 }], "OpenAlex", "finding", 2).papers.length, 2);
  assert.equal(finish([{ ...original, authors: [] }, { ...published, authors: [], year: published.year + 1 }], "OpenAlex", "finding", 2).papers.length, 2);
  assert.equal(finish([{ ...p, citations: 1 }, { ...p, citations: 20 }], "OpenAlex", "finding", 2).papers[0].citations, 20);
});
test("matching title and year deduplicate differing or missing authors", () => {
  const original = { ...p, doi: "", title: "AliGraph: A finding", authors: ["Rong Zhu"], citations: 100 };
  const published = { ...original, id: "published", doi: "10/published", title: "aligraph a FINDING.", authors: ["Hongxia Yang"], citations: 90 };
  for (const input of [[original, published], [published, original]]) {
    const papers = finish(input, "OpenAlex", "finding", 2).papers;
    assert.equal(papers.length, 1);
    assert.equal(papers[0].id, "published");
  }
  assert.equal(finish([{ ...original, authors: [] }, { ...published, authors: [] }], "OpenAlex", "finding", 2).papers.length, 1);
  const later = { ...published, id: "later", doi: "10/later", year: published.year + 1, citations: 120 };
  for (const input of [[original, later, published], [published, later, original]]) {
    assert.deepEqual(finish(input, "OpenAlex", "finding", 3).papers.map((paper) => paper.id), ["later"]);
  }
});
test("non-paper work types and retracted records are excluded without hiding research formats", () => {
  const excluded = ["dataset", "paratext", "peer-review", "erratum", "grant", "proposal", "other", "retraction", "software", "supplementary-materials", "study-registration", "conference-abstract"];
  const allowed = ["article", "review", "preprint", "book", "book-chapter", "report", "dissertation", "conference-paper", "data-paper", "software-paper", undefined];
  const make = (workType: string | undefined): Paper => ({ ...p, id: String(workType), doi: `10/${workType}`, title: `A finding ${workType}`, workType });
  assert.deepEqual(finish(excluded.map(make), "OpenAlex", "finding", excluded.length).papers, []);
  assert.equal(finish(allowed.map(make), "OpenAlex", "finding", allowed.length).papers.length, allowed.length);
  assert.deepEqual(finish([{ ...p, retracted: true }], "OpenAlex", "finding", 1).papers, []);
});
test("discovery requests and reads OpenAlex type and retraction metadata", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = (async (url) => {
      const select = new URL(String(url)).searchParams.get("select")?.split(",") || [];
      assert.ok(select.includes("type"));
      assert.ok(select.includes("is_retracted"));
      assert.ok(select.includes("ids"));
      return Response.json({ meta: { count: 3 }, results: [
        { id: "data", title: "A finding", publication_year: 2020, type: "dataset" },
        { id: "retracted", title: "A finding", publication_year: 2020, type: "article", is_retracted: true },
        { id: "paper", title: "A finding", publication_year: 2020, type: "preprint", is_retracted: false, ids: { pmid: "https://pubmed.ncbi.nlm.nih.gov/12345/" } },
      ] });
    }) as typeof fetch;
    const d = await discover("finding");
    assert.deepEqual(d.papers.map((p) => p.id), ["paper"]);
    assert.equal(d.papers[0].workType, "preprint");
    assert.equal(d.papers[0].pmid, "12345");
  } finally {
    globalThis.fetch = original;
  }
});
test("real Crossref CRISPR citation fragments and labels do not become takeaways", () => {
  const review =
    "CRISPR Defenses Prokaryotes can be infected by parasites and pathogens and, like eukaryotes, have evolved systems to protect themselves. Horvath and Barrangou (p. 167 ) review a recently discovered prokaryotic “immune system” characterized by CRISPR—clustered regularly interspaced short palindromic repeats—found in most archaeal and many bacterial species. These crRNAs direct other cas family proteins to homologous nucleic acid targets to effect their destruction.";
  assert.doesNotMatch(takeaway(review), /167|review|infected/);
  assert.equal(
    cleanAbstract(
      "Abstract Background: 167 ) review a recently discovered system. © 2010 AAAS. All rights reserved.",
    ),
    "review a recently discovered system.",
  );
  assert.equal(
    takeaway(
      "Background: In recent years this has become an important research field. We review the history of this important field.",
    ),
    "",
  );
  const multiplex =
    "Genome Editing Clustered regularly interspaced short palindromic repeats (CRISPR) function as part of an adaptive immune system in a range of prokaryotes: Invading phage and plasmid DNA is targeted for cleavage by complementary CRISPR RNAs (crRNAs) bound to a CRISPR-associated endonuclease (see the Perspective by van der Oost ). Cong et al. (p. 819 , published online 3 January) and Mali et al. (p. 823 , published online 3 January) adapted this defense system to function as a genome editing tool in eukaryotic cells.";
  assert.match(takeaway(multiplex), /adapted this defense/);
  assert.doesNotMatch(takeaway(multiplex), /819|823/);
});
test("JATS, encoded tags, copyright and unmatched parentheses are cleaned", () => {
  assert.equal(
    cleanAbstract(
      '<jats:title>Abstract</jats:title><jats:p>We demonstrate improved editing<xref ref-type="bibr">167</xref> in cells (with controls.</jats:p> Copyright 2020 Authors.',
    ),
    "We demonstrate improved editing in cells with controls.",
  );
  assert.equal(
    cleanAbstract(
      "&lt;p&gt;Background: A finding with a stray ) parenthesis.&lt;/p&gt;",
    ),
    "A finding with a stray parenthesis.",
  );
  assert.equal(cleanAbstract(""), "");
  assert.equal(
    takeaway(
      "Horizontal gene transfer in bacteria is important for the spread of antibiotic resistance. Here we show that CRISPR interference prevents conjugation and plasmid transformation in S. epidermidis.",
    ),
    "Here we show that CRISPR interference prevents conjugation and plasmid transformation in S. epidermidis.",
  );
});
test("phrase matching and dominant topical coherence apply to both sources", () => {
  const make = (
    title: string,
    citations: number,
    relevance: number,
  ): Paper => ({
    ...p,
    id: title,
    doi: title,
    title,
    citations,
    relevance,
    theme: "Other",
  });
  const input = [
    make(
      "High-Resolution Image Synthesis with Latent Diffusion Models",
      18000,
      15,
    ),
    make(
      "Adding Conditional Control to Text-to-Image Diffusion Models",
      7800,
      14,
    ),
    make("Denoising Image Diffusion Models", 2000, 14),
    make("Pitfalls in Estimating Jump-Diffusion Models", 180, 17),
    make("Diffusion in Oxides", 2000, 18),
    make("Diffusion Models for Finance", 500, 16),
  ];
  for (const source of ["OpenAlex", "Crossref"] as const) {
    const d = finish(input, source, "diffusion models", 6);
    assert.ok(!d.papers.some((p) => p.title === "Diffusion in Oxides"));
    assert.ok(startHere(d.papers).every((p) => !/Finance|Jump-/.test(p.title)));
    assert.equal(
      d.papers.find((p) => p.title.includes("Jump-"))?.theme,
      "Other",
    );
  }
  assert.equal(finish([p], "OpenAlex", "unmatched phrase", 1).papers.length, 0);
});
test("TV excludes outliers and prioritizes available excerpts", () => {
  const input = Array.from({ length: 20 }, (_, i) => ({
    ...p,
    id: String(i),
    year: 2000 + i,
    rank: 20 - i,
    coherent: i !== 19,
    takeaway: i > 4 ? "A finding." : "",
  }));
  const tour = playThrough(input);
  assert.equal(tour.length, 15);
  assert.equal(tour.filter((p) => p.takeaway).length, 14);
  assert.ok(!tour.some((p) => p.id === "19"));
  assert.ok(tour[0].year <= tour[1].year);
});
test("query tokens match across title and abstract in any order", () => {
  const gcn = {
    ...p,
    title: "Semi-Supervised Classification with Graph Convolutional Networks",
    abstract: "We use neural networks to learn representations of graphs.",
  };
  assert.equal(matchesQuery(gcn, "graph neural networks"), true);
  assert.equal(
    matchesQuery({ ...p, title: "Mechanistic interpretability with a sparse autoencoder" }, "sparse autoencoders mechanistic interpretability"),
    true,
  );
  assert.equal(
    matchesQuery({ ...p, title: "Graph theory in social networks" }, "graph neural networks"),
    false,
  );
  assert.equal(matchesQuery(gcn, ""), false);
  assert.equal(matchesQuery(gcn, "the and of"), false);
});
test("citation-only relevance is neutral and duplicate relevance survives either arrival order", () => {
  const gat = {
    ...p,
    id: "gat",
    doi: "10/gat",
    title: "Graph Attention Networks",
    abstract: "Neural networks for graphs.",
    citations: 28000,
    relevance: -1,
  };
  const others = Array.from({ length: 8 }, (_, i) => ({
    ...p,
    id: `other${i}`,
    doi: `10/other${i}`,
    title: `Graph neural networks application ${i}`,
    relevance: 10 + i,
    citations: 100 + i,
  }));
  const result = finish([...others, gat], "OpenAlex", "graph neural networks", 9);
  assert.ok(startHere(result.papers).some((p) => p.id === "gat"));
  assert.equal(result.papers.find((p) => p.id === "gat")?.relevance, 13.5);
  for (const pair of [[gat, { ...gat, relevance: 20 }], [{ ...gat, relevance: 20 }, gat]]) {
    assert.equal(finish(pair, "OpenAlex", "graph neural networks", 1).papers[0].relevance, 20);
  }
  assert.equal(finish([gat], "OpenAlex", "graph neural networks", 1).papers[0].relevance, 0);
});
test("OpenAlex topics admit GraphSAGE while incidental abstract mentions stay out of Start here", () => {
  const graphsage = {
    ...p,
    title: "Inductive Representation Learning on Large Graphs",
    abstract: "We learn node embeddings by aggregating neighborhood features.",
    topics: ["Advanced Graph Neural Networks"],
  };
  assert.equal(matchesQuery(graphsage, "graph neural networks"), true);
  assert.equal(matchesQuery({ ...graphsage, topics: [] }, "graph neural networks"), false);
  assert.equal(matchesQuery({ ...graphsage, title: "Learning embeddings" }, "graph neural networks"), true);
  const lecun = {
    ...p,
    id: "lecun",
    doi: "10/lecun",
    title: "Gradient-based learning applied to document recognition",
    abstract: "Neural networks use graph representations.",
  };
  assert.equal(matchesQuery(lecun, "graph neural networks"), true);
  assert.deepEqual(startHere([lecun, graphsage], "graph neural networks"), [graphsage]);
  assert.deepEqual(startHere([lecun], "graph neural networks"), []);
  assert.deepEqual(startHere([], "graph neural networks"), []);
});
test("metadata-backed foundational papers survive matching and canon eligibility", () => {
  const attention: Paper = {
    ...p, id: "attention", doi: "10/attention", title: "Attention Is All You Need",
    abstract: "We propose a new Transformer architecture for machine translation.",
    topics: ["Natural Language Processing Techniques", "Topic Modeling", "Transformer", "Language model"],
    citations: 151508, relevance: -1,
  };
  const peers = Array.from({ length: 20 }, (_, i): Paper => ({
    ...p, id: `peer-${i}`, doi: `10/peer-${i}`, title: `Transformer language models ${i}`,
    topics: ["Topic Modeling", "Transformer", "Language model"], relevance: 100 - i,
    citations: 1000 + i,
  }));
  for (const query of ["transformer language models", "transformers"]) {
    assert.equal(matchesQuery(attention, query), true);
    const result = finish([attention, ...peers], "OpenAlex", query, 21);
    assert.ok(result.papers.some(paper => paper.id === "attention"));
    assert.ok(startHere(result.papers, query).some(paper => paper.id === "attention"));
    assert.ok(!startHere([{ ...attention, citations: 5 }, ...peers], query).some(paper => paper.id === "attention"));
    assert.ok(!startHere([{ ...attention, citations: 1018 }, ...peers], query).some(paper => paper.id === "attention"));
    assert.ok(!startHere([{ ...attention, topics: ["Unrelated topic", "Transformer", "Language model"] }, ...peers], query).some(paper => paper.id === "attention"));
    assert.ok(!startHere([{ ...attention, coherent: false }, ...peers], query).some(paper => paper.id === "attention"));
  }
  assert.equal(matchesQuery({ ...attention, topics: [] }, "transformer language models"), false);
  assert.equal(matchesQuery({ ...attention, topics: ["Transformer"] }, "transformer language models"), false);
  const mixed = peers.map((paper, i) => ({ ...paper,
    topics: [i < 10 ? "Vision Transformers" : "Topic Modeling"], relevance: i < 10 ? 110 : 90,
  }));
  assert.ok(startHere([attention, ...mixed], "transformers").some(paper => paper.id === "attention"));
  assert.deepEqual(startHere([attention], ""), []);
});
test("Start here uses relevance-weighted core topics without changing the full list", () => {
  const make = (title: string, topic: string, relevance: number): Paper => ({
    ...p, title, topics: [topic], relevance, coherent: true,
  });
  const smallWorld = make("Collective dynamics of small-world networks", "Complex Networks", 1);
  const gcn = make("Semi-Supervised Classification with Graph Convolutional Networks", "Graph Learning", 80);
  const gat = make("Graph Attention Networks", "Graph Learning", 90);
  const graphsage = make("Inductive Representation Learning on Large Graphs", "Graph Learning", 70);
  const exact = make("Graph Neural Networks", "Another topic", 2);
  const incidental = make("Attention Is All You Need", "Graph Learning", 100);
  const input = [smallWorld, gcn, gat, graphsage, exact, incidental];
  const before = structuredClone(input);
  assert.deepEqual(startHere(input, "graph neural networks"), [gcn, gat, graphsage, exact, smallWorld]);
  assert.deepEqual(input, before);
  assert.deepEqual(startHere(input), input.slice(0, 5));
  assert.deepEqual(startHere(input, ""), []);
  assert.deepEqual(startHere([], "graph neural networks"), []);
  assert.deepEqual(startHere([{ ...exact, topics: [], theme: "Other" }], "graph neural networks").map(p => p.title), [exact.title]);
  const wg1 = make("Climate Change 2021 – The Physical Science Basis", "Climate Science", 1);
  const ecology = make("Ecological and Evolutionary Responses to Recent Climate Change", "Ecology", 1);
  const barriers = make("A framework to diagnose barriers to climate change adaptation", "Adaptation Governance", 90);
  const governance = make("Reframing adaptation: The political nature of climate change adaptation", "Adaptation Governance", 80);
  const wg2 = make("Climate Change 2022 – Impacts, Adaptation and Vulnerability", "Climate Science", 1);
  assert.deepEqual(startHere([wg1, ecology, barriers, governance, wg2], "climate change adaptation"), [barriers, governance, wg2, wg1, ecology]);
  const noisy = Array.from({ length: 30 }, () => make("Networks", "Complex Networks", 1));
  assert.deepEqual(startHere([smallWorld, gcn, gat, graphsage, ...noisy], "graph neural networks"), [gcn, gat, graphsage, smallWorld, noisy[0]]);
});
test("Start here excludes incidental concepts when a distinctive token has topic consensus", () => {
  const broad = "Quantum Computing Algorithms and Architecture";
  const make = (id: string, title: string, abstract: string): Paper => ({ ...p, id, title, abstract, coherent: true, topics: [broad, "Quantum error correction"], topicNames: [broad], relevance: 10 });
  const focused = Array.from({ length: 5 }, (_, i) => make(String(i), `Quantum error correction with codes ${i}`, "Quantum codes protect memories."));
  const adjacent = [make("nisq", "Quantum Computing in the NISQ era", "We discuss quantum error correction."), make("supremacy", "Quantum supremacy", "Quantum error detection is discussed."), make("general", "Quantum computing", "Quantum computing algorithms.")];
  assert.deepEqual(startHere([...adjacent, ...focused], "quantum error correction"), focused);
  assert.deepEqual(startHere([], "quantum error correction"), []);
});
test("distinctive filtering preserves topic-backed titles and abstains without consensus or a unique token", () => {
  const neural = "Advanced Graph Neural Networks";
  const graph = Array.from({ length: 5 }, (_, i) => ({ ...p, id: String(i), title: `Graph networks ${i}`, abstract: "Graph neural networks learn embeddings.", topics: [neural], topicNames: [neural], coherent: true }));
  graph.push({ ...graph[0], id: "extra", title: "Graph networks", abstract: "Graph networks learn embeddings." });
  assert.equal(startHere(graph, "graph neural networks").length, 5);
  const niche = Array.from({ length: 6 }, (_, i) => ({ ...p, id: String(i), title: i ? `Tardigrade genomes ${i}` : "Tardigrade cryptobiosis", abstract: i === 5 ? "Tardigrade genomes." : "Tardigrade cryptobiosis preserves cells.", coherent: true }));
  assert.deepEqual(startHere(niche, "tardigrade cryptobiosis"), niche.slice(0, 5));
  const tied = niche.map(paper => ({ ...paper, abstract: "Tardigrade cryptobiosis preserves cells." }));
  assert.equal(startHere(tied, "tardigrade cryptobiosis").length, 5);
});
test("Start here backfills topic-less records after core qualifiers in rank order", () => {
  const papers = Array.from({ length: 7 }, (_, i): Paper => ({
    ...p, id: String(i), title: `Graph research ${i}`, theme: "Other", topics: [],
  }));
  assert.deepEqual(startHere(papers, "graph neural networks"), papers.slice(0, 5));
  const exact = { ...papers[6], title: "Graph neural networks" };
  assert.deepEqual(startHere([...papers.slice(0, 6), exact], "graph neural networks"), [exact, ...papers.slice(0, 4)]);
  assert.deepEqual(startHere([{ ...papers[0], coherent: false }, { ...papers[1], title: "Unrelated biology" }], "graph neural networks"), []);
  assert.deepEqual(startHere(papers.slice(0, 2), "graph neural networks"), papers.slice(0, 2));
});
test("OpenAlex citation-only records receive neutral relevance during discovery", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = (async (url) => Response.json({
      meta: { count: 2 },
      results: [{
        id: String(url).includes("sort=") ? "gat" : "gnn",
        title: "Graph neural networks",
        publication_year: 2020,
        cited_by_count: String(url).includes("sort=") ? 28000 : 100,
        topics: [{ display_name: "Advanced Graph Neural Networks" }],
        concepts: [{ display_name: "Machine learning" }],
        ...(String(url).includes("sort=") ? {} : { relevance_score: 15 }),
      }],
    })) as typeof fetch;
    const d = await discover("graph neural networks");
    assert.equal(d.papers.find((p) => p.id === "gat")?.relevance, 15);
    assert.deepEqual(d.papers[0].topics, ["Advanced Graph Neural Networks", "Machine learning"]);
    assert.deepEqual(d.papers[0].topicNames, ["Advanced Graph Neural Networks"]);
  } finally {
    globalThis.fetch = original;
  }
});
test("OpenAlex snapshot canons include foundational diffusion, CRISPR and transformer papers", () => {
  const load = (slug: string): Dataset =>
    JSON.parse(
      readFileSync(
        new URL(`../../public/data/${slug}.json`, import.meta.url),
        "utf8",
      ),
    );
  const diffusion = load("diffusion-models");
  for (const topic of examples) {
    const data = load(topic.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
    assert.equal(data.source, topic === "GLP-1 drugs" ? "Europe PMC" : "OpenAlex");
    assert.equal(startHere(data.papers, topic).length, 5, topic);
  }
  const titles = startHere(diffusion.papers, "diffusion models")
    .map((p) => p.title)
    .join(" ");
  assert.equal(startHere(diffusion.papers).length, 5);
  assert.match(titles, /Latent Diffusion/);
  assert.match(titles, /Denoising Diffusion Probabilistic Models/);
  assert.doesNotMatch(titles, /Jump-|Oxides|Finance/i);
  assert.doesNotMatch(
    playThrough(diffusion.papers)
      .map((p) => p.title)
      .join(" "),
    /Jump-|Oxides|Finance/i,
  );
  assert.ok(startHere(load("crispr").papers, "CRISPR").some((p) => /Programmable Dual-RNA/.test(p.title)));
  const transformers = startHere(load("transformers").papers, "transformers");
  assert.equal(transformers.length, 5);
  assert.ok(transformers.some((p) => p.title === "Attention Is All You Need"));
  assert.ok(transformers.some((p) => p.title.startsWith("BERT:")));
  const quantum = startHere(load("quantum-error-correction").papers, "quantum error correction");
  assert.ok(quantum.some(p => /Stabilizer Codes/.test(p.title)));
  assert.ok(quantum.some(p => /surface code threshold/.test(p.title)));
  assert.ok(quantum.every(p => !/NISQ|supremacy|10th Anniversary Edition/i.test(p.title)));
  assert.ok(
    transformers.every(
      (p) =>
        !/power electronics|tapchanging|winding|liquid-filled/i.test(p.title),
    ),
  );
});
test("OpenAlex errors fall back to Crossref, empty is valid, dual failure rejects", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = (async (url) =>
      String(url).includes("openalex")
        ? new Response("", { status: 429 })
        : Response.json({
            message: { items: [], "total-results": 0 },
          })) as typeof fetch;
    assert.equal((await discover("test")).source, "Crossref");
    globalThis.fetch = (async () =>
      new Response("", { status: 503 })) as typeof fetch;
    await assert.rejects(() => discover("test"));
  } finally {
    globalThis.fetch = original;
  }
});
test("Crossref retries throttling and CORS-like network failures with backoff", async (t) => {
  const empty = () => Response.json({ message: { items: [], "total-results": 0 } });
  const originalTimeout = globalThis.setTimeout;
  const delays: number[] = [];
  t.mock.method(globalThis, "setTimeout", ((callback: () => void, delay: number) => {
    delays.push(delay);
    return originalTimeout(callback, 0);
  }) as typeof setTimeout);
  for (const failure of ["429", "network"]) {
    let calls = 0;
    const statuses: string[] = [];
    delays.length = 0;
    t.mock.method(globalThis, "fetch", async (url: string) => {
      if (String(url).includes("openalex")) return new Response("", { status: 503 });
      calls++;
      if (calls <= 2) {
        if (failure === "network") throw new TypeError("Failed to fetch");
        return new Response("", { status: 429, headers: { "retry-after": "3" } });
      }
      return empty();
    });
    assert.equal((await discover("test", (s) => statuses.push(s))).source, "Crossref");
    assert.deepEqual(delays, failure === "429" ? [3000, 5000] : [2000, 5000]);
    assert.ok(statuses.includes("The index is busy · Retrying in 5s…"));
    assert.equal(calls, 5);
  }
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (String(url).includes("openalex")) return new Response("", { status: 503 });
    calls++;
    throw new TypeError("Failed to fetch");
  });
  await assert.rejects(() => discover("test"), RateLimitError);
  assert.equal(calls, 3);
});
test("OpenAlex 429 starts a session cooldown that expires after ten minutes", async (t) => {
  const storage = new Map<string, string>();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) || null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, "sessionStorage", descriptor);
    else Reflect.deleteProperty(globalThis, "sessionStorage");
  });
  let now = 1000000;
  t.mock.method(Date, "now", () => now);
  let openalex = 0;
  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (String(url).includes("openalex")) {
      openalex++;
      return new Response("", { status: 429 });
    }
    return Response.json({ message: { items: [], "total-results": 0 } });
  });
  await discover("first");
  assert.equal(openalex, 3);
  assert.equal(storage.get("pt-openalex-retry-at"), "1600000");
  await discover("second");
  assert.equal(openalex, 3);
  now += 600001;
  await discover("third");
  assert.equal(openalex, 6);
});
test("cancellation aborts all in-flight requests without starting the fallback", async (t) => {
  const controller = new AbortController();
  const signals: AbortSignal[] = [];
  t.mock.method(globalThis, "fetch", (_url: string, options: RequestInit) => {
    const signal = options.signal!;
    signals.push(signal);
    return new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
  });
  const search = discover("test", () => {}, undefined, controller.signal);
  controller.abort();
  await assert.rejects(search, { name: "AbortError" });
  assert.equal(signals.length, 3);
  assert.ok(signals.every((signal) => signal.aborted));
});
test("cancellation interrupts retry backoff and prevents further requests", async (t) => {
  const controller = new AbortController();
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url: string) => {
    calls++;
    return new Response("", { status: String(url).includes("openalex") ? 503 : 429 });
  });
  await assert.rejects(() => discover("test", (status) => {
    if (status.includes("Retrying")) controller.abort();
  }, undefined, controller.signal), { name: "AbortError" });
  assert.equal(calls, 4);
});

const abstractPaper: Paper = { ...p, id: "sleep", doi: "https://doi.org/10.1000/Sleep", title: "Sleep and memory", abstract: "", takeaway: "" };
const sleepAbstract = "We found that sleep significantly improved memory in people after learning a new task.";
function abstractCache() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}
test("runtime abstracts prefer exact Europe PMC DOI matches, clean text, share jobs and cache", async () => {
  const storage = abstractCache(), updated: Paper[] = [], urls: string[] = [];
  const fetcher = (async (url) => {
    urls.push(String(url));
    return Response.json({ resultList: { result: [
      { doi: "10.1000/wrong", abstractText: "The wrong sleep abstract must not be used." },
      { doi: "10.1000/sleep", abstractText: `<p>${sleepAbstract}</p> Copyright 2020 Authors.` },
    ] } });
  }) as typeof fetch;
  const service = createAbstractHydrator({ storage, fetcher, onUpdate: paper => updated.push(paper) });
  await Promise.all([service.enqueue(abstractPaper), service.enqueue({ ...abstractPaper, id: "duplicate" })]);
  assert.equal(urls.length, 1);
  assert.equal(new URL(urls[0]).searchParams.get("query"), 'DOI:"10.1000/sleep"');
  assert.equal(updated.length, 2);
  assert.ok(updated.every(paper => paper.abstract === sleepAbstract && paper.takeaway === takeaway(sleepAbstract)));
  service.abort();
  const cached = createAbstractHydrator({ storage, fetcher: async () => { throw new Error("cached lookup should not fetch"); }, onUpdate: paper => updated.push(paper) });
  await cached.enqueue(abstractPaper);
  assert.equal(updated.length, 3);
});
test("runtime abstracts fall back to Semantic Scholar after errors, mismatches or missing PMC abstracts", async () => {
  for (const response of [
    new Response("", { status: 429 }),
    Response.json({ resultList: { result: [] } }),
    Response.json({ resultList: { result: [{ doi: "10.1000/other", abstractText: sleepAbstract }] } }),
    Response.json({ resultList: { result: [{ doi: "10.1000/sleep", abstractText: "A completely unrelated description of polymer coatings." }] } }),
    new Response("invalid JSON"),
  ]) {
    const urls: string[] = [], updated: Paper[] = [];
    const service = createAbstractHydrator({ storage: abstractCache(), onUpdate: paper => updated.push(paper), fetcher: (async url => {
      urls.push(String(url));
      return urls.length === 1 ? response : Response.json({ abstract: sleepAbstract });
    }) as typeof fetch });
    await service.enqueue(abstractPaper);
    assert.equal(urls.length, 2);
    assert.match(decodeURIComponent(urls[1]), /paper\/DOI:10.1000\/sleep\?fields=abstract$/);
    assert.equal(updated[0].abstract, sleepAbstract);
  }
});
test("runtime abstracts support PMID-only records and skip existing abstracts or absent identifiers", async () => {
  const urls: string[] = [], updated: Paper[] = [];
  const service = createAbstractHydrator({ storage: abstractCache(), onUpdate: paper => updated.push(paper), fetcher: (async url => {
    urls.push(String(url));
    return Response.json({ resultList: { result: [{ source: "MED", id: "12345", abstractText: sleepAbstract }] } });
  }) as typeof fetch });
  await service.enqueue({ ...abstractPaper, abstract: sleepAbstract });
  await service.enqueue({ ...abstractPaper, doi: "", id: "unknown", url: "" });
  assert.equal(urls.length, 0);
  await service.enqueue({ ...abstractPaper, doi: "", pmid: "12345" });
  assert.equal(new URL(urls[0]).searchParams.get("query"), "EXT_ID:12345 AND SRC:MED");
  assert.equal(updated[0].abstract, sleepAbstract);
});
test("runtime abstracts cap concurrent jobs at three", async () => {
  let release!: () => void, active = 0, maximum = 0, calls = 0;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const service = createAbstractHydrator({ storage: abstractCache(), onUpdate: () => {}, fetcher: (async url => {
    calls++; maximum = Math.max(maximum, ++active);
    await gate;
    active--;
    const query = new URL(String(url)).searchParams.get("query")!;
    return Response.json({ resultList: { result: [{ doi: query.slice(5, -1), abstractText: sleepAbstract }] } });
  }) as typeof fetch });
  const pending = Array.from({ length: 7 }, (_, i) => service.enqueue({ ...abstractPaper, id: String(i), doi: `10.1000/sleep${i}` }));
  assert.equal(calls, 3);
  release();
  await Promise.all(pending);
  assert.equal(calls, 7);
  assert.equal(maximum, 3);
});
test("runtime abstract cancellation aborts active requests, clears queued jobs and suppresses updates", async () => {
  let calls = 0;
  const signals: AbortSignal[] = [], updated: Paper[] = [], storage = abstractCache();
  const service = createAbstractHydrator({ storage, onUpdate: paper => updated.push(paper), fetcher: (async (_url, init) => {
    calls++;
    const signal = init!.signal!;
    signals.push(signal);
    return new Promise<Response>((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }));
  }) as typeof fetch });
  const pending = Array.from({ length: 7 }, (_, i) => service.enqueue({ ...abstractPaper, id: String(i), doi: `10.1000/sleep${i}` }));
  service.abort();
  await Promise.all(pending);
  await service.enqueue(abstractPaper);
  assert.equal(calls, 3);
  assert.ok(signals.every(signal => signal.aborted));
  assert.equal(updated.length, 0);
  assert.equal(storage.values.size, 0);
});
test("runtime abstracts fail silently, cache confirmed misses, tolerate storage errors and reject bad cached text", async () => {
  const updated: Paper[] = [], storage = abstractCache();
  let calls = 0;
  const fetcher = (async url => {
    calls++;
    return String(url).includes("europepmc") ? Response.json({ resultList: { result: [] } }) : Response.json({ abstract: null });
  }) as typeof fetch;
  await createAbstractHydrator({ storage, fetcher, onUpdate: paper => updated.push(paper) }).enqueue(abstractPaper);
  await createAbstractHydrator({ storage, fetcher, onUpdate: paper => updated.push(paper) }).enqueue(abstractPaper);
  assert.equal(calls, 2);
  assert.equal(updated.length, 0);
  const failedStorage = abstractCache();
  await createAbstractHydrator({ storage: failedStorage, fetcher: async () => { throw new TypeError("Network error"); }, onUpdate: paper => updated.push(paper) }).enqueue(abstractPaper);
  assert.equal(failedStorage.values.size, 0);
  const brokenStorage = { getItem: () => { throw new Error("Storage blocked"); }, setItem: () => { throw new Error("Storage full"); } };
  await createAbstractHydrator({ storage: brokenStorage, fetcher: async () => Response.json({ resultList: { result: [{ doi: "10.1000/sleep", abstractText: sleepAbstract }] } }), onUpdate: paper => updated.push(paper) }).enqueue(abstractPaper);
  assert.equal(updated.length, 1);
  storage.values.set("pt-abstract-v1:DOI:10.1000/sleep", JSON.stringify("A completely unrelated description of polymer coatings."));
  await createAbstractHydrator({ storage, fetcher, onUpdate: paper => updated.push(paper) }).enqueue(abstractPaper);
  assert.equal(calls, 4);
  assert.equal(updated.length, 1);
});

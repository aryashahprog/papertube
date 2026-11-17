import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  reconstruct,
  takeaway,
  finish,
  discover,
  cleanAbstract,
  matchesQuery,
  startHere,
  playThrough,
  type Dataset,
  type Paper,
} from "./pipeline";
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
  assert.equal(finish([original, { ...published, authors: ["Alex Smith"] }], "OpenAlex", "finding", 2).papers.length, 2);
  assert.equal(finish([{ ...original, authors: [] }, { ...published, authors: [] }], "OpenAlex", "finding", 2).papers.length, 2);
  assert.equal(finish([{ ...p, citations: 1 }, { ...p, citations: 20 }], "OpenAlex", "finding", 2).papers[0].citations, 20);
});
test("non-paper work types and retracted records are excluded without hiding research formats", () => {
  const excluded = ["dataset", "paratext", "peer-review", "erratum", "grant", "proposal", "other", "retraction", "software", "supplementary-materials", "study-registration", "conference-abstract"];
  const allowed = ["article", "review", "preprint", "book", "book-chapter", "report", "dissertation", "conference-paper", "data-paper", "software-paper", undefined];
  const make = (workType: string | undefined): Paper => ({ ...p, id: String(workType), doi: `10/${workType}`, workType });
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
      return Response.json({ meta: { count: 3 }, results: [
        { id: "data", title: "A finding", publication_year: 2020, type: "dataset" },
        { id: "retracted", title: "A finding", publication_year: 2020, type: "article", is_retracted: true },
        { id: "paper", title: "A finding", publication_year: 2020, type: "preprint", is_retracted: false },
      ] });
    }) as typeof fetch;
    const d = await discover("finding");
    assert.deepEqual(d.papers.map((p) => p.id), ["paper"]);
    assert.equal(d.papers[0].workType, "preprint");
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
  assert.equal(matchesQuery({ ...graphsage, title: "Learning embeddings" }, "graph neural networks"), false);
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
  } finally {
    globalThis.fetch = original;
  }
});
test("Crossref snapshot canons remain topical for diffusion, CRISPR and transformers", () => {
  const load = (slug: string): Dataset =>
    JSON.parse(
      readFileSync(
        new URL(`../../public/data/${slug}.json`, import.meta.url),
        "utf8",
      ),
    );
  const diffusion = load("diffusion-models");
  const titles = startHere(diffusion.papers)
    .map((p) => p.title)
    .join(" ");
  assert.equal(startHere(diffusion.papers).length, 5);
  assert.match(titles, /Latent Diffusion/);
  assert.match(titles, /Conditional Control/);
  assert.doesNotMatch(titles, /Jump-|Oxides|Finance/i);
  assert.doesNotMatch(
    playThrough(diffusion.papers)
      .map((p) => p.title)
      .join(" "),
    /Jump-|Oxides|Finance/i,
  );
  assert.ok(
    startHere(load("crispr").papers).every((p) => /CRISPR/i.test(p.title)),
  );
  const transformers = startHere(load("transformers").papers);
  assert.equal(transformers.length, 5);
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

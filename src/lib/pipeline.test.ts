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
  examples,
  invalidQueryMessage,
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
test("featured topics retain main's any-order token and topic matches", () => {
  const previous = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).map((w) => w.length > 4 ? w.replace(/s$/, "") : w).join(" ");
  for (const topic of examples) {
    const data: Dataset = JSON.parse(readFileSync(new URL(`../../public/data/${topic.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`, import.meta.url), "utf8"));
    const terms = previous(topic).split(" ");
    for (const paper of data.papers) {
      const text = new Set(previous(paper.title + " " + paper.abstract).split(" "));
      const title = new Set(previous(paper.title).split(" "));
      const topics = new Set(previous((paper.topics || []).join(" ")).split(" "));
      assert.equal(matchesQuery(paper, topic), terms.every((term) => text.has(term)) ||
        (terms.some((term) => title.has(term)) && terms.every((term) => topics.has(term))), topic);
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

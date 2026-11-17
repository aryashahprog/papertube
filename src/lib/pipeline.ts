export const examples = [
  "diffusion models",
  "CRISPR",
  "retrieval-augmented generation",
  "GLP-1 drugs",
  "longevity",
  "transformers",
  "quantum error correction",
  "microplastics",
];
export const slug = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-");
export const clampQuery = (s: string) =>
  Array.from(s.replace(/[\uD800-\uDFFF]/gu, "")).slice(0, 200).join("");
export interface Paper {
  id: string;
  doi: string;
  pmid?: string;
  title: string;
  year: number;
  citations: number;
  relevance: number;
  authors: string[];
  venue: string;
  url: string;
  pdf: string;
  abstract: string;
  takeaway: string;
  theme: string;
  topics?: string[];
  topicNames?: string[];
  references: string[];
  rank: number;
  coherent?: boolean;
  workType?: string;
  retracted?: boolean;
  type?: string;
}
export interface Dataset {
  papers: Paper[];
  suggestion?: string;
  source: "OpenAlex" | "Crossref" | "Europe PMC";
  fetchedAt: string;
  total: number;
}
type Raw = Record<string, any>;
const mailto = "papertube@users.noreply.github.com";
export function clean(s = "") {
  for (let i = 0; i < 2; i++)
    s = s
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;|&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/&#(x[\da-f]+|\d+);/gi, (_, code: string) => {
        const n =
          code[0].toLowerCase() === "x"
            ? parseInt(code.slice(1), 16)
            : Number(code);
        return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
      });
  return s
    .replace(
      /<(?:[\w-]+:)?(?:xref|ref-list|permissions|copyright-statement)\b[^>]*>[\s\S]*?<\/(?:[\w-]+:)?(?:xref|ref-list|permissions|copyright-statement)>/gi,
      " ",
    )
    .replace(/<[^>]*>/g, " ")
    .replace(/&lt;[^&]*&gt;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function balance(s: string) {
  const chars = [...s],
    stack: number[] = [];
  chars.forEach((c, i) => {
    if (c === "(") stack.push(i);
    else if (c === ")") {
      if (stack.length) stack.pop();
      else chars[i] = "";
    }
  });
  stack.forEach((i) => (chars[i] = ""));
  return chars.join("");
}
export function cleanAbstract(s = "") {
  return balance(
    clean(s)
      .replace(/(?:©|\bcopyright\b)[\s\S]*$/i, "")
      .replace(/\bAll rights reserved\.?[\s\S]*$/i, "")
      .replace(
        /\(\s*(?:p{1,2}\.\s*\d+[\s\S]*?|see (?:the )?(?:Perspective|reference)[^)]*)\)/gi,
        "",
      )
      .replace(/\[\s*\d+(?:[\s,–-]+\d+)*\s*\]/g, "")
      .replace(
        /^(?:\s*(?:abstract|background|introduction|summary)\b\s*[:.–-]?\s*)+/i,
        "",
      )
      .replace(/^\s*(?:\d+\s*[)\].,:;-]\s*)+/, ""),
  )
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
export function reconstruct(index?: Record<string, number[]> | null) {
  const words: string[] = [];
  Object.entries(index || {}).forEach(([word, positions]) =>
    positions.forEach((i) => (words[i] = word)),
  );
  return words.join(" ");
}
function legacyTakeaway(abstract: string, limit = true) {
  const sentences =
    cleanAbstract(abstract)
      .replace(/\b(et al|e\.g|i\.e|Dr|Prof)\./gi, "$1\u2024")
      .replace(/\b([A-Z])\.(?=\s+[a-z])/g, "$1\u2024")
      .match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) || [];
  const ranked = sentences
    .map((s, i) => ({
      text: cleanAbstract(s.replace(/\u2024/g, ".")),
      score:
        (/we (show|find|propose|present|demonstrate)|results|demonstrat|outperform|our (method|approach|results)|reveals?|significant/i.test(
          s,
        )
          ? 5
          : 0) -
        (/^(background|abstract|introduction)|has become|in recent years|is important/i.test(
          s.trim(),
        )
          ? 5
          : 0) +
        Math.min(s.length / 100, 2) -
        i * 0.02,
    }))
    .filter(
      (s) =>
        s.text.length > 35 &&
        !/\b(review|background|has become|in recent years|is important|have evolved|function as part of|can be infected)\b/i.test(
          s.text,
        ),
    )
    .sort((a, b) => b.score - a.score);
  const text = ranked[0]?.text || "";
  return balance(
    limit && text.length > 210 ? text.slice(0, 200).replace(/\s+\S*$/, "") + "…" : text,
  );
}
const layGlossary: [string, string][] = [
  ["glycaemic control", "blood sugar control"],
  ["glycemic control", "blood sugar control"],
  ["cardiovascular", "heart"],
  ["renal", "kidney"],
  ["mortality", "death"],
  ["adverse events", "side effects"],
  ["efficacy", "effectiveness"],
  ["placebo-controlled", "compared with a placebo"],
  ["subjects", "people"],
  ["participants", "people"],
  ["obese people", "people with obesity"],
  ["obese", "with obesity"],
  ["in vivo", "in living animals"],
  ["in vitro", "in the lab"],
  ["bioaccumulate", "build up in the body"],
  ["bioaccumulates", "builds up in the body"],
  ["bioaccumulated", "built up in the body"],
  ["bio-accumulated", "built up in the body"],
  ["trophic levels", "the food chain"],
  ["glucose concentrations", "blood sugar levels"],
  ["glucose control", "blood sugar control"],
  ["hypoglycaemia", "low blood sugar"],
  ["hypoglycemia", "low blood sugar"],
  ["efficacious", "effective"],
  ["genome engineering", "gene editing"],
  ["genome editing", "gene editing"],
  ["genomic manipulation", "changing DNA"],
  ["genetic perturbation", "gene modification"],
  ["eukaryotic cells", "cells with a nucleus"],
  ["marine organisms", "sea life"],
  ["biota", "living things"],
  ["clustered regularly interspaced short palindromic repeats", "CRISPR"],
  ["Cas9-mediated", "Cas9-based"],
  ["elucidate", "understand"],
  ["functional organization of the genome", "organization of DNA"],
  ["embrittlement", "becoming brittle"],
  ["microcracking", "developing tiny cracks"],
  ["microparticles", "tiny particles"],
  ["ingestion", "swallowing"],
  ["hydrophobic", "water-repelling"],
  ["bioavailability", "availability to living things"],
  ["ubiquitous", "widespread"],
  ["can be used to facilitate", "can help with"],
  ["can be categorized as either", "can be grouped as"],
  ["short-acting compounds", "short-acting drugs"],
  ["long-acting compounds", "long-acting drugs"],
  ["short-lived receptor activation", "brief effects"],
  ["activate the GLP-1 receptor continuously", "act continuously"],
];
function plainFinding(text: string) {
  text = text.replace(/^(?:(?:results?(?:\s+shows?)?|conclusions?|interpretation|in summary)\b\s*[:,–—-]?\s*)+/i, "");
  for (const [term, replacement] of layGlossary) {
    text = text.replace(new RegExp(`\\b${term}\\b`, "gi"), match =>
      match === match.toUpperCase() ? replacement.toUpperCase() :
      /^[A-Z]/.test(match) ? replacement[0].toUpperCase() + replacement.slice(1) : replacement);
  }
  const words = text.trim().split(/\s+/);
  if (words.length > 30) {
    const short = words.slice(0, 30).join(" ");
    const boundaries = [...short.matchAll(/[,;:]|\s+(?:and|but|whereas|while|which|by|with|in)\b/g)]
      .filter(match => short.slice(0, match.index).split(/\s+/).length >= 8);
    const boundary = boundaries.filter(match => /^[,;:]/.test(match[0])).at(-1) ??
      boundaries.filter(match => /\b(?:by|with|in)$/.test(match[0])).at(-1) ?? boundaries.at(-1);
    text = short.slice(0, boundary?.index ?? short.length)
      .replace(/(?:\s+\b(?:a|an|the|and|or|of|in|with|by|to|for))+$|[\s,;:.!?]+$/gi, "") + ".";
  }
  return text.replace(/^[a-z]/, letter => letter.toUpperCase());
}
export function takeaway(abstract: string) {
  const cleaned = cleanAbstract(abstract)
    .replace(/(\d)·(?=\d)/g, "$1.")
    .replace(/\b(Interpretation|Conclusions?|Findings|Methods|Funding)\s+(?=[A-Z])/g, ". $1: ")
    .replace(/([.!?])\s*\.+/g, "$1")
    .replace(/\([^()]*\)/g, "")
    .replace(/\[[A-Z][A-Z\d\s-]+[a-z]?\]/g, "")
    .replace(/\b(?:p(?:-value)?|n|HR|OR|RR)\s*[=<>≤≥:]\s*[−-]?(?:\d*\.\d+|\d+)(?:\s*%|\s*[×x]\s*10\s*\^?\s*[−-]?\d+)?/gi, "")
    .replace(/\b(?:HR|OR|RR)\s+\d+(?:\.\d+)?\b/g, "")
    .replace(/\b95%\s*CI\s*[:=]?\s*[−-]?\d*\.?\d+\s*(?:to|[-–])\s*[−-]?\d*\.?\d+/gi, "")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,;:])(?:\s*[,;:])+/g, "$1")
    .replace(/[,;:]\s*([.!?])/g, "$1")
    .replace(/\s+/g, " ");
  const sentences = cleaned
    .replace(/\b(et al|e\.g|i\.e|Dr|Prof)\./gi, "$1\u2024")
    .replace(/\b([A-Z])\.(?=\s+[a-z])/g, "$1\u2024")
    .replace(/(\d)\.(?=\d)/g, "$1\u2024")
    .match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) || [];
  const ranked = sentences.map((sentence, index) => {
    const text = sentence.replace(/\u2024/g, ".").trim();
    const finding = /\b(?:we (?:found|find|show|demonstrate)|results? (?:show|suggest|highlight)|demonstrated?|suggests?|conclusions?|interpretation|in summary|these findings|associated with|reduced|increased|reveals?|outperform)\b/i.test(text);
    const conclusion = /^(?:conclusions?|interpretation|in summary)\b/i.test(text);
    const method = /\b(?:we aimed|this review discusses|methods?|participants were|subjects were|we (?:recruited|enrolled|assessed)|aims? to|these findings are important|future research|further studies)\b/i.test(text);
    return { text, score: Number(finding) * 10 + Number(conclusion) * 3 - Number(method) * 12 - index * 0.02 };
  }).filter(({ text }) => text.length > 35 &&
    !/\b(?:review|background|has become|in recent years|is important|have evolved|function as part of|can be infected)\b/i.test(text))
    .sort((a, b) => b.score - a.score);
  if (!ranked.length) return legacyTakeaway(abstract);
  return plainFinding(ranked[0].score > 0 ? ranked[0].text : legacyTakeaway(cleaned, false));
}
export function cutoff() {
  const d = new Date();
  d.setMonth(d.getMonth() - 18);
  return d.toISOString().slice(0, 10);
}
export function oa(w: Raw): Paper {
  const abstract = validatedAbstract(w.title, reconstruct(w.abstract_inverted_index));
  return {
    id: w.id,
    type: w.type,
    doi: w.doi || "",
    pmid: String(w.ids?.pmid || "").match(/(?:^|\/)(\d+)\/?$/)?.[1],
    title: clean(w.title),
    year: publicationYear(w.publication_year, Number(w.publication_date?.slice(0, 4))),
    citations: w.cited_by_count || 0,
    relevance: w.relevance_score ?? -1,
    authors: (w.authorships || [])
      .map((a: Raw) => a.author?.display_name)
      .filter(Boolean),
    venue: w.primary_location?.source?.display_name || "",
    url: w.doi || w.primary_location?.landing_page_url || w.id,
    pdf: w.best_oa_location?.pdf_url || "",
    abstract,
    takeaway: takeaway(abstract),
    theme: w.primary_topic?.display_name || "Other",
    topics: [...(w.topics || []), ...(w.concepts || [])]
      .map((t: Raw) => clean(t.display_name))
      .filter(Boolean),
    topicNames: (w.topics || []).map((t: Raw) => clean(t.display_name)).filter(Boolean),
    workType: w.type,
    retracted: w.is_retracted,
    references: w.referenced_works || [],
    rank: 0,
  };
}
export function publicationYear(...years: number[]) {
  const valid = years.filter(y => Number.isInteger(y) && y > 0);
  return valid.length ? Math.min(new Date().getFullYear(), ...valid) : 0;
}
export function cross(w: Raw): Paper {
  const abstract = validatedAbstract(w.title?.[0], w.abstract);
  const doi = w.DOI || "";
  return {
    id: "https://doi.org/" + doi,
    type: w.type,
    doi,
    title: clean(w.title?.[0]),
    year: publicationYear(...[w.published, w["published-online"], w["published-print"], w.issued].map(d => d?.["date-parts"]?.[0]?.[0])),
    citations: w["is-referenced-by-count"] || 0,
    relevance: w.score || 0,
    authors: (w.author || []).map((a: Raw) =>
      [a.given, a.family].filter(Boolean).join(" "),
    ),
    venue: w["container-title"]?.[0] || "",
    url: w.URL || "https://doi.org/" + doi,
    pdf: "",
    abstract,
    takeaway: takeaway(abstract),
    theme: "Other",
    references: [],
    rank: 0,
  };
}
const stop = new Set(
  "a an the and or of to in on for with by from using based new study analysis research model models approach via as at is are we this that into its it paper review human method methods application applications comparison improved improving estimation introduction results framework system systems after loss use effect effects studies reviews data may more than does what how say over under among through during have has can could should their our these those remains remain associated association role impact impacts potential recent advances".split(
    " ",
  ),
);
const words = (s: string) =>
  clean(s)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const normalized = (s: string) =>
  words(s)
    .split(/\s+/)
    .map((w) => (w.length > 4 ? w.replace(/s$/, "") : w))
    .join(" ");
function queryTokens(query: string) {
  const ignored = new Set(
    "a an the and or of to in on for with by from using via as at is are this that into its it".split(" "),
  );
  return normalized(contentQuery(query))
    .split(" ")
    .filter((t) => t && !ignored.has(t));
}
const contains = (text: string, term: string) =>
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u.test(term)
    ? text.includes(term)
    : (" " + text + " ").includes(" " + term + " ");
export function validatedAbstract(title = "", value = "") {
  if (/```|\b(?:docker\s+(?:run|pull|build|compose)|pip3?\s+install|python\s+-m\s+pip\s+install|npm\s+(?:install|ci)|git\s+clone)\b/i.test(value) ||
      /(?:^|\n)\s*(?:#{1,6}\s*|\d+(?:\.\d+)*[.)]?\s+)?(?:usage|installation|getting started|system requirements|how to (?:use|install))\s*(?:[:\n]|$)/i.test(value)) return "";
  const abstract = cleanAbstract(value);
  const terms = normalized(title).split(" ").filter(t => t.length >= 2 && /\p{L}/u.test(t) && !stop.has(t) && !stop.has(t + "s"));
  return terms.some(term => contains(normalized(abstract), term)) ? abstract : "";
}
const filler = new Set([
  ...stop,
  ..."what how why who which when where do does did can could would should be been being was were most important best key papers explain explaining explained about tell me us please they their than beat etc".split(" "),
]);
function isContentQuery(query: string) {
  const tokens = words(query).split(" ");
  return tokens.length > 4 || query.includes("?") ||
    /^(what|how|why|which|who|when|where|is|are|can|does|do)$/.test(tokens[0]);
}
function contentQuery(query: string) {
  if (examples.some((topic) => words(topic) === words(query))) return query;
  if (!isContentQuery(query)) return query;
  const tokens = words(query).split(" ");
  const terms = tokens.filter((word) => !filler.has(word));
  return terms.join(" ") || words(query);
}
export const invalidQueryMessage =
  "Type a topic in words — like “sleep and memory”.";
export function matchesQuery(p: Paper, query: string) {
  const terms = [...new Set(queryTokens(query))];
  if (!terms.length) return false;
  const texts = [p.title, p.abstract].map(normalized);
  if (texts.some((text) => contains(text, normalized(query)))) return true;
  const required = isContentQuery(query) && terms.length > 3
    ? Math.ceil(terms.length * 0.6)
    : terms.length;
  const topics = normalized((p.topics || []).join(" "));
  return terms.filter((term) => contains(texts.join(" "), term)).length >= required ||
    terms.every((term) => contains(topics, term));
}
function editDistance(a: string, b: string) {
  const rows = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0),
  );
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + Number(a[i - 1] !== b[j - 1]),
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
    }
  return rows[a.length][b.length];
}
export function suggestQuery(papers: Paper[], query: string) {
  const phrase = words(query);
  if (!phrase || !/^[\p{Script=Latin}\p{N} ]+$/u.test(phrase) ||
    papers.some((paper) => matchesQuery(paper, query))) return;
  const frequency = new Map<string, number>();
  const abstractFrequency = new Map<string, number>();
  for (const paper of papers) {
    for (const [text, counts] of [
      [paper.title + " " + paper.abstract, frequency],
      [paper.abstract, abstractFrequency],
    ] as const)
      for (const word of words(text).split(" "))
        if (/^\p{Script=Latin}{3,32}$/u.test(word))
          counts.set(word, (counts.get(word) || 0) + 1);
  }
  const known = new Set([...frequency.keys()].map(normalized));
  const dominates = (candidate: string, word: string, counts: Map<string, number>) =>
    (counts.get(candidate) || 0) >= Math.max(3, (counts.get(word) || 0) * 3);
  let changed = false;
  const corrected = phrase.split(" ").map((word) => {
    if (!/^\p{Script=Latin}{3,32}$/u.test(word)) return word;
    const limit = word.length <= 4 ? 1 : 2;
    let best = word, distance = limit + 1, count = 0;
    for (const [candidate, n] of frequency) {
      if (Math.abs(candidate.length - word.length) > limit) continue;
      if (normalized(candidate) === normalized(word)) continue;
      if (known.has(normalized(word)) &&
        !dominates(candidate, word, frequency) &&
        !dominates(candidate, word, abstractFrequency)) continue;
      const d = editDistance(word, candidate);
      if (d <= limit && (d < distance || (d === distance && n > count))) {
        best = candidate;
        distance = d;
        count = n;
      }
    }
    if (best !== word) changed = true;
    return best;
  }).join(" ");
  if (changed && papers.some((paper) => matchesQuery(paper, corrected))) return corrected;
}
export function coherence(papers: Paper[], query: string) {
  const ignored = new Set(
    [...stop].map(normalized).concat(normalized(query).split(" ")),
  );
  const tokens = (s: string) =>
    new Set(
      normalized(s)
        .split(" ")
        .filter((w) => w.length > 2 && !ignored.has(w)),
    );
  const seeds = [...papers]
    .filter((p) => p.citations > 0)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 80);
  const vectors = seeds.map((p) =>
    tokens(p.title + " " + (p.theme === "Other" ? "" : p.theme)),
  );
  const parent = seeds.map((_, i) => i);
  const root = (i: number): number =>
    parent[i] === i ? i : (parent[i] = root(parent[i]));
  for (let i = 0; i < seeds.length; i++)
    for (let j = 0; j < i; j++) {
      const common = [...vectors[i]].filter((w) => vectors[j].has(w)).length;
      if (
        common / Math.sqrt(Math.max(1, vectors[i].size * vectors[j].size)) >=
        0.17
      )
        parent[root(i)] = root(j);
    }
  const groups = new Map<number, number[]>();
  seeds.forEach((_, i) => {
    const r = root(i);
    groups.set(r, [...(groups.get(r) || []), i]);
  });
  const score = (ids: number[]) =>
    ids.reduce(
      (s, i) =>
        s +
        Math.sqrt(Math.log1p(seeds[i].citations)) *
          (1 +
            seeds[i].relevance / Math.max(1, ...seeds.map((p) => p.relevance))),
      0,
    );
  const dominant = [...groups.values()]
    .filter((g) => g.length >= 2)
    .sort((a, b) => score(b) - score(a))[0];
  if (!dominant) {
    papers.forEach((p) => (p.coherent = true));
    return;
  }
  const frequency = new Map<string, number>();
  dominant.forEach((i) =>
    vectors[i].forEach((word) =>
      frequency.set(word, (frequency.get(word) || 0) + 1),
    ),
  );
  const keywords = new Set(
    [...frequency].filter(([, n]) => n >= 2).map(([word]) => word),
  );
  const themes = new Set(
    dominant.map((i) => seeds[i].theme).filter((t) => t !== "Other"),
  );
  papers.forEach((p) => {
    p.coherent =
      themes.has(p.theme) ||
      [...tokens(p.title)].some((w) => keywords.has(w)) ||
      [...tokens(p.abstract)].filter((w) => keywords.has(w)).length >= 3;
    if (!p.coherent) p.theme = "Other";
  });
}
export function startHere(papers: Paper[], query?: string) {
  const terms = query === undefined ? [] : queryTokens(query);
  const topic = (p: Paper) => p.topics?.[0] || p.theme;
  const frequencies = [...new Set(terms)].map(term => ({ term, count: papers.filter(p => contains(normalized(p.title + " " + p.abstract), term)).length }))
    .sort((a, b) => a.count - b.count);
  const distinctive = frequencies.length > 1 && frequencies[0].count < frequencies[1].count ? frequencies[0].term : undefined;
  const focused = (p: Paper) => !distinctive || contains(normalized(p.title + " " + (p.topicNames || [topic(p)]).join(" ")), distinctive);
  const consensus = papers.filter(focused).length > papers.length / 2;
  const scores = new Map<string, number>();
  [...papers]
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 20)
    .forEach((p) => {
      const name = topic(p);
      if (name && name !== "Other")
        scores.set(name, (scores.get(name) || 0) + Math.max(1, p.relevance));
    });
  const strongest = Math.max(0, ...scores.values());
  const core = new Set([...scores].filter(([, score]) => score === strongest).map(([name]) => name));
  const substantial = new Set([...scores].filter(([, score]) => score >= strongest / 2).map(([name]) => name));
  const citations = papers.map((p) => p.citations).sort((a, b) => a - b);
  const influential = Math.max(1000, citations[Math.floor(citations.length * 0.99)] || 0);
  const foundational = (p: Paper) => terms.length > 0 &&
    p.citations >= influential &&
    (p.topics || []).some((name) => substantial.has(name)) &&
    terms.every((term) => contains(normalized((p.topics || []).join(" ")), term));
  const eligible = papers.filter((p) =>
    p.coherent !== false &&
    (query === undefined || terms.some((t) => contains(normalized(p.title), t)) || foundational(p)),
  );
  const qualified = eligible.filter((p) => query === undefined ||
    core.has(topic(p)) || foundational(p) || terms.every((t) => contains(normalized(p.title), t)));
  const ranked = [...qualified, ...eligible.filter((p) => !qualified.includes(p))];
  return (consensus ? [...ranked.filter(focused), ...ranked.filter(p => !focused(p))] : ranked).slice(0, 5);
}
export function playThrough(papers: Paper[]) {
  return papers
    .filter((p) => p.coherent !== false)
    .sort(
      (a, b) => Number(!!b.takeaway) - Number(!!a.takeaway) || b.rank - a.rank,
    )
    .slice(0, 15)
    .sort((a, b) => a.year - b.year);
}
export function cluster(papers: Paper[], query: string) {
  const ignored = new Set([...stop, ...query.toLowerCase().split(/[^a-z]+/),
    ..."glucagon like peptide receptor receptors agonist agonists type".split(" ")]);
  const tokens = (p: Paper) => {
    const words = p.title.toLowerCase().match(/[a-z]{3,}/g) || [];
    const valid = (w: string) => !ignored.has(w);
    return [...new Set(words.flatMap((_, i) => [1, 2, 3].flatMap(size => {
      const phrase = words.slice(i, i + size);
      const label = phrase.join(" ");
      return phrase.length === size && label.length <= 24 && phrase.every((w, j) => valid(w) || (size > 1 && j === size - 1 && w === "loss")) ? [label] : [];
    })))];
  };
  const freq = new Map<string, number>();
  papers.forEach((p) =>
    tokens(p).forEach((w) => freq.set(w, (freq.get(w) || 0) + 1)),
  );
  const labels: string[] = [];
  const uncovered = new Set(papers);
  const terms = new Map(papers.map(p => [p, new Set(tokens(p))]));
  while (labels.length < 7) {
    const candidates = [...freq].filter(([w, n]) => n >= 2 && !labels.includes(w));
    const counts = new Map<string, number>();
    for (const p of uncovered) for (const w of terms.get(p)!) counts.set(w, (counts.get(w) || 0) + 1);
    const coverage = (w: string) => counts.get(w) || 0;
    const weight = (label: string) => 1 + 0.4 * (label.split(" ").length - 1);
    candidates.sort(([a], [b]) => coverage(b) * weight(b) - coverage(a) * weight(a));
    const label = candidates[0]?.[0];
    if (!label || coverage(label) < 2) break;
    labels.push(label);
    for (const p of uncovered) if (terms.get(p)!.has(label)) uncovered.delete(p);
  }
  papers.forEach((p) => {
    const words = tokens(p);
    const label = labels
      .filter((w) => words.includes(w))
      .sort(
        (a, b) =>
          Math.log(papers.length / (freq.get(b) || 1)) -
          Math.log(papers.length / (freq.get(a) || 1)),
      )[0];
    p.theme = label ? label[0].toUpperCase() + label.slice(1) : "Other";
  });
}
const themeGeneric = new Set("research technique techniques study studies applications methods method analysis approach approaches model models network networks generative not was were been being which who whose when where while between also both such other different however there all each including used uses present proposed propose show shown show demonstrate demonstrated provide provides compared obtained found significant significantly well two three first second one many much most some several further respectively across within without only".split(" "));
const themeWord = (word: string) => word.replace(/s$/, "");
const themeTokens = (text: string, query = "") => {
  const ignored = new Set([...stop, ...(query.toLowerCase().match(/[a-z]{3,}/g) || []), ...themeGeneric].map(themeWord));
  return new Set((text.toLowerCase().match(/[a-z]{3,}/g) || [])
    .map(themeWord).filter(w => !ignored.has(w)));
};
function shortTheme(name: string) {
  const trimmed = name.replace(/\s+(?:and\s+)?(?:research|techniques?|studies|and applications|applications|methods?|analysis)$/gi, "")
    .split(/\s+(?:and|&)\s+|[,;:]/i)[0].trim();
  const words = trimmed.split(/\s+/);
  if (words.length > 3 || trimmed.length > 24) return "";
  while (words.length && /^(and|of|in|for|with|the|to|augmented|based|guided|assisted)$/i.test(words.at(-1)!)) words.pop();
  return words.map(w => /^[A-Z\d-]+$/.test(w) ? w : w[0]?.toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}
function consensusTopics(papers: Paper[]) {
  const choices = (p: Paper) => [...new Set(p.topics?.slice(0, 3).filter(Boolean) || [])];
  const counts = new Map<string, number>();
  papers.forEach(p => choices(p).forEach(t => counts.set(t, (counts.get(t) || 0) + 1)));
  papers.forEach(p => {
    p.theme = choices(p).sort((a, b) => counts.get(b)! - counts.get(a)!)[0] || p.theme;
  });
}
function mapThemes(papers: Paper[], source: Dataset["source"], query: string) {
  if (source !== "OpenAlex") cluster(papers, query);
  const groups = new Map<string, Paper[]>();
  papers.forEach(p => groups.set(p.theme, [...(groups.get(p.theme) || []), p]));
  for (const [name, members] of groups) {
    if (name === "Other") continue;
    let label = shortTheme(name);
    const words = themeTokens(label);
    const fit = members.filter(p => {
      const text = themeTokens(p.title + " " + p.abstract);
      return words.size && [...words].some(w => text.has(w));
    }).length / members.length;
    if (!label || fit < 0.3) {
      const copies = members.map(p => ({ ...p }));
      cluster(copies, "");
      const counts = new Map<string, number>();
      copies.filter(p => p.theme !== "Other").forEach(p => counts.set(p.theme, (counts.get(p.theme) || 0) + 1));
      label = shortTheme([...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || "Other");
    }
    members.forEach(p => p.theme = label || "Other");
  }
  const counts = new Map<string, number>();
  papers.forEach(p => counts.set(p.theme, (counts.get(p.theme) || 0) + 1));
  const keep = [...counts].filter(([name, n]) => name !== "Other" && n >= 2)
    .sort((a, b) => b[1] - a[1]).slice(0, 7).map(([name]) => name);
  const vectors = new Map(papers.map(p => [p, themeTokens(p.title + " " + p.abstract, query)]));
  const profiles = keep.map(name => {
    const members = papers.filter(p => p.theme === name && p.coherent !== false);
    const frequency = new Map<string, number>();
    members.forEach(p => vectors.get(p)!.forEach(w => frequency.set(w, (frequency.get(w) || 0) + 1)));
    return { name, members: members.length, frequency };
  });
  papers.forEach(p => {
    if (keep.includes(p.theme) && p.coherent !== false) return;
    const matches = profiles.map(profile => {
      const shared = [...vectors.get(p)!].filter(w => (profile.frequency.get(w) || 0) >= 2);
      const score = shared.length < 2 ? 0 : shared.reduce((sum, w) =>
        sum + (profile.frequency.get(w) || 0) / Math.max(1, profile.members), 0) / Math.sqrt(Math.max(1, vectors.get(p)!.size));
      return { name: profile.name, score };
    }).sort((a, b) => b.score - a.score);
    p.theme = matches[0]?.score > 0 ? matches[0].name : "Other";
    if (p.theme !== "Other") p.coherent = true;
  });
}
export function finish(
  input: Paper[],
  source: Dataset["source"],
  query: string,
  total: number,
  candidates: Paper[] = input,
): Dataset {
  const excludedTypes = new Set([
    "dataset", "paratext", "peer-review", "erratum", "other", "retraction",
    "software", "supplementary-materials", "study-registration",
    "conference-abstract", "grant", "proposal",
  ]);
  const unique = new Map<string, Paper>();
  input
    .map(p => {
      const abstract = validatedAbstract(p.title, p.abstract);
      return { ...p, abstract, takeaway: takeaway(abstract) };
    })
    .filter(
      (p) =>
        p.title &&
        !/^(news|editorial|letter|erratum|paratext|comment|peer-review)$/i.test(p.type || "") &&
        p.year > 0 &&
        !p.retracted &&
        !excludedTypes.has(p.workType || "") &&
        matchesQuery(p, query) &&
        !/\b(retract(ed|ion)|erratum|corrigendum|correction to|table of contents|front matter|back matter|editorial board|references|notations|review (for|of))\b/i.test(
          p.title,
        ),
    )
    .forEach((p) => {
      const k = (p.doi || p.id).toLowerCase().replace("https://doi.org/", "");
      const existing = unique.get(k);
      if (!existing || p.citations > existing.citations)
        unique.set(k, { ...p, year: publicationYear(p.year), relevance: Math.max(p.relevance, existing?.relevance ?? -1) });
      else existing.relevance = Math.max(existing.relevance, p.relevance);
    });
  const publications: { paper: Paper; titles: Set<string> }[] = [];
  const compactTitle = (s: string) =>
    clean(s).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  for (const p of unique.values()) {
    const author = (p.authors[0] || "").trim();
    const surname = author.includes(",")
      ? author.split(",")[0]
      : author.split(/\s+/).at(-1) || "";
    const title = compactTitle(p.title);
    const keys = [title + ":year:" + p.year];
    if (surname) keys.push(title + ":author:" + compactTitle(surname));
    const matches = publications.filter((group) => keys.some((key) => group.titles.has(key)));
    let candidate = p;
    const titles = new Set(keys);
    for (const group of matches) {
      for (const key of group.titles) titles.add(key);
      const existing = group.paper;
      const relevance = Math.max(candidate.relevance, existing.relevance);
      if (Number(!!existing.doi) > Number(!!candidate.doi) ||
          (!!existing.doi === !!candidate.doi && existing.citations > candidate.citations))
        candidate = existing;
      candidate = { ...candidate, relevance };
      publications.splice(publications.indexOf(group), 1);
    }
    publications.push({ paper: { ...candidate }, titles });
  }
  const papers = publications.map((group) => group.paper);
  const scores = papers
    .map((p) => p.relevance)
    .filter((r) => r >= 0)
    .sort((a, b) => a - b);
  const middle = Math.floor(scores.length / 2);
  const neutral = scores.length
    ? (scores[middle] + scores[Math.floor((scores.length - 1) / 2)]) / 2
    : 0;
  papers.forEach((p) => {
    if (p.relevance < 0) p.relevance = neutral;
  });
  const maxR = Math.max(1, ...papers.map((p) => p.relevance));
  const maxC = Math.max(1, ...papers.map((p) => Math.log1p(p.citations)));
  const velocity = (p: Paper) =>
    Math.log1p(
      p.citations / Math.max(1, new Date().getFullYear() - p.year + 1),
    );
  const maxV = Math.max(1, ...papers.map(velocity));
  papers.forEach(
    (p) =>
      (p.rank =
        ((0.4 * p.relevance) / maxR +
        (0.4 * Math.log1p(p.citations)) / maxC +
          (0.2 * velocity(p)) / maxV) *
        (source === "Crossref" ? 0.15 + 0.85 * p.citations / (p.citations + 20) : 1)),
  );
  papers.sort((a, b) => b.rank - a.rank);
  if (source === "OpenAlex") consensusTopics(papers);
  coherence(papers, query);
  mapThemes(papers, source, query);
  const suggestion = papers.length ? undefined : suggestQuery(candidates, query);
  return { papers, source, total, fetchedAt: new Date().toISOString(),
    ...(suggestion ? { suggestion } : {}),
  };
}
export function refreshDataset(data: Dataset, query: string): Dataset {
  const refreshed = finish(data.papers, data.source, query, data.total);
  return {
    ...refreshed,
    fetchedAt: data.fetchedAt,
    ...(!refreshed.papers.length && data.suggestion ? { suggestion: data.suggestion } : {}),
  };
}
export class RateLimitError extends Error {}
const cooldownKey = "pt-openalex-retry-at";
function pause(ms: number, signal?: AbortSignal) {
  signal?.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
}
async function json(
  url: string,
  progress: (s: string) => void,
  signal?: AbortSignal,
): Promise<any> {
  const crossref = url.startsWith("https://api.crossref.org/");
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted();
    let response: Response | undefined;
    try {
      response = await fetch(url, {
        signal: AbortSignal.any([
          AbortSignal.timeout(20000),
          ...(signal ? [signal] : []),
        ]),
      });
    } catch (error) {
      signal?.throwIfAborted();
      if (!crossref || !(error instanceof TypeError)) throw error;
    }
    signal?.throwIfAborted();
    if (response?.status !== 429 && response) {
      if (!response.ok) throw new Error(`Index returned ${response.status}`);
      return response.json();
    }
    if (!crossref) {
      try { sessionStorage.setItem(cooldownKey, String(Date.now() + 600000)); } catch {}
      throw new RateLimitError("Index returned 429");
    }
    if (attempt >= 2) throw new RateLimitError("Index is busy");
    const retryAfter = response?.headers.get("retry-after");
    const seconds = retryAfter
      ? Number.isFinite(Number(retryAfter))
        ? Number(retryAfter)
        : (Date.parse(retryAfter) - Date.now()) / 1000
      : 0;
    const delay = Math.max(attempt === 0 ? 2 : 5, seconds || 0);
    progress(`The index is busy · Retrying in ${Math.ceil(delay)}s…`);
    await pause(delay * 1000, signal);
  }
}
export async function discover(
  query: string,
  progress: (s: string, partial?: Dataset) => void = () => {},
  key?: string,
  signal?: AbortSignal,
): Promise<Dataset> {
  if (!words(query)) throw new Error(invalidQueryMessage);
  const searchQuery = contentQuery(query);
  let rateLimited = false;
  const request = async (url: string) => {
    try {
      return await json(url, progress, signal);
    } catch (error) {
      signal?.throwIfAborted();
      if (error instanceof RateLimitError) rateLimited = true;
      if (rateLimited) throw new RateLimitError("Index is busy");
      throw error;
    }
  };
  signal?.throwIfAborted();
  progress("Searching OpenAlex…");
  try {
    let coolingDown = false;
    try { coolingDown = Number(sessionStorage.getItem(cooldownKey)) > Date.now(); } catch {}
    if (coolingDown) throw new RateLimitError("OpenAlex is busy");
    const select =
      "id,doi,ids,title,publication_year,publication_date,cited_by_count,relevance_score,authorships,primary_location,best_oa_location,primary_topic,topics,concepts,abstract_inverted_index,referenced_works,type,is_retracted";
    const params = (extra: Record<string, string>) =>
      "https://api.openalex.org/works?" +
      new URLSearchParams({
        search: searchQuery,
        select,
        mailto,
        ...(key ? { api_key: key } : {}),
        ...extra,
      });
    let accumulated: Paper[] = [];
    let total = 0;
    const all = await Promise.allSettled(
      [
        { "per-page": "100" },
        { "per-page": "50", sort: "cited_by_count:desc" },
        {
          "per-page": "25",
          sort: "cited_by_count:desc",
          filter: "from_publication_date:" + cutoff(),
        },
      ].map(async (extra) => {
        const d = await request(params(extra as Record<string, string>));
        signal?.throwIfAborted();
        total = Math.max(total, d.meta?.count || 0);
        accumulated = accumulated.concat(d.results.map(oa));
        const partial = finish(accumulated, "OpenAlex", query, total);
        progress(
          `Found ${partial.papers.length} papers · Mapping themes…`,
          partial,
        );
        return d;
      }),
    );
    signal?.throwIfAborted();
    if (all.every((r) => r.status === "rejected"))
      throw new Error("OpenAlex unavailable");
    const result = finish(accumulated, "OpenAlex", query, total);
    progress(
      `Mapped ${new Set(result.papers.map((p) => p.theme)).size} themes · Selecting abstract excerpts…`,
      result,
    );
    return result;
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof RateLimitError) rateLimited = true;
    progress("OpenAlex unavailable · Searching the backup index…");
    const base =
      "https://api.crossref.org/works?" +
      new URLSearchParams({
        query: searchQuery,
        rows: "100",
        select:
          "DOI,type,title,author,published,published-online,published-print,issued,container-title,is-referenced-by-count,abstract,URL,link,score",
        mailto,
      });
    const d = await request(base);
    let works = d.message.items.map(cross) as Paper[];
    const candidates = [...works];
    progress(
      `Found ${works.length} records · Checking influential papers…`,
      finish(works, "Crossref", query, d.message["total-results"]),
    );
    try {
      const cited = await request(
        base + "&sort=is-referenced-by-count&order=desc",
      );
      const terms = normalized(searchQuery).split(" ").filter(Boolean);
      const citedWorks = cited.message.items.map(cross) as Paper[];
      candidates.push(...citedWorks);
      const extra = citedWorks.filter(
        (p) =>
          terms.filter((t) => contains(normalized(p.title), t)).length >=
          Math.max(1, Math.ceil(terms.length * 0.6)),
      );
      works = works.concat(extra);
    } catch { signal?.throwIfAborted(); }
    try {
      const proceedings = await request(base + "&filter=type:proceedings-article");
      const extra = proceedings.message.items.map(cross) as Paper[];
      candidates.push(...extra);
      works = works.concat(extra);
    } catch { signal?.throwIfAborted(); }
    const result = finish(works, "Crossref", query, d.message["total-results"], candidates);
    progress(`Found ${result.papers.length} papers · Mapping themes…`, result);
    return result;
  }
}

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
export interface Paper {
  id: string;
  doi: string;
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
  references: string[];
  rank: number;
  coherent?: boolean;
  workType?: string;
  retracted?: boolean;
}
export interface Dataset {
  papers: Paper[];
  source: "OpenAlex" | "Crossref";
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
export function takeaway(abstract: string) {
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
    text.length > 210 ? text.slice(0, 200).replace(/\s+\S*$/, "") + "…" : text,
  );
}
export function cutoff() {
  const d = new Date();
  d.setMonth(d.getMonth() - 18);
  return d.toISOString().slice(0, 10);
}
function oa(w: Raw): Paper {
  const abstract = cleanAbstract(reconstruct(w.abstract_inverted_index));
  return {
    id: w.id,
    doi: w.doi || "",
    title: clean(w.title),
    year: w.publication_year || 0,
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
    workType: w.type,
    retracted: w.is_retracted,
    references: w.referenced_works || [],
    rank: 0,
  };
}
function cross(w: Raw): Paper {
  const abstract = cleanAbstract(w.abstract);
  const doi = w.DOI || "";
  return {
    id: "https://doi.org/" + doi,
    doi,
    title: clean(w.title?.[0]),
    year: w.published?.["date-parts"]?.[0]?.[0] || 0,
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
  "a an the and or of to in on for with by from using based new study analysis research model models approach via as at is are we this that into its it paper review human method methods application applications comparison improved improving estimation introduction results framework system systems".split(
    " ",
  ),
);
const normalized = (s: string) =>
  clean(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((w) => (w.length > 4 ? w.replace(/s$/, "") : w))
    .join(" ");
function queryTokens(query: string) {
  const ignored = new Set(
    "a an the and or of to in on for with by from using via as at is are this that into its it".split(" "),
  );
  return normalized(query)
    .split(" ")
    .filter((t) => t && !ignored.has(t));
}
export function matchesQuery(p: Paper, query: string) {
  const terms = queryTokens(query);
  if (!terms.length) return false;
  const words = new Set(normalized(p.title + " " + p.abstract).split(" "));
  const title = new Set(normalized(p.title).split(" "));
  const topics = new Set(normalized((p.topics || []).join(" ")).split(" "));
  return terms.every((t) => words.has(t)) ||
    (terms.some((t) => title.has(t)) && terms.every((t) => topics.has(t)));
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
  return papers.filter((p) =>
    p.coherent !== false &&
    (query === undefined || terms.some((t) => normalized(p.title).split(" ").includes(t))),
  ).slice(0, 5);
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
  const ignored = new Set([...stop, ...query.toLowerCase().split(/[^a-z]+/)]);
  const tokens = (p: Paper) => [
    ...new Set(
      (p.title.toLowerCase().match(/[a-z]{4,}/g) || []).filter(
        (w) => !ignored.has(w),
      ),
    ),
  ];
  const freq = new Map<string, number>();
  papers.forEach((p) =>
    tokens(p).forEach((w) => freq.set(w, (freq.get(w) || 0) + 1)),
  );
  const labels = [...freq]
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([w]) => w);
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
export function finish(
  input: Paper[],
  source: Dataset["source"],
  query: string,
  total: number,
): Dataset {
  const excludedTypes = new Set([
    "dataset", "paratext", "peer-review", "erratum", "other", "retraction",
    "software", "supplementary-materials", "study-registration",
    "conference-abstract", "grant", "proposal",
  ]);
  const unique = new Map<string, Paper>();
  input
    .filter(
      (p) =>
        p.title &&
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
        unique.set(k, { ...p, relevance: Math.max(p.relevance, existing?.relevance ?? -1) });
      else existing.relevance = Math.max(existing.relevance, p.relevance);
    });
  const publications = new Map<string, Paper>();
  const compactTitle = (s: string) =>
    clean(s).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  for (const p of unique.values()) {
    const author = (p.authors[0] || "").trim();
    const surname = author.includes(",")
      ? author.split(",")[0]
      : author.split(/\s+/).at(-1) || "";
    const key = surname
      ? compactTitle(p.title) + ":" + compactTitle(surname)
      : p.id;
    const existing = publications.get(key);
    const preferred = !existing ||
      Number(!!p.doi) > Number(!!existing.doi) ||
      (!!p.doi === !!existing.doi && p.citations > existing.citations);
    if (preferred) publications.set(key, {
      ...p,
      relevance: Math.max(p.relevance, existing?.relevance ?? -1),
    });
    else existing.relevance = Math.max(existing.relevance, p.relevance);
  }
  const papers = [...publications.values()];
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
        (0.4 * p.relevance) / maxR +
        (0.4 * Math.log1p(p.citations)) / maxC +
        (0.2 * velocity(p)) / maxV),
  );
  papers.sort((a, b) => b.rank - a.rank);
  coherence(papers, query);
  if (source === "Crossref") cluster(papers, query);
  const counts = new Map<string, number>();
  papers.forEach((p) => counts.set(p.theme, (counts.get(p.theme) || 0) + 1));
  const keep = [...counts]
    .filter(([n, c]) => n !== "Other" && c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([n]) => n);
  papers.forEach((p) => {
    if (!keep.includes(p.theme) || p.coherent === false) p.theme = "Other";
  });
  return { papers, source, total, fetchedAt: new Date().toISOString() };
}
async function json(url: string, retry = true): Promise<any> {
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (
    r.status === 429 &&
    retry &&
    url.startsWith("https://api.crossref.org/")
  ) {
    const delay = Math.min(
      10,
      Math.max(2, Number(r.headers.get("retry-after")) || 2),
    );
    await new Promise((resolve) => setTimeout(resolve, delay * 1000));
    return json(url, false);
  }
  if (!r.ok) throw new Error(`Index returned ${r.status}`);
  return r.json();
}
export async function discover(
  query: string,
  progress: (s: string, partial?: Dataset) => void = () => {},
  key?: string,
): Promise<Dataset> {
  progress("Searching OpenAlex…");
  try {
    const select =
      "id,doi,title,publication_year,cited_by_count,relevance_score,authorships,primary_location,best_oa_location,primary_topic,topics,concepts,abstract_inverted_index,referenced_works,type,is_retracted";
    const params = (extra: Record<string, string>) =>
      "https://api.openalex.org/works?" +
      new URLSearchParams({
        search: query,
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
        const d = await json(params(extra as Record<string, string>));
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
    if (all.every((r) => r.status === "rejected"))
      throw new Error("OpenAlex unavailable");
    const result = finish(accumulated, "OpenAlex", query, total);
    progress(
      `Mapped ${new Set(result.papers.map((p) => p.theme)).size} themes · Selecting abstract excerpts…`,
      result,
    );
    return result;
  } catch {
    progress("OpenAlex unavailable · Searching the backup index…");
    const base =
      "https://api.crossref.org/works?" +
      new URLSearchParams({
        query,
        rows: "100",
        select:
          "DOI,title,author,published,container-title,is-referenced-by-count,abstract,URL,link,score",
        mailto,
      });
    const d = await json(base);
    let works = d.message.items.map(cross) as Paper[];
    progress(
      `Found ${works.length} records · Checking influential papers…`,
      finish(works, "Crossref", query, d.message["total-results"]),
    );
    try {
      const cited = await json(
        base + "&sort=is-referenced-by-count&order=desc",
      );
      const terms = query.toLowerCase().match(/[a-z0-9]+/g) || [];
      const extra = (cited.message.items.map(cross) as Paper[]).filter(
        (p) =>
          terms.filter((t) => p.title.toLowerCase().includes(t)).length >=
          Math.max(1, Math.ceil(terms.length * 0.6)),
      );
      works = works.concat(extra);
    } catch {}
    try {
      const proceedings = await json(base + "&filter=type:proceedings-article");
      works = works.concat(proceedings.message.items.map(cross));
    } catch {}
    const result = finish(works, "Crossref", query, d.message["total-results"]);
    progress(`Found ${result.papers.length} papers · Mapping themes…`, result);
    return result;
  }
}

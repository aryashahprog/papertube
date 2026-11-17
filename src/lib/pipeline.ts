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
  return [...qualified, ...eligible.filter((p) => !qualified.includes(p))].slice(0, 5);
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
      "id,doi,title,publication_year,cited_by_count,relevance_score,authorships,primary_location,best_oa_location,primary_topic,topics,concepts,abstract_inverted_index,referenced_works,type,is_retracted";
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
          "DOI,title,author,published,container-title,is-referenced-by-count,abstract,URL,link,score",
        mailto,
      });
    const d = await request(base);
    let works = d.message.items.map(cross) as Paper[];
    progress(
      `Found ${works.length} records · Checking influential papers…`,
      finish(works, "Crossref", query, d.message["total-results"]),
    );
    try {
      const cited = await request(
        base + "&sort=is-referenced-by-count&order=desc",
      );
      const terms = normalized(searchQuery).split(" ").filter(Boolean);
      const extra = (cited.message.items.map(cross) as Paper[]).filter(
        (p) =>
          terms.filter((t) => contains(normalized(p.title), t)).length >=
          Math.max(1, Math.ceil(terms.length * 0.6)),
      );
      works = works.concat(extra);
    } catch { signal?.throwIfAborted(); }
    try {
      const proceedings = await request(base + "&filter=type:proceedings-article");
      works = works.concat(proceedings.message.items.map(cross));
    } catch { signal?.throwIfAborted(); }
    const result = finish(works, "Crossref", query, d.message["total-results"]);
    progress(`Found ${result.papers.length} papers · Mapping themes…`, result);
    return result;
  }
}

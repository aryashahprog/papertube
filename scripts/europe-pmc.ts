import { setTimeout as pause } from "node:timers/promises";
import { clean, cleanAbstract, finish, publicationYear, takeaway, type Dataset, type Paper } from "../src/lib/pipeline";

type Record = { id: string; source: string; doi?: string; title?: string; pubYear?: string; firstPublicationDate?: string; citedByCount?: number; abstractText?: string; authorList?: { author: { fullName: string }[] }; journalInfo?: { journal?: { title?: string } }; pubTypeList?: { pubType: string[] }; fullTextUrlList?: { fullTextUrl: { documentStyle?: string; availabilityCode?: string; url: string }[] } };

export function fromEuropePmc(record: Record): Paper | null {
  const types = record.pubTypeList?.pubType || [];
  if (types.some(type => /^(editorial|letter|comment|news|published erratum|retracted publication|retraction of publication)$/i.test(type))) return null;
  const abstract = cleanAbstract(record.abstractText);
  if (!record.title || !abstract) return null;
  return {
    id: `https://europepmc.org/article/${record.source}/${record.id}`,
    doi: record.doi || "",
    title: clean(record.title),
    year: publicationYear(Number(record.pubYear), Number(record.firstPublicationDate?.slice(0, 4))),
    citations: Number(record.citedByCount) || 0,
    relevance: 1,
    authors: (record.authorList?.author || []).map(author => author.fullName),
    venue: record.journalInfo?.journal?.title || "",
    url: record.doi ? "https://doi.org/" + record.doi : `https://europepmc.org/article/${record.source}/${record.id}`,
    pdf: record.fullTextUrlList?.fullTextUrl.find(link => link.documentStyle === "pdf" && link.availabilityCode === "OA")?.url || "",
    abstract,
    takeaway: takeaway(abstract),
    theme: "Other",
    workType: types.some(type => /review/i.test(type)) ? "review" : "article",
    references: [],
    rank: 0,
  };
}

export async function discoverEuropePmc(topic: string, query: string, pages = 2, fetcher = fetch, wait = pause): Promise<Dataset> {
  if (!topic.trim() || !query.trim() || !Number.isInteger(pages) || pages < 1 || pages > 10) throw new Error("Supply a topic, query, and 1–10 pages");
  const papers: Paper[] = [];
  let cursor = "*", total = 0;
  for (let page = 0; page < pages; page++) {
    const url = "https://www.ebi.ac.uk/europepmc/webservices/rest/search?" + new URLSearchParams({ query: query + " sort_cited:y", sort: "CITED desc", resultType: "core", format: "json", pageSize: "250", cursorMark: cursor });
    let response: Response;
    for (let attempt = 0; ; attempt++) {
      response = await fetcher(url, { signal: AbortSignal.timeout(60000) });
      if (response.status !== 429 || attempt >= 2) break;
      await wait(Math.max(2000 * 2 ** attempt, (Number(response.headers.get("retry-after")) || 0) * 1000));
    }
    if (!response.ok) throw new Error(`Europe PMC HTTP ${response.status}: ${await response.text()}`);
    const data = await response.json();
    if (!Array.isArray(data.resultList?.result)) throw new Error("Unexpected Europe PMC response");
    total = data.hitCount;
    papers.push(...data.resultList.result.map(fromEuropePmc).filter((paper: Paper | null): paper is Paper => paper !== null));
    if (!data.resultList.result.length || !data.nextCursorMark || data.nextCursorMark === cursor) break;
    cursor = data.nextCursorMark;
    if (page + 1 < pages) await wait(1000);
  }
  return finish(papers, "Europe PMC", topic, total);
}

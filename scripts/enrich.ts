import { readFile, readdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as pause } from "node:timers/promises";
import { cleanAbstract, takeaway, type Dataset, type Paper } from "../src/lib/pipeline";

type Metadata = { abstract?: string; publicationTypes?: string[] };
type Cache = { s2: Record<string, Metadata | null>; pmc: Record<string, Metadata | null> };
export const doi = (value: string) => value.replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:)/i, "").trim().toLowerCase();
export function workType(types: string[] = []) {
  const normalized = types.map(t => t.toLowerCase().replace(/[^a-z]/g, ""));
  for (const [type, aliases] of Object.entries({
    news: ["news"], editorial: ["editorial"], comment: ["lettersandcomments", "comment"],
    letter: ["letter"], erratum: ["erratum", "publishederratum"],
    review: ["review"], "proceedings-article": ["conference"], article: ["journalarticle"],
  })) if (aliases.some(t => normalized.includes(t))) return type;
}
export function enrichPaper(paper: Paper, metadata: Metadata | null | undefined) {
  const abstract = cleanAbstract(metadata?.abstract || paper.abstract);
  return { ...paper, abstract, takeaway: takeaway(abstract), ...(workType(metadata?.publicationTypes) ? { type: workType(metadata?.publicationTypes) } : {}) };
}
export async function request(url: string, init: RequestInit = {}, fetcher = fetch, wait = pause): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetcher(url, { ...init, signal: AbortSignal.timeout(30000) });
    if (response.ok) return response.json();
    const body = await response.text();
    if (response.status !== 429 || attempt >= 3) throw new Error(`${url}: HTTP ${response.status} ${body}`);
    const retry = response.headers.get("retry-after");
    const seconds = retry && Number.isFinite(Number(retry)) ? Number(retry) : retry ? Math.max(0, (Date.parse(retry) - Date.now()) / 1000) : 0;
    const delay = Math.max(10000 * 2 ** attempt, (seconds || 0) * 1000);
    console.log(`HTTP 429; retrying in ${Math.ceil(delay / 1000)}s`);
    await wait(delay);
  }
}
export async function main() {
  const directory = resolve("public/data");
  const cachePath = process.env.PAPERTUBE_ENRICH_CACHE || join(homedir(), ".papertube-enrichment.json");
  let cache: Cache = { s2: {}, pmc: {} };
  try { cache = JSON.parse(await readFile(cachePath, "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const files = (await readdir(directory)).filter(f => f.endsWith(".json")).sort();
  const datasets = await Promise.all(files.map(async file => ({ file, data: JSON.parse(await readFile(join(directory, file), "utf8")) as Dataset })));
  const ids = [...new Set(datasets.flatMap(({ data }) => data.papers.map(p => doi(p.doi || "")).filter(Boolean)))];
  const missing = ids.filter(id => !(id in cache.s2));
  for (let i = 0; i < missing.length; i += 500) {
    const batch = missing.slice(i, i + 500);
    const records = await request("https://api.semanticscholar.org/graph/v1/paper/batch?fields=abstract,publicationTypes,externalIds", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: batch.map(id => "DOI:" + id) }),
    });
    if (!Array.isArray(records) || records.length !== batch.length) throw new Error("Unexpected Semantic Scholar batch response");
    batch.forEach((id, j) => { cache.s2[id] = records[j]; });
    await writeFile(cachePath, JSON.stringify(cache));
    console.log(`Semantic Scholar: ${Math.min(i + 500, missing.length)}/${missing.length}`);
    await pause(60000);
  }
  for (const id of ids.filter(id => !cache.s2[id]?.abstract && !(id in cache.pmc))) {
    const url = "https://www.ebi.ac.uk/europepmc/webservices/rest/search?" + new URLSearchParams({ query: `DOI:"${id}"`, resultType: "core", format: "json" });
    const data = await request(url);
    if (!Array.isArray(data.resultList?.result)) throw new Error("Unexpected Europe PMC response");
    const record = data.resultList.result.find((r: any) => doi(r.doi || "") === id);
    cache.pmc[id] = record ? { abstract: record.abstractText, publicationTypes: record.pubTypeList?.pubType } : null;
    await writeFile(cachePath, JSON.stringify(cache));
    console.log(`Europe PMC: ${id}${record?.abstractText ? " abstract found" : " no abstract"}`);
    await pause(1000);
  }
  for (const { file, data } of datasets) {
    data.papers = data.papers.map(p => {
      const id = doi(p.doi || "");
      const s2 = cache.s2[id], pmc = cache.pmc[id];
      return enrichPaper(p, { abstract: s2?.abstract || pmc?.abstract, publicationTypes: [...(s2?.publicationTypes || []), ...(pmc?.publicationTypes || [])] });
    });
    await writeFile(join(directory, file), JSON.stringify(data));
    const top = data.papers.slice(0, 10);
    console.log(`${file}: first ten abstracts=${top.filter(p => p.abstract).length}, takeaways=${top.filter(p => p.takeaway).length}`);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error); process.exitCode = 1; });

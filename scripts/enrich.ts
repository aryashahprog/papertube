import { readFile, readdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as pause } from "node:timers/promises";
import { validatedAbstract, takeaway, finish, startHere, examples, slug, type Dataset, type Paper } from "../src/lib/pipeline";
import { createAbstractHydrator } from "../src/lib/abstracts";

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
  const abstract = validatedAbstract(paper.title, metadata?.abstract) || validatedAbstract(paper.title, paper.abstract);
  return { ...paper, abstract, takeaway: takeaway(abstract), ...(workType(metadata?.publicationTypes) ? { type: workType(metadata?.publicationTypes) } : {}) };
}
export function priorityPapers(data: Dataset, query: string) {
  const ranked = finish(data.papers, data.source, query, data.total).papers;
  const selected = new Set([...ranked.slice(0, 40), ...startHere(ranked, query), ...startHere(data.papers, query)].map(p => p.id));
  return data.papers.filter(p => selected.has(p.id));
}
export async function request(url: string, init: RequestInit = {}, fetcher = fetch, wait = pause): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetcher(url, { ...init, signal: AbortSignal.timeout(30000) });
    if (response.ok) return response.json();
    const body = await response.text();
    if (response.status !== 429 || attempt >= 3) throw new Error(`${url}: HTTP ${response.status} ${body}`);
    const retry = response.headers.get("retry-after");
    const seconds = retry && Number.isFinite(Number(retry)) ? Number(retry) : retry ? Math.max(0, (Date.parse(retry) - Date.now()) / 1000) : 0;
    const delay = Math.max(60000 * 2 ** attempt, (seconds || 0) * 1000);
    console.log(`HTTP 429; retrying in ${Math.ceil(delay / 1000)}s`);
    await wait(delay);
  }
}
export async function backfillStartHere(data: Dataset, query: string, fetcher = fetch) {
  const result = { ...data, papers: data.papers.map(paper => ({ ...paper })) };
  const ranked = finish(data.papers, data.source, query, data.total);
  const update = (updated: Paper) => {
    result.papers = result.papers.map(paper => paper.id === updated.id ? { ...paper, abstract: updated.abstract, takeaway: updated.takeaway } : paper);
  };
  const service = createAbstractHydrator({ fetcher, onUpdate: update });
  for (const paper of startHere(ranked.papers, query)) {
    if (validatedAbstract(paper.title, paper.abstract)) continue;
    const anthology = /^10\.18653\/v1\/([a-z0-9.-]+)$/i.exec(doi(paper.doi || ""));
    if (anthology) try {
      const response = await fetcher(`https://aclanthology.org/${anthology[1]}/`, { signal: AbortSignal.timeout(8000) });
      const html = response.ok ? await response.text() : "";
      const text = /class=["'][^"']*\bacl-abstract\b[^"']*["'][^>]*>[\s\S]*?<(?:span|p)>([\s\S]*?)<\/(?:span|p)>/i.exec(html)?.[1];
      const abstract = validatedAbstract(paper.title, text);
      if (abstract) { update(enrichPaper(paper, { abstract })); continue; }
    } catch {}
    await service.enqueue(paper);
  }
  service.abort();
  return result;
}
export async function main() {
  const directory = resolve("public/data");
  if (process.argv.includes("--start-here-only")) {
    for (const file of (await readdir(directory)).filter(f => f.endsWith(".json")).sort()) {
      const path = join(directory, file);
      const original: Dataset = JSON.parse(await readFile(path, "utf8"));
      const query = examples.find(topic => slug(topic) + ".json" === file) || file.replace(/\.json$/, "").replace(/-/g, " ");
      const data = await backfillStartHere(original, query);
      const ranked = finish(data.papers, data.source, query, data.total);
      const selected = startHere(ranked.papers, query);
      await writeFile(path, JSON.stringify(data));
      const remaining = selected.filter(paper => !data.papers.find(p => p.id === paper.id)?.takeaway);
      console.log(`${file}: Start here takeaways=${selected.length - remaining.length}/${selected.length}`);
      remaining.forEach(paper => console.log(`Missing abstract: ${paper.title}`));
    }
    return;
  }
  const cachePath = process.env.PAPERTUBE_ENRICH_CACHE || join(homedir(), ".papertube-enrichment.json");
  let cache: Cache = { s2: {}, pmc: {} };
  try { cache = JSON.parse(await readFile(cachePath, "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const files = (await readdir(directory)).filter(f => f.endsWith(".json")).sort();
  const datasets = await Promise.all(files.map(async file => ({ file, data: JSON.parse(await readFile(join(directory, file), "utf8")) as Dataset })));
  const save = async () => {
    await writeFile(cachePath, JSON.stringify(cache));
    for (const { file, data } of datasets) {
      data.papers = data.papers.map(p => {
        const id = doi(p.doi || "");
        const s2 = cache.s2[id], pmc = cache.pmc[id];
        return enrichPaper(p, { abstract: validatedAbstract(p.title, s2?.abstract) || validatedAbstract(p.title, pmc?.abstract), publicationTypes: [...(s2?.publicationTypes || []), ...(pmc?.publicationTypes || [])] });
      });
      await writeFile(join(directory, file), JSON.stringify(data));
    }
  };
  await save();
  const ids = [...new Set(datasets.flatMap(({ file, data }) => priorityPapers(data, file.replace(/\.json$/, "").replace(/-/g, " ")).map(p => doi(p.doi || "")).filter(Boolean)))];
  console.log(`Prioritized ${ids.length} unique DOIs; cached metadata saved`);
  let failed = false;
  const titles = new Map(datasets.flatMap(({ data }) => data.papers.map(p => [doi(p.doi || ""), p.title] as const)));
  for (const id of ids.filter(id => !validatedAbstract(titles.get(id), cache.s2[id]?.abstract) && !(id in cache.pmc))) {
    const url = "https://www.ebi.ac.uk/europepmc/webservices/rest/search?" + new URLSearchParams({ query: `DOI:"${id}"`, resultType: "core", format: "json" });
    try {
      const data = await request(url);
      if (!Array.isArray(data.resultList?.result)) throw new Error("Unexpected Europe PMC response");
      const record = data.resultList.result.find((r: any) => doi(r.doi || "") === id);
      cache.pmc[id] = record ? { abstract: record.abstractText, publicationTypes: record.pubTypeList?.pubType } : null;
      await save();
      console.log(`Europe PMC: ${id}${record?.abstractText ? " abstract found" : " no abstract"}`);
    } catch (error) {
      console.error(error);
      failed = true;
      break;
    }
    await pause(1000);
  }
  const missing = ids.filter(id => !(id in cache.s2) && (!validatedAbstract(titles.get(id), cache.pmc[id]?.abstract) || !cache.pmc[id]?.publicationTypes?.length));
  for (let i = 0; i < missing.length; i += 500) {
    if (i > 0) await pause(60000);
    const batch = missing.slice(i, i + 500);
    try {
      const records = await request("https://api.semanticscholar.org/graph/v1/paper/batch?fields=abstract,publicationTypes,externalIds", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: batch.map(id => "DOI:" + id) }),
      });
      if (!Array.isArray(records) || records.length !== batch.length) throw new Error("Unexpected Semantic Scholar batch response");
      batch.forEach((id, j) => { cache.s2[id] = records[j]; });
      await save();
      console.log(`Semantic Scholar: ${Math.min(i + 500, missing.length)}/${missing.length}`);
    } catch (error) {
      console.error(error);
      failed = true;
      break;
    }
  }
  for (const { file, data } of datasets) {
    const top = data.papers.slice(0, 10);
    console.log(`${file}: first ten abstracts=${top.filter(p => p.abstract).length}, takeaways=${top.filter(p => p.takeaway).length}`);
  }
  if (failed) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error); process.exitCode = 1; });

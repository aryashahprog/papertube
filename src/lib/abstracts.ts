import { takeaway, validatedAbstract, type Paper } from "./pipeline";
import { cacheStorage } from "./follows";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
const doi = (value: string) => value.replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:)/i, "").trim().toLowerCase();
function identifier(paper: Paper) {
  const value = doi(paper.doi || "");
  if (/^10\.\d{4,9}\/[^\s"\\]+$/.test(value)) return { key: `DOI:${value}`, query: `DOI:"${value}"`, doi: value, pmid: "" };
  const pmid = paper.pmid || /(?:pubmed\.ncbi\.nlm\.nih\.gov\/|europepmc\.org\/article\/MED\/|^PMID:)(\d+)/i.exec(paper.id + " " + paper.url)?.[1];
  if (pmid && /^\d+$/.test(pmid)) return { key: `PMID:${pmid}`, query: `EXT_ID:${pmid} AND SRC:MED`, doi: "", pmid };
}

export function createAbstractHydrator({ onUpdate, fetcher = fetch, storage = cacheStorage }: {
  onUpdate: (paper: Paper) => void;
  fetcher?: typeof fetch;
  storage?: Storage;
}) {
  const controller = new AbortController();
  type Job = { paper: Paper; id: NonNullable<ReturnType<typeof identifier>>; papers: Map<string, Paper>; abstract?: string; done: Promise<void>; resolve: () => void };
  const jobs = new Map<string, Job>();
  const queue: Job[] = [];
  let active = 0;
  const publish = (paper: Paper, abstract: string) => {
    const valid = validatedAbstract(paper.title, abstract);
    if (!controller.signal.aborted && valid) onUpdate({ ...paper, abstract: valid, takeaway: takeaway(valid) });
  };
  async function retrieve(job: Job) {
    const cacheKey = "pt-abstract-v1:" + job.id.key;
    try {
      const cached: unknown = JSON.parse(storage.getItem(cacheKey) || "null");
      if (typeof cached === "string" && (!cached || validatedAbstract(job.paper.title, cached))) return cached;
    } catch {}
    let pmcComplete = false, s2Complete = false, abstract = "";
    const request = (url: string) => fetcher(url, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) });
    try {
      const response = await request("https://www.ebi.ac.uk/europepmc/webservices/rest/search?" + new URLSearchParams({ query: job.id.query, resultType: "core", format: "json" }));
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data.resultList?.result)) {
          pmcComplete = true;
          const record = data.resultList.result.find((r: { doi?: string; pmid?: string; id?: string; source?: string }) =>
            job.id.doi ? doi(r.doi || "") === job.id.doi : (r.pmid || (r.source === "MED" ? r.id : "")) === job.id.pmid);
          if (typeof record?.abstractText === "string") abstract = validatedAbstract(job.paper.title, record.abstractText);
        }
      }
    } catch {}
    if (controller.signal.aborted) return "";
    if (!abstract) {
      try {
        const response = await request(`https://api.semanticscholar.org/graph/v1/paper/${encodeURIComponent(job.id.key)}?fields=abstract`);
        if (response.ok) {
          const data = await response.json();
          s2Complete = typeof data.abstract === "string" || data.abstract === null;
          if (typeof data.abstract === "string") abstract = validatedAbstract(job.paper.title, data.abstract);
        } else if (response.status === 404) s2Complete = true;
      } catch {}
    }
    if (!controller.signal.aborted && (abstract || (pmcComplete && s2Complete))) {
      try { storage.setItem(cacheKey, JSON.stringify(abstract)); } catch {}
    }
    return abstract;
  }
  function pump() {
    while (!controller.signal.aborted && active < 3 && queue.length) {
      const job = queue.shift()!;
      active++;
      retrieve(job).then(abstract => {
        job.abstract = abstract;
        for (const paper of job.papers.values()) publish(paper, abstract);
      }).catch(() => {}).finally(() => { active--; job.resolve(); pump(); });
    }
  }
  return {
    enqueue(paper: Paper): Promise<void> {
      const id = identifier(paper);
      if (controller.signal.aborted || paper.abstract?.trim() || !id) return Promise.resolve();
      const existing = jobs.get(id.key);
      if (existing) {
        if (!existing.papers.has(paper.id)) {
          existing.papers.set(paper.id, paper);
          if (existing.abstract) publish(paper, existing.abstract);
        }
        return existing.done;
      }
      let resolve!: () => void;
      const done = new Promise<void>(complete => { resolve = complete; });
      const job: Job = { paper, id, papers: new Map([[paper.id, paper]]), done, resolve };
      jobs.set(id.key, job);
      queue.push(job);
      pump();
      return done;
    },
    abort() {
      controller.abort();
      for (const job of queue.splice(0)) job.resolve();
    },
  };
}

import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { discover, examples, slug } from "../src/lib/pipeline";
import { discoverEuropePmc } from "./europe-pmc";

export function topicConfiguration(topic: string) {
  return topic === "GLP-1 drugs"
    ? { source: "Europe PMC" as const, query: '(TITLE_ABS:"GLP-1" OR TITLE_ABS:"glucagon-like peptide-1" OR TITLE_ABS:semaglutide OR TITLE_ABS:tirzepatide OR TITLE_ABS:liraglutide) AND (PUB_TYPE:"research-article" OR PUB_TYPE:"review" OR PUB_TYPE:"Clinical Trial")' }
    : { source: "OpenAlex" as const, query: topic };
}

export function retryingFetch(fetcher: typeof fetch = fetch, wait = pause): typeof fetch {
  return async (input, init) => {
    for (let attempt = 0; ; attempt++) {
      const response = await fetcher(input, init);
      if (response.status !== 429 || attempt >= 2) return response;
      const retry = response.headers.get("retry-after");
      const seconds = retry && Number.isFinite(Number(retry)) ? Number(retry) : retry ? (Date.parse(retry) - Date.now()) / 1000 : 0;
      await response.body?.cancel();
      await wait(Math.max(2000 * 2 ** attempt, (seconds || 0) * 1000));
    }
  };
}

export async function refreshTopics({ topics = examples, directory = "public/data", source, query, pages = 2, key, openAlex = discover, europePmc = discoverEuropePmc, log = console.log }: {
  topics?: readonly string[];
  directory?: string;
  source?: "indexes" | "europe-pmc";
  query?: string;
  pages?: number;
  key?: string;
  openAlex?: typeof discover;
  europePmc?: typeof discoverEuropePmc;
  log?: (message: string) => void;
} = {}) {
  await mkdir(directory, { recursive: true });
  let failed = 0;
  for (const topic of topics) {
    const configured = topicConfiguration(topic);
    const expected = source === "indexes" ? "OpenAlex" : source === "europe-pmc" ? "Europe PMC" : configured.source;
    const path = resolve(directory, `${slug(topic)}.json`);
    const temporary = `${path}.${process.pid}.next`;
    try {
      const data = expected === "Europe PMC"
        ? await europePmc(topic, query || configured.query, pages)
        : await openAlex(topic, () => {}, key);
      if (data.source !== expected) throw new Error(`Expected ${expected}, received ${data.source}`);
      if (!Array.isArray(data.papers) || !data.papers.length) throw new Error("No papers returned");
      await writeFile(temporary, JSON.stringify(data));
      await rename(temporary, path);
      log(`${topic}: ${data.papers.length} papers (${data.source})`);
    } catch (error) {
      failed++;
      let message = String(error).replace(/api_key=[^&\s]+/g, "api_key=REDACTED");
      if (key) message = message.split(key).join("REDACTED");
      log(`${topic}: kept existing snapshot · ${message}`);
    } finally {
      await rm(temporary, { force: true }).catch(() => {});
    }
  }
  return failed;
}

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, options: {
    source: { type: "string" }, topic: { type: "string" }, query: { type: "string" }, pages: { type: "string", default: "2" }, refresh: { type: "boolean", default: false },
  } });
  if (values.source && !["indexes", "europe-pmc"].includes(values.source)) throw new Error("Unknown snapshot source");
  if (values.source === "europe-pmc" && !values.topic) throw new Error("Europe PMC requires --topic (and optionally --query)");
  const original = globalThis.fetch;
  globalThis.fetch = retryingFetch(original);
  try {
    const failed = await refreshTopics({
      topics: values.topic ? [values.topic] : examples,
      source: values.source as "indexes" | "europe-pmc" | undefined,
      query: values.query,
      pages: Number(values.pages),
      key: process.env.OPENALEX_API_KEY,
    });
    if (failed && !values.refresh) process.exitCode = 1;
  } finally {
    globalThis.fetch = original;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(String(error).replace(/api_key=[^&\s]+/g, "api_key=REDACTED"));
    if (!process.argv.includes("--refresh")) process.exitCode = 1;
  });
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { examples, slug, type Dataset, type Paper } from "../src/lib/pipeline";
import { refreshTopics, retryingFetch, topicConfiguration } from "./topics";

const dataset = (source: Dataset["source"], papers = [{ title: "Example research" } as Paper]): Dataset => ({ source, papers, total: papers.length, fetchedAt: "2026-01-01T00:00:00Z" });

test("refresh defaults to each featured topic's configured source and forwards the optional key", async () => {
  const directory = await mkdtemp(join(tmpdir(), "papertube-topics-"));
  try {
    const called: string[] = [];
    const failed = await refreshTopics({ directory, key: "test-key", log: () => {},
      openAlex: async (topic, _progress, key) => { assert.equal(key, "test-key"); called.push(topic); return dataset("OpenAlex"); },
      europePmc: async (topic, query, pages) => {
        assert.equal(topic, "GLP-1 drugs");
        assert.match(query, /TITLE_ABS:semaglutide/);
        assert.match(query, /PUB_TYPE:"Clinical Trial"/);
        assert.equal(pages, 2);
        called.push(topic);
        return dataset("Europe PMC");
      },
    });
    assert.equal(failed, 0);
    assert.deepEqual(called, examples);
    for (const topic of examples) {
      const data = JSON.parse(await readFile(join(directory, `${slug(topic)}.json`), "utf8"));
      assert.equal(data.source, topicConfiguration(topic).source);
    }
    assert.equal((await readdir(directory)).length, 8);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("source mismatches, Crossref fallbacks and empty results leave snapshots byte-for-byte intact", async () => {
  const directory = await mkdtemp(join(tmpdir(), "papertube-topics-"));
  try {
    const topics = ["diffusion models", "GLP-1 drugs"];
    for (const topic of topics) await writeFile(join(directory, `${slug(topic)}.json`), `existing ${topic}`);
    for (const wrong of [dataset("Crossref"), dataset("OpenAlex", []), dataset("Europe PMC", [])]) {
      assert.equal(await refreshTopics({ topics, directory, log: () => {}, openAlex: async () => wrong, europePmc: async () => wrong }), 2);
      for (const topic of topics) assert.equal(await readFile(join(directory, `${slug(topic)}.json`), "utf8"), `existing ${topic}`);
    }
    assert.equal(await refreshTopics({ topics, directory, log: () => {}, openAlex: async () => dataset("Europe PMC"), europePmc: async () => dataset("OpenAlex") }), 2);
    for (const topic of topics) assert.equal(await readFile(join(directory, `${slug(topic)}.json`), "utf8"), `existing ${topic}`);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("topic failures are isolated, preserve old files and redact the key", async () => {
  const directory = await mkdtemp(join(tmpdir(), "papertube-topics-"));
  try {
    await writeFile(join(directory, "diffusion-models.json"), "old snapshot");
    const logs: string[] = [];
    const failed = await refreshTopics({ topics: ["diffusion models", "CRISPR"], directory, key: "test-key", log: message => logs.push(message),
      openAlex: async topic => {
        if (topic === "diffusion models") throw new Error("HTTP 503 https://example.test/?api_key=test-key test-key");
        return dataset("OpenAlex");
      },
    });
    assert.equal(failed, 1);
    assert.equal(await readFile(join(directory, "diffusion-models.json"), "utf8"), "old snapshot");
    assert.equal(JSON.parse(await readFile(join(directory, "crispr.json"), "utf8")).source, "OpenAlex");
    assert.match(logs[0], /kept existing snapshot/);
    assert.ok(logs.every(message => !message.includes("test-key")));
    assert.ok((await readdir(directory)).every(file => !file.endsWith(".next")));
    assert.equal(await refreshTopics({ topics: [], directory, log: () => {} }), 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("429 retries use exponential backoff, honor Retry-After and forward request options", async () => {
  const waits: number[] = [];
  let calls = 0;
  const init = { headers: { Accept: "application/json" } };
  const fetcher: typeof fetch = async (input, options) => {
    assert.equal(input, "https://example.test");
    assert.equal(options, init);
    return ++calls < 3 ? new Response("limited", { status: 429, headers: calls === 1 ? { "Retry-After": "3" } : {} }) : Response.json({ ok: true });
  };
  const request = retryingFetch(fetcher, (async ms => { waits.push(ms ?? 0); }) as typeof import("node:timers/promises").setTimeout);
  assert.deepEqual(await (await request("https://example.test", init)).json(), { ok: true });
  assert.deepEqual(waits, [3000, 4000]);
});

test("429 retries are bounded, support HTTP dates and do not retry permanent errors", async () => {
  const waits: number[] = [];
  let calls = 0;
  const request = retryingFetch(async () => { calls++; return new Response(null, { status: 429, headers: { "Retry-After": new Date(Date.now() + 60000).toUTCString() } }); }, (async ms => { waits.push(ms ?? 0); }) as typeof import("node:timers/promises").setTimeout);
  assert.equal((await request("https://example.test")).status, 429);
  assert.equal(calls, 3);
  assert.ok(waits.every(ms => ms > 58000 && ms <= 60000));
  calls = 0;
  const permanent = retryingFetch(async () => { calls++; return new Response(null, { status: 503 }); });
  assert.equal((await permanent("https://example.test")).status, 503);
  assert.equal(calls, 1);
});

test("CLI refresh exits successfully on real discovery fallback rejection; strict generation reports failure", async () => {
  const directory = await mkdtemp(join(tmpdir(), "papertube-topics-cli-"));
  try {
    await mkdir(join(directory, "public/data"), { recursive: true });
    const path = join(directory, "public/data/diffusion-models.json");
    await writeFile(path, "existing OpenAlex snapshot");
    for (const refresh of [true, false]) {
      const code = `
        globalThis.fetch = async input => {
          if (String(input).startsWith('https://api.openalex.org/')) throw new TypeError('offline');
          return Response.json({message: {'total-results': 1, items: [{DOI: '10.1234/test', title: ['Diffusion models'], published: {'date-parts': [[2020]]}, 'is-referenced-by-count': 100}]}});
        };
        const {main} = await import(${JSON.stringify(new URL("./topics.ts", import.meta.url).href)});
        await main(${JSON.stringify([...(refresh ? ["--refresh"] : []), "--topic", "diffusion models"])});
      `;
      const result = spawnSync(process.execPath, ["--import", import.meta.resolve("tsx"), "--input-type=module", "-e", code], { cwd: directory, encoding: "utf8", timeout: 10000 });
      assert.equal(result.status, refresh ? 0 : 1, result.stderr);
      assert.match(result.stdout, /Expected OpenAlex, received Crossref/);
      assert.equal(await readFile(path, "utf8"), "existing OpenAlex snapshot");
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

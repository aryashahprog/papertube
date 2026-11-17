import { mkdir, writeFile } from "node:fs/promises";
import { discover, examples, slug } from "../src/lib/pipeline";
import { discoverEuropePmc } from "./europe-pmc";
import { parseArgs } from "node:util";
const { values } = parseArgs({ options: { source: { type: "string", default: "indexes" }, topic: { type: "string" }, query: { type: "string" }, pages: { type: "string", default: "2" } } });
if (!["indexes", "europe-pmc"].includes(values.source)) throw new Error("Unknown snapshot source");
if (values.source === "europe-pmc" && !values.topic) throw new Error("Europe PMC requires --topic (and optionally --query)");
await mkdir("public/data", { recursive: true });
for (const topic of values.topic ? [values.topic] : examples) {
  try {
    const data = values.source === "europe-pmc"
      ? await discoverEuropePmc(topic, values.query || topic, Number(values.pages))
      : await discover(topic, () => {}, process.env.OPENALEX_API_KEY);
    await writeFile(`public/data/${slug(topic)}.json`, JSON.stringify(data));
    console.log(`${topic}: ${data.papers.length} papers (${data.source})`);
  } catch (e) {
    console.error(
      `${topic}: ${String(e).replace(/api_key=[^&\s]+/g, "api_key=REDACTED")}`,
    );
    process.exitCode = 1;
  }
}

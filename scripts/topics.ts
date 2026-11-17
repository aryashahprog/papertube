import { mkdir, writeFile } from 'node:fs/promises'
import { discover, examples, slug } from '../src/lib/pipeline'
await mkdir('public/data',{recursive:true})
for (const topic of examples) { try { const data=await discover(topic,()=>{},process.env.OPENALEX_API_KEY); await writeFile(`public/data/${slug(topic)}.json`,JSON.stringify(data)); console.log(`${topic}: ${data.papers.length} papers (${data.source})`)} catch(e) { console.error(`${topic}: ${String(e).replace(/api_key=[^&\s]+/g,'api_key=REDACTED')}`); process.exitCode=1 } }

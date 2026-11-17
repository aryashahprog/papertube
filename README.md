# PaperTube

A quiet field guide to research: key papers, an idea map, and a chronological play-through. Static React + TypeScript + Vite, at `/papertube/` on GitHub Pages.

## Local development

```sh
npm ci
npm run dev
npm run build # TypeScript + dist/
npm run preview # localhost:4173/papertube/
npm test
npm run prebuild:topics # refresh eight featured-topic public snapshots
npm run enrich:topics # enrich DOI abstracts/types via Semantic Scholar and Europe PMC
npm run prebuild:topics -- --source europe-pmc --topic "GLP-1 drugs" --query '(TITLE_ABS:"GLP-1" OR TITLE_ABS:"glucagon-like peptide-1" OR TITLE_ABS:semaglutide OR TITLE_ABS:tirzepatide OR TITLE_ABS:liraglutide) AND (PUB_TYPE:"research-article" OR PUB_TYPE:"review" OR PUB_TYPE:"Clinical Trial")' --pages 2
```

Enrichment does not use OpenAlex. Cached metadata is applied first, then requests prioritize each topic's top 40 ranked papers plus Start here. Europe PMC is tried first for missing abstracts with one-second spacing; uncached gaps then use Semantic Scholar batches of up to 500 DOI identifiers with a minute between batches. HTTP 429 retries use minute-scale backoff and Retry-After support. Responses (including misses) are cached in `~/.papertube-enrichment.json`; rerunning resumes without repeating successful requests. Set `PAPERTUBE_ENRICH_CACHE` to choose another cache file, or remove the cache deliberately to refresh it. Snapshots are saved after each successful response, so partial enrichment survives failures; their original index freshness dates are preserved. Failures are logged and produce a nonzero exit status without discarding saved progress.

OpenAlex (CC0) is primary: relevance, citation-ranked, and recent pools are merged, deduplicated and ranked with relevance, log citations, and citation velocity. Themes use primary topics, merging tiny groups into Other. Crossref is the fallback: relevance, citation-ranked and proceedings pools, title-keyword TF-IDF clustering, citation counts, and deposited abstracts. Both indexes require a normalized query phrase in the title or abstract. A dominant keyword/topic cluster learned from cited, top-relevance results guides Start here and TV; outliers remain on the map under Other. This is a heuristic, not a guarantee of relevance, and phrase matching can miss synonymous work. Broad one-word topics still have multiple legitimate interpretations.

Takeaways are cleaned, heuristically selected abstract sentences, not generated claims. Citation fragments, JATS, copyright and introductory background are filtered. Missing excerpts show citation/year/venue metadata in Start here; TV prefers papers with excerpts. Always read the paper. Crossref does not index every ML preprint or conference paper, so DDPM and score-based foundations may be absent even when closely related work is found.

Queries, Hot and Play live in the URL. `/` focuses search; space pauses TV, arrows step, Escape exits. Hot uses ~18 months with publication-year precision. Maps only draw references provided by the source (no edges in Crossref fallback). Themes may number fewer than four with sparse metadata. Snapshot freshness is shown in results. PDF access is not guaranteed by the metadata.

Featured topics load from `public/data/` first; other queries use live APIs. Results are session-cached. Regenerate snapshots deliberately; normal builds spend no quota. `OPENALEX_API_KEY` is optional for the Node-only prebuild script; it is never read by browser code. Never prefix it with VITE_ or commit it. Keyless quotas are per user IP; either live index can throttle. No backend, sign-up, or analytics.

The main-branch workflow builds and publishes dist to gh-pages with GITHUB_TOKEN. If Pages is not configured, select deployment from the gh-pages branch in repository settings: pushing that branch alone does not guarantee Pages is enabled.

Source: https://github.com/aryashahprog/papertube

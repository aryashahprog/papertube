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
```

OpenAlex (CC0) is primary: relevance, citation-ranked, and recent pools are merged, deduplicated and ranked with relevance, log citations, and citation velocity. Themes use primary topics, merging tiny groups into Other. Crossref is the fallback: title-keyword TF-IDF clustering, citation counts, and deposited abstracts. Crossref queries can be noisy, especially ambiguous terms. Missing abstracts produce no takeaway. Takeaways are heuristically selected abstract sentences, not generated claims. Always read the paper.

Queries, Hot and Play live in the URL. `/` focuses search; space pauses TV, arrows step, Escape exits. Hot uses ~18 months with publication-year precision. Maps only draw references provided by the source (no edges in Crossref fallback). Themes may number fewer than four with sparse metadata. Snapshot freshness is shown in results. PDF access is not guaranteed by the metadata.

Featured topics load from `public/data/` first; other queries use live APIs. Results are session-cached. Regenerate snapshots deliberately; normal builds spend no quota. `OPENALEX_API_KEY` is optional for the Node-only prebuild script; it is never read by browser code. Never prefix it with VITE_ or commit it. Keyless quotas are per user IP; either live index can throttle. No backend, sign-up, or analytics.

The main-branch workflow builds and publishes dist to gh-pages with GITHUB_TOKEN. If Pages is not configured, select deployment from the gh-pages branch in repository settings: pushing that branch alone does not guarantee Pages is enabled.

Source: https://github.com/aryashahprog/papertube

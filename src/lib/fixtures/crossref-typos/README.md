# Crossref typo regression responses

These are unmodified JSON responses captured with shell `curl` using the same
three requests as `discover` for each query:

```text
difusion modles
quantm computing
photosynthsis
diffusion models
sleep and memory
```

The base request is `https://api.crossref.org/works?` followed by
`new URLSearchParams` encoding of:

```json
{
  "query": "<query>",
  "rows": "100",
  "select": "DOI,title,author,published,container-title,is-referenced-by-count,abstract,URL,link,score",
  "mailto": "papertube@users.noreply.github.com"
}
```

The `relevance` fixture uses that URL unchanged; `cited` appends
`&sort=is-referenced-by-count&order=desc`; `proceedings` appends
`&filter=type:proceedings-article`. Transient 429s were retried with curl's
bounded retry support; all saved files are successful responses.

Crossref strongly favors exact misspellings in titles. Abstracts provide
independent frequency evidence for `difusion modles`, while `photosynthsis`
already returns matching papers and should not show an empty-state suggestion.

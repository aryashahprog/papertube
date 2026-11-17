import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  discover,
  invalidQueryMessage,
  RateLimitError,
  publicationYear,
  cluster,
  finish,
  examples,
  slug,
  clampQuery,
  cutoff,
  startHere,
  playThrough,
  type Dataset,
  type Paper,
} from "./lib/pipeline";
import "@fontsource-variable/inter";
import "./style.css";
import { slideDuration } from "./lib/tv";
import { tourPosition } from "./lib/tv-position";
import { cacheStorage, followsStorage, countNewPapers, markTopicVisited, normalizeQuery, readFollows, recentBatch, seedFollow, relativeDate, writeFollows, type Follow, type RecentPaper } from "./lib/follows";
const colors = [
  "#bed6ae",
  "#a3c09a",
  "#8bad82",
  "#cfdfc3",
  "#739b70",
  "#b2c7a8",
  "#98b892",
  "#a8b6aa",
];
const compact = (n: number) =>
  Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
function App() {
  const [follows, setFollows] = useState<Follow[]>(() => readFollows(followsStorage));
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [recent, setRecent] = useState<RecentPaper[]>([]);
  const [recentTotal, setRecentTotal] = useState(0);
  const [recentUrl, setRecentUrl] = useState("");
  const [params, setParams] = useState(
    () => new URLSearchParams(location.search),
  );
  const q = clampQuery(params.get("q") || "");
  const hot = params.get("view") === "hot";
  const playing = params.get("play") === "1";
  const followed = follows.find((f) => f.q === normalizeQuery(q));
  useEffect(() => {
    if (q) return;
    let active = true;
    setCounts({});
    follows.slice(0, 8).forEach((f) => {
      countNewPapers(f).then((count) => {
        if (active) setCounts((previous) => ({ ...previous, [f.q]: count }));
      }).catch(() => {});
    });
    return () => { active = false; };
  }, [q, follows]);
  const [input, setInput] = useState(q),
    [data, setData] = useState<Dataset | null>(null),
    [status, setStatus] = useState(""),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [selected, setSelected] = useState<Paper | null>(null),
    [hover, setHover] = useState<Paper | null>(null),
    [share, setShare] = useState(false),
    [copied, setCopied] = useState(false),
    [slide, setSlide] = useState(() => tourPosition(params.get("slide"), Number.MAX_SAFE_INTEGER)),
    [paused, setPaused] = useState(false);
  const [finished, setFinished] = useState(false);
  const [slideRun, setSlideRun] = useState(0);
  const remaining = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const playRef = useRef<HTMLButtonElement>(null);
  const selection = useRef(`${q}\n${hot}`);
  function navigate(next: Record<string, string | undefined>) {
    const p = new URLSearchParams(location.search);
    Object.entries(next).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)));
    if (!p.has("play")) p.delete("slide");
    history.pushState({}, "", location.pathname + (p.size ? "?" + p : ""));
    setParams(p);
  }
  useEffect(() => {
    const fn = () => {
      const p = new URLSearchParams(location.search);
      if (p.get("play") === "1") {
        goToSlide(tourPosition(p.get("slide"), Number.MAX_SAFE_INTEGER));
        setPaused(false);
      }
      setParams(p);
    };
    window.addEventListener("popstate", fn);
    return () => window.removeEventListener("popstate", fn);
  }, []);
  useEffect(() => {
    setInput(q);
    setRecent([]);
    setRecentTotal(0);
    setSelected(null);
    if (!q) {
      setData(null);
      return;
    }
    let active = true;
    const controller = new AbortController();
    setData(null);
    setLoading(true);
    setError("");
    setStatus("Looking for papers…");
    document.title = `${q} — PaperTube`;
    if (!/[\p{L}\p{N}]/u.test(q)) {
      setError(invalidQueryMessage);
      setLoading(false);
      return;
    }
    const update = (s: string, d?: Dataset) => {
      if (active) {
        setStatus(s);
        if (d) setData(d);
      }
    };
    (async () => {
      try {
        let result: Dataset | undefined;
        try {
          const cached = cacheStorage.getItem("pt-v6:" + q.toLowerCase());
          if (cached) result = JSON.parse(cached);
        } catch {}
        if (!result && examples.some((t) => slug(t) === slug(q))) {
          try {
            const r = await fetch(
              `${import.meta.env.BASE_URL}data/${slug(q)}.json`,
              { signal: controller.signal },
            );
            if (r.ok) {
              const d = await r.json();
              if (Array.isArray(d.papers)) result = d;
            }
          } catch {}
        }
        if (!result) result = await discover(q, update, undefined, controller.signal);
        result = { ...finish(result.papers, result.source, q, result.total), fetchedAt: result.fetchedAt };
        result = { ...result, papers: result.papers.map(p => ({ ...p, year: publicationYear(p.year) })) };
        if (result.source !== "OpenAlex") {
          result = { ...result, papers: result.papers.map(p => ({ ...p })) };
          cluster(result.papers, q);
        }
        if (active) {
          setData(result);
          const saved = readFollows(followsStorage);
          const previous = saved.find((f) => f.q === normalizeQuery(q));
          if (previous) {
            try {
              const batch = await recentBatch(previous);
              const items = batch.papers;
              if (!active) return;
              setRecent(items);
              setRecentTotal(batch.total);
              setRecentUrl(batch.searchUrl);
              const latest = readFollows(followsStorage);
              const visited = { ...previous, lastSeenAt: new Date().toISOString(), seenIds: [...new Set([...previous.seenIds, ...items.map((p) => p.id)])], seenPapers: [...(previous.seenPapers || []), ...items.filter((p) => p.date).map((p) => ({ id: p.id, date: p.date! }))] };
              const updated = latest.map((f) => f.q === previous.q ? visited : f);
              if (writeFollows(followsStorage, updated)) {
                markTopicVisited(previous, visited);
                setFollows(updated);
              }
            } catch {}
          }
          try {
            cacheStorage.setItem(
              "pt-v6:" + q.toLowerCase(),
              JSON.stringify(result),
            );
          } catch {}
        }
      } catch (error) {
        if (active && !controller.signal.aborted)
          setError(
            navigator.onLine === false
              ? "You seem to be offline. Reconnect and try again."
              : error instanceof RateLimitError
                ? "The free research indexes are busy right now. Wait a minute and try again."
                : "Both research indexes are unavailable right now. Please try again in a moment.",
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [q, retry]);
  useEffect(() => {
    const next = `${q}\n${hot}`;
    if (selection.current !== next) {
      selection.current = next;
      goToSlide(0);
    }
  }, [q, hot]);
  const papers = (data?.papers || []).filter(
    (p) => !hot || p.year >= Number(cutoff().slice(0, 4)),
  );
  const themes = [...new Set(papers.map((p) => p.theme))];
  const years = papers.map((p) => p.year);
  const min = Math.min(...years),
    max = Math.max(...years);
  const tour = playThrough(papers);
  const current = tour[Math.min(slide, tour.length - 1)];
  const duration = current ? slideDuration(current.title, current.takeaway) : 6000;
  function goToSlide(index: number) {
    setSlide(index);
    setSlideRun((run) => run + 1);
    setFinished(false);
  }
  function togglePlayback() {
    if (finished) {
      goToSlide(0);
      setPaused(false);
    } else setPaused((p) => !p);
  }
  useEffect(() => {
    remaining.current = duration;
  }, [current?.id, slideRun, playing, duration]);
  useEffect(() => {
    if (!playing || !data || !tour.length) return;
    const index = Math.min(slide, tour.length - 1);
    if (index !== slide) goToSlide(index);
    const p = new URLSearchParams(location.search);
    p.set("slide", String(index + 1));
    history.replaceState({}, "", location.pathname + "?" + p);
  }, [playing, slide, tour.length, data]);
  useEffect(() => {
    if (!playing || paused || !tour.length) return;
    const started = performance.now();
    const t = setTimeout(() => {
      if (slide >= tour.length - 1) {
        setFinished(true);
        setPaused(true);
      } else goToSlide(slide + 1);
    }, remaining.current);
    return () => {
      clearTimeout(t);
      remaining.current = Math.max(0, remaining.current - (performance.now() - started));
    };
  }, [playing, paused, tour.length, slide, current?.id, slideRun, duration]);
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (["INPUT", "TEXTAREA"].includes(tag)) return;
      if (e.key === "/" && !playing) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape") {
        if (playing) navigate({ play: undefined });
        setSelected(null);
        setShare(false);
      }
      if (playing) {
        if (e.key === "Tab") {
          const buttons =
            document.querySelectorAll<HTMLButtonElement>(".tv button");
          const first = buttons[0],
            last = buttons[buttons.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
        if (e.code === "Space") {
          e.preventDefault();
          togglePlayback();
        }
        if (e.key === "ArrowRight")
          goToSlide(Math.min(slide + 1, tour.length - 1));
        if (e.key === "ArrowLeft") goToSlide(Math.max(0, slide - 1));
      }
    };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [playing, tour.length, slide, finished]);
  useEffect(() => {
    if (!selected && !playing) return;
    const previous = document.activeElement as HTMLElement;
    closeRef.current?.focus();
    return () => {
      if (previous?.isConnected && previous !== document.body) previous.focus();
      else playRef.current?.focus();
    };
  }, [selected, playing]);
  const search = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) navigate({ q: input.trim(), play: undefined });
  };
  const themeColor = (p: Paper) =>
    colors[themes.indexOf(p.theme) % colors.length];
  const x = (p: Paper) => 90 + ((p.year - min) / Math.max(1, max - min)) * 950;
  const y = (p: Paper) =>
    82 +
    themes.indexOf(p.theme) * 83 +
    (Array.from(p.title).reduce(
      (hash, ch) => (hash * 31 + ch.charCodeAt(0)) >>> 0,
      0,
    ) %
      61) -
    30;
  function links(p: Paper) {
    return (
      <div className="paper-links">
        {p.pdf && (
          <a href={p.pdf} target="_blank" rel="noreferrer">
            PDF ↗
          </a>
        )}
        <a href={p.url} target="_blank" rel="noreferrer">
          Paper ↗
        </a>
      </div>
    );
  }
  return (
    <>
      <nav>
        <a className="brand" href={import.meta.env.BASE_URL}>
          paper<span>tube</span>
          <i />
        </a>
        <a
          className="github"
          href="https://github.com/aryashahprog/papertube"
          target="_blank"
          rel="noreferrer"
        >
          GitHub ↗
        </a>
      </nav>
      {!q ? (
        <main className="home">
          <form className="search huge" onSubmit={search}>
            <span>⌕</span>
            <input
              ref={inputRef}
              aria-label="Research topic"
              maxLength={200}
              value={input}
              onChange={(e) => setInput(clampQuery(e.target.value))}
              placeholder="Search a topic"
            />
            <kbd>/</kbd>
            <button aria-label="Search">↗</button>
          </form>
          <section className="topic-inbox" aria-label="Your topics">
            <div className="inbox-heading"><h1>Your topics</h1><span>New papers</span></div>
            {!follows.length && <p className="follow-hint">Follow a topic. Find new papers here.</p>}
            <div className="inbox-list">{[...follows].sort((a, b) => Number((counts[b.q] || 0) > 0) - Number((counts[a.q] || 0) > 0)).map((f) => <button className="inbox-row" key={f.q} onClick={() => navigate({ q: f.q })}>
              <span className="inbox-topic">{f.label}<small>Checked {relativeDate(f.lastSeenAt)}</small></span>
              <span className={counts[f.q] ? "unread-count" : "read-count"}>{counts[f.q] === undefined ? "—" : counts[f.q] === 0 ? "Up to date" : `${counts[f.q]} new`}</span><span className="inbox-arrow">↗</span>
            </button>)}</div>
          </section>
          <section className="featured-topics" aria-label="Explore topics">
          <h2>Explore</h2>
          <div className="featured-grid">
            {examples.map((t) => (
              <button key={t} onClick={() => navigate({ q: t })}>
                {t} <span>↗</span>
              </button>
            ))}
          </div>
          </section>
        </main>
      ) : (
        <main className="results">
          <form className="search small" onSubmit={search}>
            <span>⌕</span>
            <input
              ref={inputRef}
              aria-label="Research topic"
              maxLength={200}
              value={input}
              onChange={(e) => setInput(clampQuery(e.target.value))}
            />
            <button aria-label="Search">↗</button>
          </form>
          <div className="result-heading">
            <div>
              <h1>{q}</h1>
              {!error && (
                <p className="stats">
                  {data
                    ? `${papers.length} papers · ${themes.length} themes${papers.length ? ` · ${min}–${max}` : ""}`
                    : "Loading…"}
                </p>
              )}
            </div>
            <div className="actions">
              <button aria-pressed={!!followed} disabled={loading || !data || !!error} onClick={() => {
                const saved = readFollows(followsStorage);
                const now = new Date().toISOString();
                const updated = followed ? saved.filter((f) => f.q !== normalizeQuery(q)) : [...saved, {
                  q: normalizeQuery(q), label: q, followedAt: now, lastSeenAt: now,
                  seenIds: [],
                }];
                if (writeFollows(followsStorage, updated)) {
                  setFollows(updated);
                  if (!followed) {
                    const added = updated[updated.length - 1];
                    void seedFollow(added).then((seeded) => {
                      const latest = readFollows(followsStorage);
                      const current = latest.find((f) => f.q === added.q);
                      if (!current || current.followedAt !== added.followedAt || current.lastSeenAt !== added.lastSeenAt) return;
                      const next = latest.map((f) => f.q === added.q ? seeded : f);
                      if (writeFollows(followsStorage, next)) {
                        markTopicVisited(added, seeded);
                        setFollows(next);
                      }
                    });
                  }
                }
              }}>{followed ? "Following ✓" : "Follow topic"}</button>
              <div className="toggle" aria-label="Paper selection">
                <button
                  className={!hot ? "active" : ""}
                  onClick={() => navigate({ view: undefined })}
                >
                  Canon
                </button>
                <button
                  className={hot ? "active" : ""}
                  onClick={() => navigate({ view: "hot" })}
                >
                  Hot <span>↗</span>
                </button>
              </div>
              <button
                ref={playRef}
                disabled={!tour.length}
                className="play"
                onClick={() => {
                  goToSlide(finished ? 0 : slide);
                  setPaused(false);
                  navigate({ play: "1" });
                }}
              >
                {slide > 0 && !finished
                  ? `▶ Resume ${String(slide + 1).padStart(2, "0")}/${tour.length}`
                  : "▶ Play"}
              </button>
              <div className="share-wrap">
                <button onClick={() => setShare(!share)}>Share ↗</button>
                {share && (
                  <div className="share-menu">
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(location.href);
                          setCopied(true);
                        } catch {
                          setCopied(false);
                        }
                      }}
                    >
                      {copied ? "Copied!" : "Copy link"}
                    </button>
                    <a
                      target="_blank"
                      rel="noreferrer"
                      href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`The papers that matter in ${q}, mapped →`)}&url=${encodeURIComponent(location.href)}`}
                    >
                      Post on X ↗
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
          {followed && recentTotal > 0 && <section className="new-papers" aria-label="New since your last visit">
            <h2>New since your last visit</h2>
            <p><a href={recentUrl} target="_blank" rel="noreferrer">See all ↗</a></p>
            <div className="new-feed">{recent.map((p) =>
              <a key={p.id} href={p.url} target="_blank" rel="noreferrer"><span>{p.title}</span><small>{p.date || p.year} ↗</small></a>)}</div>
          </section>}
          {data?.source === "Crossref" && (
            <p className="backup">
              Crossref
            </p>
          )}
          {data?.source === "Europe PMC" && (
            <p className="backup">
              Europe PMC
            </p>
          )}
          {data && (
            <p className="backup">
              Updated ·{" "}
              {new Date(data.fetchedAt).toLocaleDateString("en", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          )}
          {hot && (
            <p className="backup">
              Since {cutoff()}
            </p>
          )}
          {loading && (
            <div role="status" className="loading">
              <div className="pulse" />
              {status}
              <div className="skeletons">
                <i />
                <i />
                <i />
              </div>
            </div>
          )}
          {error && (
            <div role="alert" className="empty">
              {error}
              {error !== invalidQueryMessage && (
                <button onClick={() => setRetry((n) => n + 1)}>Try again ↗</button>
              )}
            </div>
          )}
          {data && !!papers.length && (
            <>
              <section className="start">
                <div className="section-title">
                  <h2>
                    <span>01</span> Start here
                  </h2>
                </div>
                <div className="start-grid">
                  {startHere(papers, q).map((p, i) => (
                    <article className="start-card" key={p.id}>
                      <div className="card-top">
                        <span className="number">0{i + 1}</span>
                        <span>
                          {p.year} <span className="dot">·</span>{" "}
                          {compact(p.citations)} citations
                        </span>
                      </div>
                      <button
                        className="title-button"
                        onClick={() => setSelected(p)}
                      >
                        {p.title}
                      </button>
                      <div className="byline">
                        {p.authors[0] || "Author not listed"}
                        {p.authors.length > 1 ? " et al." : ""}
                        {p.venue && ` · ${p.venue}`}
                      </div>
                      {p.takeaway ? (
                        <p className="takeaway">{p.takeaway}</p>
                      ) : (
                        <p className="byline citation-summary">
                          {compact(p.citations)} citations · {p.year}
                          {p.venue ? ` · ${p.venue}` : ""}
                        </p>
                      )}
                      <div className="card-bottom">
                        <span
                          className="theme-label"
                          style={
                            { "--theme": themeColor(p) } as React.CSSProperties
                          }
                        >
                          {p.theme}
                        </span>
                        {links(p)}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
              <section className="map-section">
                <div className="section-title">
                  <h2>
                    <span>02</span> Idea map
                  </h2>
                </div>
                <div className="map-canvas">
                  <div className="map-top">
                    <span>ANATOMY OF A FIELD</span>
                    <span>Size: citations · Lines: references</span>
                  </div>
                  <div className="legend">
                    {themes.map((t, i) => (
                      <span key={t}>
                        <i style={{ background: colors[i] }} />
                        {t}
                      </span>
                    ))}
                  </div>
                  <div className="svg-scroll">
                    <svg
                      role="img"
                      aria-label="Research map: years horizontally, themes in lanes"
                      viewBox={`0 0 1120 ${themes.length * 83 + 120}`}
                    >
                      <defs>
                        <filter id="glow">
                          <feGaussianBlur stdDeviation="3" />
                        </filter>
                      </defs>
                      {themes.map((t, i) => (
                        <g key={t}>
                          <line
                            x1="60"
                            x2="1070"
                            y1={82 + i * 83}
                            y2={82 + i * 83}
                            stroke="#ffffff13"
                          />
                          <text
                            x="63"
                            y={54 + i * 83}
                            fill={colors[i]}
                            fontSize="10"
                          >
                            {t.length > 65 ? t.slice(0, 65) + "…" : t}
                          </text>
                        </g>
                      ))}
                      {papers.flatMap((p) =>
                        p.references.map((id) => {
                          const target = papers.find((t) => t.id === id);
                          return target ? (
                            <line
                              key={p.id + id}
                              x1={x(p)}
                              y1={y(p)}
                              x2={x(target)}
                              y2={y(target)}
                              stroke={themeColor(p)}
                              strokeOpacity=".12"
                            />
                          ) : null;
                        }),
                      )}
                      {[...papers].reverse().map((p) => (
                        <circle
                          key={p.id}
                          className="node-halo"
                          aria-hidden="true"
                          cx={x(p)}
                          cy={y(p)}
                          r={5 + Math.log1p(p.citations) * 0.95}
                          fill={themeColor(p)}
                          opacity=".15"
                          filter="url(#glow)"
                          onMouseEnter={() => setHover(p)}
                          onMouseLeave={() => setHover(null)}
                          onClick={() => setSelected(p)}
                        />
                      ))}
                      {[...papers].reverse().map((p) => (
                        <g
                          key={p.id}
                          role="button"
                          tabIndex={0}
                          aria-label={p.title}
                          onMouseEnter={() => setHover(p)}
                          onMouseLeave={() => setHover(null)}
                          onFocus={() => setHover(p)}
                          onBlur={() => setHover(null)}
                          onClick={() => setSelected(p)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSelected(p);
                            }
                          }}
                        >
                          <circle
                            className="node"
                            cx={x(p)}
                            cy={y(p)}
                            r={3 + Math.log1p(p.citations) * 0.65}
                            fill={themeColor(p)}
                            stroke="#ffffff50"
                            strokeWidth=".5"
                          />
                        </g>
                      ))}
                      {Array.from({ length: 6 }, (_, i) => (
                        <text
                          key={i}
                          x={90 + i * 190}
                          y={themes.length * 83 + 84}
                          textAnchor="middle"
                          fill="#85918c"
                          fontSize="12"
                        >
                          {Math.round(min + ((max - min) * i) / 5)}
                        </text>
                      ))}
                    </svg>
                  </div>
                  {hover && (
                    <div role="tooltip" className="map-tooltip">
                      <strong>{hover.title}</strong>
                      {hover.takeaway && <p>{hover.takeaway}</p>}
                      <small>
                        {hover.year} · {compact(hover.citations)} citations ·
                        Details ↗
                      </small>
                    </div>
                  )}
                  <div className="map-bottom">
                    <span>← EARLIER IDEAS</span>
                    <span>NEW DIRECTIONS →</span>
                  </div>
                </div>
              </section>
              <section className="themes">
                <div className="section-title">
                  <h2>
                    <span>03</span> Themes
                  </h2>
                </div>
                {themes.map((t, i) => (
                  <div className="theme-section" key={t}>
                    <h3>
                      <i style={{ background: colors[i] }} />
                      {t}
                      <small>
                        {papers.filter((p) => p.theme === t).length} papers
                      </small>
                    </h3>
                    {papers
                      .filter((p) => p.theme === t)
                      .slice(0, 5)
                      .map((p) => (
                        <button
                          className="paper-row"
                          key={p.id}
                          onClick={() => setSelected(p)}
                        >
                          <span className="row-year">{p.year}</span>
                          <span>
                            <strong>{p.title}</strong>
                            {p.takeaway && (
                              <span className="row-takeaway">{p.takeaway}</span>
                            )}
                          </span>
                          <span className="row-cites">
                            {compact(p.citations)}
                            <small>citations ↗</small>
                          </span>
                        </button>
                      ))}
                  </div>
                ))}
              </section>
            </>
          )}
          {data && !papers.length && !loading && (
            <div className="empty">
              {hot ? (
                <>No recent papers. Try Canon.</>
              ) : (
                <>
                  No papers mention “{q}”.
                  <p>Try a broader topic.</p>
                </>
              )}
              <div className="chips">
                {examples.map((t) => (
                  <button key={t} onClick={() => navigate({ q: t })}>
                    {t} <span>↗</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </main>
      )}
      <footer>
        <a className="brand" href={import.meta.env.BASE_URL}>
          paper<span>tube</span>
          <i />
        </a>
        <p>
          {data?.source === "Europe PMC" ? "Europe PMC" : "OpenAlex · CC0"}
          {data?.source === "Crossref" ? " · Crossref" : ""}
        </p>
        <a href="https://github.com/aryashahprog/papertube">
          Source ↗
        </a>
      </footer>
      {selected && !playing && (
        <div className="panel-backdrop" onClick={() => setSelected(null)}>
          <aside
            className="detail-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Paper details"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Tab") {
                const els =
                  e.currentTarget.querySelectorAll<HTMLElement>("button,a");
                const first = els[0],
                  last = els[els.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                  e.preventDefault();
                  last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault();
                  first.focus();
                }
              }
            }}
          >
            <button
              ref={closeRef}
              className="close"
              onClick={() => setSelected(null)}
            >
              Close ×
            </button>
            <div className="eyebrow">
              {selected.year} · {compact(selected.citations)} CITATIONS
            </div>
            <h2>{selected.title}</h2>
            <p className="byline">
              {selected.authors.join(", ")}
              {selected.venue && ` · ${selected.venue}`}
            </p>
            <span className="theme-label">{selected.theme}</span>
            {links(selected)}
            <h3>Abstract</h3>
            <p className="abstract">
              {selected.abstract ||
                "No abstract available."}
            </p>
          </aside>
        </div>
      )}
      {playing && (
        <div
          className="tv"
          role="dialog"
          aria-modal="true"
          aria-label="How we got here"
        >
          <header>
            <span className="brand">
              paper<span>tube</span>
              <i />
            </span>
            <span>HOW WE GOT HERE / {q}</span>
            <button
              ref={closeRef}
              onClick={() => navigate({ play: undefined })}
            >
              Exit <kbd>esc</kbd>
            </button>
          </header>
          {current ? (
            <>
              <article key={current.id} className="tv-slide">
                <div className="tv-year">{current.year}</div>
                <div>
                  <span
                    className="theme-label"
                    style={{ color: themeColor(current) }}
                  >
                    {current.theme}
                  </span>
                  <h1>{current.title}</h1>
                  {current.takeaway ? (
                    <p>{current.takeaway}</p>
                  ) : (
                    <p className="tv-no-abstract">
                      No abstract available.
                    </p>
                  )}
                  <div className="tv-meta">
                    {current.authors[0] || "Author not listed"}
                    {current.authors.length > 1 ? " et al." : ""}{" "}
                    <span> / </span> {compact(current.citations)} citations
                  </div>
                  {links(current)}
                </div>
              </article>
              <div className="tv-controls">
                <div className="tv-timeline">
                  {tour.map((p, i) => (
                    <button
                      key={p.id}
                      aria-label={`Slide ${i + 1}: ${p.title}`}
                      className={
                        i === slide ? "current" : i < slide ? "done" : ""
                      }
                      onClick={() => goToSlide(i)}
                    >
                      <i
                        key={slideRun}
                        style={{
                          animationDuration: `${duration}ms`,
                          animationPlayState: paused ? "paused" : "running",
                        }}
                      />
                    </button>
                  ))}
                </div>
                <div className="tv-control-row">
                  <span>
                    {String(slide + 1).padStart(2, "0")} / {tour.length}{" "}
                  </span>
                  <div>
                    <button
                      aria-label="Previous paper"
                      onClick={() => goToSlide(Math.max(0, slide - 1))}
                    >
                      ←
                    </button>
                    <button onClick={togglePlayback}>
                      {finished ? "↺ Replay" : paused ? "▶ Resume" : "Ⅱ Pause"}
                    </button>
                    <button
                      aria-label="Next paper"
                      onClick={() =>
                        goToSlide(Math.min(tour.length - 1, slide + 1))
                      }
                    >
                      →
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="tv-wait">
              {loading
                ? "Loading…"
                : error || "No papers."}
            </div>
          )}
        </div>
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

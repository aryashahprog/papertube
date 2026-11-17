import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  discover,
  examples,
  slug,
  cutoff,
  startHere,
  playThrough,
  type Dataset,
  type Paper,
} from "./lib/pipeline";
import "./style.css";
const colors = [
  "#beff7a",
  "#a5a0ff",
  "#ffbd8a",
  "#7bded8",
  "#ed9aca",
  "#f2db80",
  "#8eb9ff",
  "#a8b6aa",
];
const compact = (n: number) =>
  Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
function App() {
  const [params, setParams] = useState(
    () => new URLSearchParams(location.search),
  );
  const q = params.get("q") || "";
  const hot = params.get("view") === "hot";
  const playing = params.get("play") === "1";
  const [input, setInput] = useState(q),
    [data, setData] = useState<Dataset | null>(null),
    [status, setStatus] = useState(""),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<Paper | null>(null),
    [hover, setHover] = useState<Paper | null>(null),
    [share, setShare] = useState(false),
    [copied, setCopied] = useState(false),
    [slide, setSlide] = useState(0),
    [paused, setPaused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  function navigate(next: Record<string, string | undefined>) {
    const p = new URLSearchParams(location.search);
    Object.entries(next).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)));
    history.pushState({}, "", location.pathname + (p.size ? "?" + p : ""));
    setParams(p);
  }
  useEffect(() => {
    const fn = () => setParams(new URLSearchParams(location.search));
    window.addEventListener("popstate", fn);
    return () => window.removeEventListener("popstate", fn);
  }, []);
  useEffect(() => {
    setInput(q);
    setSelected(null);
    setSlide(0);
    if (!q) {
      setData(null);
      return;
    }
    let active = true;
    setData(null);
    setLoading(true);
    setError("");
    setStatus("Looking for papers…");
    document.title = `${q} — PaperTube`;
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
          const cached = sessionStorage.getItem("pt-v4:" + q.toLowerCase());
          if (cached) result = JSON.parse(cached);
        } catch {}
        if (!result && examples.some((t) => slug(t) === slug(q))) {
          try {
            const r = await fetch(
              `${import.meta.env.BASE_URL}data/${slug(q)}.json`,
            );
            if (r.ok) {
              const d = await r.json();
              if (Array.isArray(d.papers)) result = d;
            }
          } catch {}
        }
        if (!result) result = await discover(q, update);
        if (active) {
          setData(result);
          try {
            sessionStorage.setItem(
              "pt-v4:" + q.toLowerCase(),
              JSON.stringify(result),
            );
          } catch {}
        }
      } catch {
        if (active)
          setError(
            "Both research indexes are unavailable right now. Please try again in a moment.",
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [q]);
  const papers = (data?.papers || []).filter(
    (p) => !hot || p.year >= Number(cutoff().slice(0, 4)),
  );
  const themes = [...new Set(papers.map((p) => p.theme))];
  const years = papers.map((p) => p.year);
  const min = Math.min(...years),
    max = Math.max(...years);
  const tour = playThrough(papers);
  const current = tour[Math.min(slide, tour.length - 1)];
  useEffect(() => {
    if (!playing || paused || !tour.length) return;
    const t = setInterval(
      () => setSlide((s) => (s >= tour.length - 1 ? 0 : s + 1)),
      7000,
    );
    return () => clearInterval(t);
  }, [playing, paused, tour.length, slide]);
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
          setPaused((p) => !p);
        }
        if (e.key === "ArrowRight")
          setSlide((s) => Math.min(s + 1, tour.length - 1));
        if (e.key === "ArrowLeft") setSlide((s) => Math.max(0, s - 1));
      }
    };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [playing, tour.length]);
  useEffect(() => {
    if (!selected && !playing) return;
    const previous = document.activeElement as HTMLElement;
    closeRef.current?.focus();
    return () => previous?.focus();
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
          Read paper ↗
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
        <span className="nav-note">A little clarity in a world of papers.</span>
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
          <div className="eyebrow">FOLLOW YOUR CURIOSITY</div>
          <h1>
            What do you want
            <br />
            to understand?
          </h1>
          <p className="intro">
            The papers that matter on any topic, mapped by theme,
            <br className="desktop" /> in seconds. Free. No sign-up.
          </p>
          <form className="search huge" onSubmit={search}>
            <span>⌕</span>
            <input
              ref={inputRef}
              aria-label="Research topic"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="A question. A field. A rabbit hole."
            />
            <kbd>/</kbd>
            <button aria-label="Search">↗</button>
          </form>
          <div className="try-label">A FEW GOOD RABBIT HOLES</div>
          <div className="chips">
            {examples.map((t) => (
              <button key={t} onClick={() => navigate({ q: t })}>
                {t} <span>↗</span>
              </button>
            ))}
          </div>
          <div className="home-bottom">
            <span>01 / FIND THE PAPERS</span>
            <span>02 / CONNECT THE IDEAS</span>
            <span>03 / WATCH THEM UNFOLD</span>
          </div>
        </main>
      ) : (
        <main className="results">
          <form className="search small" onSubmit={search}>
            <span>⌕</span>
            <input
              ref={inputRef}
              aria-label="Research topic"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button aria-label="Search">↗</button>
          </form>
          <div className="result-heading">
            <div>
              <div className="eyebrow">YOUR FIELD GUIDE TO</div>
              <h1>{q}</h1>
              <p className="stats">
                {data
                  ? `${papers.length} papers · ${themes.length} themes${papers.length ? ` · ${min}–${max}` : ""}`
                  : "Connecting the literature…"}
              </p>
            </div>
            <div className="actions">
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
                disabled={!tour.length}
                className="play"
                onClick={() => {
                  setSlide(0);
                  setPaused(false);
                  navigate({ play: "1" });
                }}
              >
                ▶ Play
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
          {data?.source === "Crossref" && (
            <p className="backup">
              ↳ Backup index in use: Crossref. Themes are title-keyword
              clusters; abstract coverage varies.
            </p>
          )}
          {data && (
            <p className="backup">
              Index snapshot ·{" "}
              {new Date(data.fetchedAt).toLocaleDateString("en", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          )}
          {hot && (
            <p className="backup">
              Recent papers since {cutoff()} (publication-year precision).
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
              <button onClick={() => location.reload()}>Try again ↗</button>
            </div>
          )}
          {data && !!papers.length && (
            <>
              <section className="start">
                <div className="section-title">
                  <h2>
                    <span>01</span> Start here
                  </h2>
                  <p>Five doors into the subject. Start with any one.</p>
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
                          Cited {compact(p.citations)} times · {p.year}
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
                    <span>02</span> The idea map
                  </h2>
                  <p>Every paper, in context. Follow a thread.</p>
                </div>
                <div className="map-canvas">
                  <div className="map-top">
                    <span>ANATOMY OF A FIELD</span>
                    <span>Node size = citations · Lines = references</span>
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
                            className="node-halo"
                            cx={x(p)}
                            cy={y(p)}
                            r={5 + Math.log1p(p.citations) * 0.95}
                            fill={themeColor(p)}
                            opacity=".15"
                            filter="url(#glow)"
                          />
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
                        Click to explore
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
                    <span>03</span> Follow a theme
                  </h2>
                  <p>The big picture, broken into smaller ideas.</p>
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
              No papers found{hot ? " in this recent window" : ""}. Try a
              broader topic{hot ? " or switch to Canon" : ""}.
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
          Data from OpenAlex (CC0)
          {data?.source === "Crossref" ? " · Backup results from Crossref" : ""}
          .<br />
          Takeaways are the key sentence from each abstract. Always read the
          paper.
        </p>
        <a href="https://github.com/aryashahprog/papertube">
          Made for the curious ↗
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
                "No abstract available from this index. Follow the paper link to read more."}
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
                      No abstract excerpt available. Follow the paper to explore
                      the findings.
                    </p>
                  )}
                  <div className="tv-meta">
                    {current.authors[0] || "Author not listed"}
                    {current.authors.length > 1 ? " et al." : ""}{" "}
                    <span> / </span> {compact(current.citations)} citations
                  </div>
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
                      onClick={() => setSlide(i)}
                    >
                      <i
                        style={{
                          animationPlayState: paused ? "paused" : "running",
                        }}
                      />
                    </button>
                  ))}
                </div>
                <div className="tv-control-row">
                  <span>
                    {String(slide + 1).padStart(2, "0")} / {tour.length}{" "}
                    <span className="desktop">
                      {" "}
                      · A chronological walk through the key papers
                    </span>
                  </span>
                  <div>
                    <button
                      aria-label="Previous paper"
                      onClick={() => setSlide((s) => Math.max(0, s - 1))}
                    >
                      ←
                    </button>
                    <button onClick={() => setPaused(!paused)}>
                      {paused ? "▶ Resume" : "Ⅱ Pause"}
                    </button>
                    <button
                      aria-label="Next paper"
                      onClick={() =>
                        setSlide((s) => Math.min(tour.length - 1, s + 1))
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
                ? "Finding the story…"
                : error || "No papers in this selection."}
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

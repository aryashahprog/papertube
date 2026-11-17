import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Paper } from "./lib/pipeline";
import { paperFigure, paperSketch } from "./lib/visuals";

function Sketch({ paper }: { paper: Paper }) {
  const sketch = paperSketch(paper);
  const xs = sketch.labels.length === 1 ? [180] : sketch.labels.length === 2 ? [80, 280] : [60, 180, 300];
  const labelLines = (label: string) => {
    const words = label.split(/\s+/);
    const lines: string[] = [];
    for (const word of words) {
      if (lines.length && (lines.at(-1)!.length + word.length) < 17) lines[lines.length - 1] += " " + word;
      else lines.push(word.length > 17 ? word.slice(0, 15) + "…" : word);
    }
    return lines.slice(0, 3).map((line, i) => i === 2 && lines.length > 3 ? line + "…" : line);
  };
  return <svg viewBox="0 0 360 164" role="img" aria-label={sketch.description}>
    <g className="sketch-lines" fill="none" stroke="currentColor" strokeWidth="1.6">
      {xs.slice(1).map((x, i) => <g key={x}>
        <path d={`M${xs[i] + 29} 62 H${x - 29}`} />
        {sketch.kind !== "aging" && <path d={`m${x - 35} 58 6 4 -6 4`} />}
      </g>)}
    </g>
    {xs.map((x, i) => <g key={x} transform={`translate(${x} 62)`}>
      <circle r="28" className="sketch-node" />
      {sketch.kind === "dit" || sketch.kind === "attention" ? <g fill="none" stroke="currentColor" strokeWidth="1.6">
        {i === 0 ? [-12, 0, 12].flatMap((y) => [-12, 0, 12].map((xx) => <rect key={`${xx}:${y}`} x={xx - 4} y={y - 4} width="8" height="8" rx="1" />))
          : i === 1 ? <>{[-12, 0, 12].flatMap((y) => [-12, 0, 12].map((yy) => <path key={`${y}:${yy}`} d={`M-14 ${y} 14 ${yy}`} opacity=".4" />))}{[-12, 0, 12].flatMap((y) => [-14, 14].map((xx) => <circle key={`${xx}:${y}`} cx={xx} cy={y} r="3" className="sketch-node" />))}</>
          : sketch.kind === "dit" ? <>{Array.from({ length: 9 }, (_, n) => <circle key={n} cx={((n * 13) % 31) - 15} cy={((n * 19) % 31) - 15} r="1.5" fill="currentColor" />)}<path d="M7 15h13" className="sketch-accent" /></>
          : <><rect x="-12" y="-15" width="24" height="30" rx="3" /><path d="M-6-7H6 M-6 0H6 M-6 7H6" /></>}
      </g> : sketch.kind === "diffusion" ? <g fill="currentColor">
        {Array.from({ length: i === 0 ? 20 : i === 1 ? 10 : 0 }, (_, n) =>
          <circle key={n} cx={((n * 13) % 35) - 17} cy={((n * 19) % 35) - 17} r="1.8" />)}
        {i === 2 && <g fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="-16" y="-14" width="32" height="28" rx="3" /><path d="m-14 10 10-13 8 9 5-6 5 10" /><circle cx="9" cy="-7" r="3" /></g>}
      </g> : sketch.kind === "editing" ? <g fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M-17-11 Q0 12 17-11 M-17 11 Q0-12 17 11" />
        <path d="M-13-7v14 M-5-2v4 M5-2v4 M13-7v14" />
        {i === 2 && <path d="m-6-16 12 32 m-12 0 12-32" className="sketch-accent" />}
      </g> : sketch.kind === "particles" ? <g fill="currentColor">
        {i === 0 ? <path d="m-13-13 23 3 5 22-28-3z" /> : Array.from({ length: i === 1 ? 7 : 11 }, (_, n) =>
          <rect key={n} x={((n * 13) % 31) - 17} y={((n * 17) % 31) - 17} width="5" height="5" rx="1" />)}
      </g> : sketch.kind === "quantum" ? <g fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M-12-12h24v24h-24z M0-12v24 M-12 0h24" />
        {[-12, 0, 12].flatMap((y) => [-12, 0, 12].map((xx) => <circle key={`${xx}:${y}`} cx={xx} cy={y} r="2.5" className="sketch-node" />))}
        {i === 1 && <circle r="7" className="sketch-accent" />}
      </g> : sketch.kind === "trial" ? <g fill="none" stroke="currentColor" strokeWidth="1.6">
        {i === 0 ? [-12, 0, 12].map((xx) => <g key={xx}><circle cx={xx} cy="-8" r="4" /><path d={`M${xx - 4} 12V2h8v10`} /></g>)
          : i === 1 ? <><path d="M0-18v13 M-14 15V-5h28v20" /><circle cx="-14" cy="13" r="5" /><circle cx="14" cy="13" r="5" /></>
          : <><path d="M-18 17h36 M-12 10V-8h8v18 M4 10V-8h8v18" /><path d="M-12-16h24m-20-4-4 4 4 4m16-8 4 4-4 4" /></>}
      </g> : sketch.kind === "review" ? <g fill="none" stroke="currentColor" strokeWidth="1.6">
        {i === 0 ? <><path d="M-16-8v-9H4v5 M-10-2v-9h20v5" /><rect x="-4" y="-5" width="20" height="25" rx="2" /><path d="M1 2h10M1 8h10" /></>
          : i === 1 ? <><path d="M-18-15h36L5 0v14l-10 4V0z" /></>
          : <><rect x="-13" y="-17" width="26" height="34" rx="2" /><path d="M-7-8H7 M-7-1H7 m-14 9 5 4 9-9" /></>}
      </g> : sketch.kind === "receptor" ? <g fill="none" stroke="currentColor" strokeWidth="1.8">
        {i === 0 ? <><rect x="-18" y="-8" width="36" height="16" rx="8" transform="rotate(-35)" /><path d="m-5-7 10 14" /></>
          : i === 1 ? <><path d="M-23 10h46 M-11-14v9a11 11 0 0 0 22 0v-9 M0 6v15" /><circle cy="-15" r="5" /></>
          : <><path d="m4-21-16 24H0l-4 18L13-4H2z" /></>}
      </g> : sketch.kind === "aging" ? <g fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle r="18" /><circle r="6" />
        {i === 0 ? <path d="m-12-14 6 8-6 7 7 10" className="sketch-accent" />
          : i === 1 ? <path d="m-11 0 8 8L12-9" />
          : <><circle cx="10" cy="-8" r="2" /><circle cx="-10" cy="8" r="2" /></>}
      </g> : sketch.kind === "electrical" ? <g fill="none" stroke="currentColor" strokeWidth="1.6">
        {i === 1 ? <><path d="M-17-12Q0-24 17-12 M-17 0Q0-12 17 0 M-17 12Q0 0 17 12" /></>
          : <><path d="M-18-16h8c14 0 14 8 0 8 14 0 14 8 0 8 14 0 14 8 0 8 14 0 14 8 0 8h-8 M12-18v36 M18-18v36" /></>}
      </g> : sketch.kind === "study" ? <g fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="-16" y="-19" width="26" height="34" rx="2" /><path d="M-10-11H4 M-10-5H2 M-10 1h6" />
        <circle cx="9" cy="8" r="9" /><path d="m15 15 7 7" />
      </g> : <g fill="none" stroke="currentColor" strokeWidth="1.6">
        {i === 0 ? <><rect x="-14" y="-16" width="22" height="27" rx="2" /><path d="M-7-8H2 M-7-2H2 M-7 4H5 M12-8h4v24H-6v-2" /></> : i === 1 ? <><circle cx="-3" cy="-3" r="10" /><path d="m5 5 10 10 M-3-9v12 M-9-3H3" /></> : <><path d="M-15-13h30V7H0l-9 7V7h-6z M-8-6H8 M-8 0H4" /></>}
      </g>}
      <text y="53" textAnchor="middle" className="sketch-label">
        {labelLines(sketch.labels[i]).map((line, n) => <tspan key={n} x="0" dy={n ? "14" : "0"}>{line}</tspan>)}
      </text>
    </g>)}
  </svg>;
}

export function PaperVisual({ paper, compact = false, sourceLink = false, onExpand }: {
  paper: Paper;
  compact?: boolean;
  sourceLink?: boolean;
  onExpand?: () => void;
}) {
  const figure = paperFigure(paper);
  const [failedSrc, setFailedSrc] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const showFigure = figure && failedSrc !== figure.src;
  const caption = showFigure ? (sourceLink ? figure.label : "Original figure") : "Sketch";
  const src = figure && (figure.src.startsWith("https://") ? figure.src : import.meta.env.BASE_URL + figure.src);
  const image = showFigure && <img src={src} alt={figure.alt} loading="lazy" decoding="async"
    referrerPolicy="no-referrer" onError={() => setFailedSrc(figure.src)} />;
  return <span className={`paper-visual${compact ? " paper-visual-compact" : ""}${showFigure ? " paper-visual-figure" : ""}`}>
    {showFigure ? compact ? image : <button type="button" className="figure-expand" aria-label={`Enlarge figure: ${paper.title}`}
      onClick={() => { onExpand?.(); dialog.current?.showModal(); }}>
      {image}<span className="figure-expand-icon" aria-hidden="true">⤢</span>
    </button> : <Sketch paper={paper} />}
    <span className="visual-caption">
      {showFigure && sourceLink ? <a href={figure.source} target="_blank" rel="noreferrer">{caption} ↗</a> : caption}
    </span>
    {showFigure && !compact && createPortal(<dialog ref={dialog} className="figure-dialog"
      aria-label={`Original figure: ${paper.title}`} onKeyDown={(event) => event.stopPropagation()}>
      <div className="figure-tools">
        <a href={figure.source} target="_blank" rel="noreferrer">{figure.label} ↗</a>
        <button type="button" onClick={() => dialog.current?.close()}>Close</button>
      </div>
      <div className="figure-scroll" tabIndex={0} aria-label="Full-size figure; scroll to explore">
        <img src={src} alt={figure.alt} referrerPolicy="no-referrer" />
      </div>
    </dialog>, document.body)}
  </span>;
}

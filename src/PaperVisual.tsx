import React, { useState } from "react";
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
        {sketch.kind !== "concepts" && <path d={`m${x - 35} 58 6 4 -6 4`} />}
      </g>)}
    </g>
    {xs.map((x, i) => <g key={x} transform={`translate(${x} 62)`}>
      <circle r="28" className="sketch-node" />
      {sketch.kind === "concepts" ? <g fill="currentColor">
        <circle cx="-9" cy="3" r="3" /><circle cx="9" cy="3" r="3" /><circle cy="-9" r="3" />
        <path d="m-9 3 9-12 9 12z" fill="none" stroke="currentColor" />
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
      </g> : <g fill="none" stroke="currentColor" strokeWidth="1.6">
        {i === 0 ? <><rect x="-14" y="-16" width="22" height="27" rx="2" /><path d="M-7-8H2 M-7-2H2 M-7 4H5 M12-8h4v24H-6v-2" /></> : i === 1 ? <><circle cx="-3" cy="-3" r="10" /><path d="m5 5 10 10 M-3-9v12 M-9-3H3" /></> : <><path d="M-15-13h30V7H0l-9 7V7h-6z M-8-6H8 M-8 0H4" /></>}
      </g>}
      <text y="53" textAnchor="middle" className="sketch-label">
        {labelLines(sketch.labels[i]).map((line, n) => <tspan key={n} x="0" dy={n ? "14" : "0"}>{line}</tspan>)}
      </text>
    </g>)}
  </svg>;
}

export function PaperVisual({ paper, compact = false, sourceLink = false }: {
  paper: Paper;
  compact?: boolean;
  sourceLink?: boolean;
}) {
  const figure = paperFigure(paper);
  const [failedSrc, setFailedSrc] = useState("");
  const showFigure = figure && failedSrc !== figure.src;
  const sketch = paperSketch(paper);
  const caption = showFigure ? figure.label : sketch.kind === "concepts" ? "Title map · not findings" : "Concept sketch · not findings";
  return <span className={`paper-visual${compact ? " paper-visual-compact" : ""}${showFigure ? " paper-visual-figure" : ""}`}>
    {showFigure ? <img src={figure.src} alt={figure.alt} loading="lazy" decoding="async"
      referrerPolicy="no-referrer" onError={() => setFailedSrc(figure.src)} /> : <Sketch paper={paper} />}
    <span className="visual-caption">
      {showFigure && sourceLink ? <a href={figure.source} target="_blank" rel="noreferrer">{caption} ↗</a> : caption}
    </span>
  </span>;
}

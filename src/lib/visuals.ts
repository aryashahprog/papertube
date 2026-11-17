import type { Paper } from "./pipeline";

export interface PaperFigure {
  src: string;
  source: string;
  label: string;
  alt: string;
}

// Exact-title matches only: a related paper must never inherit another paper's figure.
// URLs and figure numbers were checked against the authors' arXiv HTML versions.
const figures: Record<string, PaperFigure> = {
  "attention is all you need": {
    src: "https://arxiv.org/html/1706.03762v7/Figures/ModalNet-21.png",
    source: "https://arxiv.org/html/1706.03762v7#S3.F1",
    label: "Figure 1 · Vaswani et al.",
    alt: "The original Transformer encoder–decoder architecture from Attention Is All You Need.",
  },
  "bert pre training of deep bidirectional transformers for language understanding": {
    src: "https://arxiv.org/html/1810.04805v2/BERT_Overall.svg",
    source: "https://arxiv.org/html/1810.04805v2#S2.F1",
    label: "Figure 1 · Devlin et al.",
    alt: "BERT's original overview of pre-training and fine-tuning.",
  },
  "end to end object detection with transformers": {
    src: "https://arxiv.org/html/2005.12872v3/DETR_fig1_seagulls.png",
    source: "https://arxiv.org/html/2005.12872v3#S1.F1",
    label: "Figure 1 · Carion et al.",
    alt: "DETR's original overview: an image passes through a CNN and Transformer to a set of object detections.",
  },
  "an image is worth 16x16 words transformers for image recognition at scale": {
    src: "https://arxiv.org/html/2010.11929v2/model_scheme.png",
    source: "https://arxiv.org/html/2010.11929v2#S3.F1",
    label: "Figure 1 · Dosovitskiy et al.",
    alt: "The original Vision Transformer overview: image patches become a sequence for a Transformer encoder.",
  },
  "retrieval augmented generation for knowledge intensive nlp tasks": {
    src: "https://arxiv.org/html/2005.11401v4/RAG-Architecture.svg",
    source: "https://arxiv.org/html/2005.11401v4#S1.F1",
    label: "Figure 1 · Lewis et al.",
    alt: "The original RAG architecture connecting a query encoder, document index, and generator.",
  },
  "high resolution image synthesis with latent diffusion models": {
    // arXiv's SVG has a full-page canvas; the bundled copy crops blank margins only.
    src: "figures/latent-diffusion.svg",
    source: "https://arxiv.org/html/2112.10752v2#S3.F3",
    label: "Figure 3 · Rombach et al.",
    alt: "The original latent diffusion architecture, showing image compression, denoising in latent space, and conditioning.",
  },
};

const titleKey = (title: string) => title.normalize("NFKC").toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export const paperFigure = (paper: Pick<Paper, "title">) => figures[titleKey(paper.title)];

type SketchKind = "retrieval" | "diffusion" | "attention" | "editing" | "particles" | "quantum" | "concepts";
export interface PaperSketch {
  kind: SketchKind;
  labels: string[];
  description: string;
}

// Topic sketches explain a mechanism, not the individual paper's reported results.
// Match the title, not the search query: unrelated hits keep their own visual.
export function paperSketch(paper: Pick<Paper, "title">): PaperSketch {
  const title = paper.title.toLowerCase();
  if (/retrieval[ -]augmented/.test(title)) return {
    kind: "retrieval", labels: ["Question", "Find sources", "Answer"],
    description: "Retrieval-augmented generation: find relevant sources, then use them to help answer a question.",
  };
  if (/diffusion/.test(title) && /image|generat|denois|text.to.image|latent|synthesis/.test(title)) return {
    kind: "diffusion", labels: ["Noise", "Denoise", "Image"],
    description: "Image diffusion: a learned model removes noise step by step to form an image.",
  };
  // "Transformer" also names electrical hardware. Require positive ML context
  // instead of trying to enumerate every electrical use of the word.
  if (/\bbert\b|self.attention|multi.head attention/.test(title) ||
      titleKey(title) === "attention is all you need" ||
      (/\btransformers?\b/.test(title) && /\b(neural|learning|language|vision|image|images|text|nlp|attention|pretraining|pre training|segmentation|detection|recognition)\b/.test(title))) return {
    kind: "attention", labels: ["Input pieces", "Connections", "Context"],
    description: "Attention: relate pieces of an input to one another to build context.",
  };
  if (/crispr|cas9|genome editing|gene editing/.test(title)) return {
    kind: "editing", labels: ["Guide RNA", "Matching target", "Action"],
    description: "CRISPR systems: a guide RNA directs the system to a matching target sequence. The action depends on the system.",
  };
  if (/microplastics?|nanoplastics?/.test(title)) return {
    kind: "particles", labels: ["Plastic", "Tiny particles", "Exposure"],
    description: "Microplastics: small plastic particles can move through the environment and create routes of exposure.",
  };
  if (/quantum error correction|quantum error.correcting|surface code/.test(title)) return {
    kind: "quantum", labels: ["Encode", "Check errors", "Recover"],
    description: "Quantum error correction: encode information across physical qubits, check for errors, and recover logical information.",
  };
  // For arbitrary fields, show only words present in the title. Undirected lines
  // connect concepts without inventing a causal claim or a numerical result.
  const words = paper.title.replace(/[^\p{L}\p{N}\s-]/gu, " ").split(/\s+/).filter(Boolean);
  const size = Math.ceil(words.length / 3);
  const labels = Array.from({ length: Math.min(3, words.length) }, (_, i) =>
    words.slice(i * size, (i + 1) * size).join(" "),
  ).filter(Boolean);
  return {
    kind: "concepts", labels: labels.length ? labels : ["Paper"],
    description: `Title map for “${paper.title}”. Connected phrases are from the title, not a summary of the findings.`,
  };
}

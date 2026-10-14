"use client";

import katex from "katex";
import { useMemo } from "react";
import { previewLatex } from "@/lib/math-input";

/** Renders an equation string (student notation or server canonical "2*x+5=17") with KaTeX.
 *  KaTeX runs with trust=false, so raw input can never produce links or HTML. */
export function MathText({ value, className = "" }: { value: string; className?: string }) {
  const html = useMemo(() => katex.renderToString(previewLatex(value).latex || "\;", {
    throwOnError: false, trust: false, strict: "ignore", output: "htmlAndMathml",
  }), [value]);
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

import { marked, type TokensList } from "marked";

marked.setOptions({
  gfm: true,
  breaks: false,
});

/** Markdown → HTML for the on-screen preview (and, via print, the PDF). */
export function renderHtml(md: string): string {
  return marked.parse(md, { async: false }) as string;
}

/** Markdown → token stream for the .docx exporter. */
export function lex(md: string): TokensList {
  return marked.lexer(md);
}

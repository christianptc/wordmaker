import { jsPDF } from "jspdf";
import { lex } from "./markdown";
import { headingSizes } from "./typography";
import { fontById } from "./presets";
import { documentTitle } from "./doc-title";
import type { Settings } from "./types";

/**
 * Self-contained PDF generator built on jsPDF.
 *
 * Unlike printing via the browser, this produces the PDF bytes directly, so
 * there is **no browser-injected header/footer** (no page URL like
 * "localhost", no date, no document-title bar). We draw our own optional
 * running header (centered title) and footer (custom text + page numbers),
 * and can render either paginated pages or one continuous page.
 *
 * Typography uses the PDF standard-14 fonts (Helvetica / Times / Courier) so
 * nothing has to be embedded — small, fast, and crisp everywhere.
 */

const PT = 72; // points per inch

type RGB = [number, number, number];
const TEXT: RGB = [26, 26, 26];
const HEAD: RGB = [24, 24, 27];
const MUTED: RGB = [113, 113, 122];
const LINK: RGB = [37, 99, 235];
const CODE_BG: RGB = [244, 244, 245];
const CODE_TX: RGB = [39, 39, 42];
const BORDER: RGB = [224, 224, 228];
const QUOTE_TX: RGB = [63, 63, 70];
const QUOTE_BAR: RGB = [212, 212, 216];
const TH_BG: RGB = [244, 244, 245];

interface Style {
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
  link?: boolean;
  href?: string;
}

interface Atom {
  text: string;
  isSpace?: boolean;
  isBreak?: boolean;
  style: Style;
  w?: number;
}

interface FlowOpts {
  size: number;
  mult: number;
  left: number;
  width: number;
  color: RGB;
  /** drawn once per laid-out line: (lineTopY, lineHeight) */
  onLine?: (yTop: number, lineH: number) => void;
}

interface Geom {
  pageW: number;
  pageH: number;
  margin: number;
}

class Renderer {
  doc: jsPDF;
  s: Settings;
  draw: boolean;
  g: Geom;
  baseFamily: "helvetica" | "times";
  y: number;
  contentLeft: number;
  contentRight: number;
  contentW: number;
  contentTop: number;
  contentBottom: number;
  bodyGap: number;

  constructor(doc: jsPDF, s: Settings, g: Geom, draw: boolean) {
    this.doc = doc;
    this.s = s;
    this.g = g;
    this.draw = draw;
    this.baseFamily = fontById(s.fontId).kind === "serif" ? "times" : "helvetica";
    this.contentLeft = g.margin;
    this.contentRight = g.pageW - g.margin;
    this.contentW = this.contentRight - this.contentLeft;
    this.contentTop = g.margin;
    this.contentBottom = g.pageH - g.margin;
    this.y = this.contentTop;
    this.bodyGap = s.bodySize * s.paraSpacing;
  }

  // ── low-level helpers ──────────────────────────────────────────────────
  private family(st: Style) {
    return st.code ? "courier" : this.baseFamily;
  }
  private variant(st: Style) {
    if (st.bold && st.italic) return "bolditalic";
    if (st.bold) return "bold";
    if (st.italic) return "italic";
    return "normal";
  }
  private setStyle(st: Style, size: number) {
    this.doc.setFont(this.family(st), this.variant(st));
    this.doc.setFontSize(size);
  }
  private measure(text: string, st: Style, size: number) {
    this.setStyle(st, size);
    return this.doc.getTextWidth(text);
  }
  private ensureSpace(h: number) {
    if (this.s.paginate && this.y + h > this.contentBottom) {
      if (this.draw) this.doc.addPage([this.g.pageW, this.g.pageH]);
      this.y = this.contentTop;
    }
  }

  // ── inline tokens → styled atoms ───────────────────────────────────────
  private pushText(out: Atom[], text: string, style: Style) {
    const parts = text.split(/(\s+)/);
    for (const p of parts) {
      if (p === "") continue;
      if (/^\s+$/.test(p)) out.push({ text: " ", isSpace: true, style });
      else out.push({ text: p, style });
    }
  }
  private inlineAtoms(tokens: any[], style: Style, out: Atom[] = []): Atom[] {
    for (const tok of tokens ?? []) {
      switch (tok.type) {
        case "text":
          if (tok.tokens?.length) this.inlineAtoms(tok.tokens, style, out);
          else this.pushText(out, tok.text ?? "", style);
          break;
        case "strong":
          this.inlineAtoms(tok.tokens, { ...style, bold: true }, out);
          break;
        case "em":
          this.inlineAtoms(tok.tokens, { ...style, italic: true }, out);
          break;
        case "del":
          this.inlineAtoms(tok.tokens, { ...style, strike: true }, out);
          break;
        case "codespan":
          this.pushText(out, tok.text ?? "", { ...style, code: true });
          break;
        case "link":
          this.inlineAtoms(tok.tokens, { ...style, link: true, href: tok.href }, out);
          break;
        case "br":
          out.push({ text: "", isBreak: true, style });
          break;
        case "image":
          this.pushText(out, tok.text || tok.href || "", { ...style, italic: true });
          break;
        case "escape":
          this.pushText(out, tok.text ?? "", style);
          break;
        default:
          if (tok.tokens?.length) this.inlineAtoms(tok.tokens, style, out);
          else if (tok.text) this.pushText(out, tok.text, style);
      }
    }
    return out;
  }

  // ── flow: wrap atoms into lines and draw them ──────────────────────────
  private renderFlow(atoms: Atom[], o: FlowOpts) {
    const lineH = o.size * o.mult;
    let line: Atom[] = [];
    let lineW = 0;

    const flush = () => {
      while (line.length && line[line.length - 1].isSpace) {
        lineW -= line[line.length - 1].w!;
        line.pop();
      }
      this.ensureSpace(lineH);
      if (this.draw) this.drawLine(line, o.left, this.y, o.size, o.color);
      if (o.onLine) o.onLine(this.y, lineH);
      this.y += lineH;
      line = [];
      lineW = 0;
    };

    for (const atom of atoms) {
      if (atom.isBreak) {
        flush();
        continue;
      }
      atom.w = this.measure(atom.text, atom.style, o.size);
      if (atom.isSpace) {
        if (line.length === 0) continue; // drop leading space
        line.push(atom);
        lineW += atom.w;
        continue;
      }
      if (lineW + atom.w > o.width && line.length) flush();
      line.push(atom);
      lineW += atom.w;
    }
    if (line.length) flush();
  }

  private drawLine(line: Atom[], left: number, yTop: number, size: number, fallback: RGB) {
    const baseline = yTop + size * 0.78;
    let x = left;
    for (const atom of line) {
      const st = atom.style;
      const w = atom.w!;
      if (st.code && !atom.isSpace) {
        this.doc.setFillColor(...CODE_BG);
        this.doc.rect(x - 1, baseline - size * 0.82, w + 2, size * 1.08, "F");
      }
      this.setStyle(st, size);
      const color: RGB = st.link ? LINK : fallback;
      this.doc.setTextColor(...(st.code ? CODE_TX : color));
      this.doc.text(atom.text, x, baseline);
      if (st.link && st.href && !atom.isSpace) {
        this.doc.setDrawColor(...LINK);
        this.doc.setLineWidth(0.6);
        this.doc.line(x, baseline + 1.5, x + w, baseline + 1.5);
        this.doc.link(x, baseline - size * 0.78, w, size, { url: st.href });
      }
      if (st.strike && !atom.isSpace) {
        this.doc.setDrawColor(...color);
        this.doc.setLineWidth(0.6);
        this.doc.line(x, baseline - size * 0.28, x + w, baseline - size * 0.28);
      }
      x += w;
    }
  }

  // ── blocks ─────────────────────────────────────────────────────────────
  run(tokens: any[]) {
    this.renderBlocks(tokens);
  }

  private renderBlocks(tokens: any[]) {
    const heads = headingSizes(this.s);
    const headArr = [heads.h1, heads.h2, heads.h3, heads.h4, heads.h5, heads.h6];
    for (const tok of tokens ?? []) {
      switch (tok.type) {
        case "space":
          break;
        case "heading": {
          const size = headArr[Math.min(tok.depth, 6) - 1];
          if (this.y > this.contentTop) this.y += this.s.bodySize * (tok.depth === 1 ? 0.5 : 0.7);
          this.ensureSpace(size * 1.2 + this.s.bodySize);
          this.renderFlow(this.inlineAtoms(tok.tokens, { bold: true }), {
            size,
            mult: 1.18,
            left: this.contentLeft,
            width: this.contentW,
            color: HEAD,
          });
          this.y += this.s.bodySize * 0.35;
          break;
        }
        case "paragraph":
          this.renderFlow(this.inlineAtoms(tok.tokens, {}), {
            size: this.s.bodySize,
            mult: this.s.lineHeight,
            left: this.contentLeft,
            width: this.contentW,
            color: TEXT,
          });
          this.y += this.bodyGap;
          break;
        case "list":
          this.renderList(tok, 0);
          this.y += this.bodyGap * 0.5;
          break;
        case "blockquote":
          this.renderQuote(tok.tokens);
          break;
        case "code":
          this.renderCode(tok.text ?? "");
          break;
        case "hr":
          this.y += this.s.bodySize * 0.5;
          this.ensureSpace(this.s.bodySize);
          if (this.draw) {
            this.doc.setDrawColor(...QUOTE_BAR);
            this.doc.setLineWidth(0.75);
            this.doc.line(this.contentLeft, this.y, this.contentRight, this.y);
          }
          this.y += this.s.bodySize * 0.9;
          break;
        case "table":
          this.renderTable(tok);
          break;
        case "html":
          break;
        default:
          if (tok.tokens?.length) this.renderBlocks(tok.tokens);
          else if (tok.text)
            this.renderFlow(this.inlineAtoms([{ type: "text", text: tok.text }], {}), {
              size: this.s.bodySize,
              mult: this.s.lineHeight,
              left: this.contentLeft,
              width: this.contentW,
              color: TEXT,
            });
      }
    }
  }

  private renderList(list: any, level: number) {
    const step = this.s.bodySize * 1.4;
    const markerGap = this.s.bodySize * 1.15;
    let n = (list.start ?? 1) | 0;
    for (const item of list.items ?? []) {
      const markerX = this.contentLeft + level * step;
      const textLeft = markerX + markerGap;
      const width = this.contentRight - textLeft;

      const inlineToks: any[] = [];
      const subLists: any[] = [];
      for (const child of item.tokens ?? []) {
        if (child.type === "list") subLists.push(child);
        else if (child.type === "text" || child.type === "paragraph")
          inlineToks.push(...(child.tokens?.length ? child.tokens : [{ type: "text", text: child.text }]));
      }

      const lineH = this.s.bodySize * this.s.lineHeight;
      this.ensureSpace(lineH);
      const y0 = this.y;

      // marker
      if (this.draw) {
        if (item.task) {
          const box = this.s.bodySize * 0.62;
          const by = y0 + this.s.bodySize * 0.78 - box;
          this.doc.setDrawColor(...MUTED);
          this.doc.setLineWidth(0.8);
          this.doc.rect(markerX, by, box, box, "S");
          if (item.checked) {
            this.doc.setDrawColor(...TEXT);
            this.doc.setLineWidth(1);
            this.doc.line(markerX + box * 0.18, by + box * 0.5, markerX + box * 0.42, by + box * 0.78);
            this.doc.line(markerX + box * 0.42, by + box * 0.78, markerX + box * 0.84, by + box * 0.2);
          }
        } else {
          const marker = list.ordered ? `${n}.` : "•";
          this.setStyle({}, this.s.bodySize);
          this.doc.setTextColor(...(list.ordered ? TEXT : MUTED));
          this.doc.text(marker, markerX, y0 + this.s.bodySize * 0.78);
        }
      }
      n++;

      this.renderFlow(this.inlineAtoms(inlineToks, {}), {
        size: this.s.bodySize,
        mult: this.s.lineHeight,
        left: textLeft,
        width,
        color: TEXT,
      });
      this.y += this.bodyGap * 0.35;

      for (const sub of subLists) this.renderList(sub, level + 1);
    }
  }

  private renderQuote(tokens: any[]) {
    const left = this.contentLeft + this.s.bodySize * 0.95;
    const width = this.contentW - this.s.bodySize * 0.95;
    const barX = this.contentLeft + 1.5;
    const onLine = (yTop: number, lineH: number) => {
      if (!this.draw) return;
      this.doc.setDrawColor(...QUOTE_BAR);
      this.doc.setLineWidth(2);
      this.doc.line(barX, yTop + 1, barX, yTop + lineH);
    };
    for (const tok of tokens ?? []) {
      if (tok.type === "paragraph" || tok.type === "text") {
        this.renderFlow(this.inlineAtoms(tok.tokens ?? [{ type: "text", text: tok.text }], { italic: true }), {
          size: this.s.bodySize,
          mult: this.s.lineHeight,
          left,
          width,
          color: QUOTE_TX,
          onLine,
        });
        this.y += this.bodyGap * 0.5;
      } else if (tok.type === "blockquote") {
        this.renderQuote(tok.tokens);
      }
    }
    this.y += this.bodyGap * 0.4;
  }

  private renderCode(text: string) {
    const size = this.s.bodySize * 0.92;
    const lineH = size * 1.5;
    const pad = this.s.bodySize * 0.55;
    this.doc.setFont("courier", "normal");
    this.doc.setFontSize(size);
    const wrapWidth = this.contentW - 2 * pad;

    const fillRow = (h: number) => {
      if (this.draw) {
        this.doc.setFillColor(...CODE_BG);
        this.doc.rect(this.contentLeft, this.y, this.contentW, h, "F");
      }
    };

    // top padding band
    this.ensureSpace(pad);
    fillRow(pad);
    this.y += pad;

    const lines = text.replace(/\n+$/, "").split("\n");
    for (const raw of lines) {
      const wrapped: string[] = this.doc.splitTextToSize(raw.length ? raw : " ", wrapWidth);
      for (const wl of wrapped) {
        this.ensureSpace(lineH);
        fillRow(lineH);
        if (this.draw) {
          this.doc.setFont("courier", "normal");
          this.doc.setFontSize(size);
          this.doc.setTextColor(...CODE_TX);
          this.doc.text(wl, this.contentLeft + pad, this.y + lineH * 0.5 + size * 0.32);
        }
        this.y += lineH;
      }
    }

    this.ensureSpace(pad);
    fillRow(pad);
    this.y += pad + this.bodyGap * 0.55;
  }

  private tokensToPlain(tokens: any[]): string {
    let out = "";
    for (const tok of tokens ?? []) {
      if (tok.type === "br") out += " ";
      else if (tok.tokens?.length) out += this.tokensToPlain(tok.tokens);
      else if (tok.text != null) out += tok.text;
    }
    return out;
  }

  private renderTable(tok: any) {
    const cols = (tok.header ?? []).length || 1;
    const colW = this.contentW / cols;
    const size = this.s.bodySize * 0.95;
    const lineH = size * 1.3;
    const padX = 5;
    const padY = 4;
    const aligns: string[] = tok.align ?? [];

    const wrapCell = (cell: any, bold: boolean) => {
      this.doc.setFont(this.baseFamily, bold ? "bold" : "normal");
      this.doc.setFontSize(size);
      const txt = this.tokensToPlain(cell.tokens ?? [{ text: cell.text }]);
      return this.doc.splitTextToSize(txt || " ", colW - 2 * padX) as string[];
    };

    const drawRow = (cells: any[], header: boolean) => {
      const wrapped = cells.map((c) => wrapCell(c, header));
      const rows = Math.max(1, ...wrapped.map((w) => w.length));
      const h = rows * lineH + 2 * padY;
      this.ensureSpace(h);
      let x = this.contentLeft;
      for (let c = 0; c < cells.length; c++) {
        if (this.draw) {
          if (header) {
            this.doc.setFillColor(...TH_BG);
            this.doc.rect(x, this.y, colW, h, "F");
          }
          this.doc.setDrawColor(...BORDER);
          this.doc.setLineWidth(0.75);
          this.doc.rect(x, this.y, colW, h, "S");
          this.doc.setFont(this.baseFamily, header ? "bold" : "normal");
          this.doc.setFontSize(size);
          this.doc.setTextColor(...TEXT);
          let ty = this.y + padY + size * 0.78;
          for (const wl of wrapped[c]) {
            const a = aligns[c];
            const lw = this.doc.getTextWidth(wl);
            const tx =
              a === "right"
                ? x + colW - padX - lw
                : a === "center"
                  ? x + (colW - lw) / 2
                  : x + padX;
            this.doc.text(wl, tx, ty);
            ty += lineH;
          }
        }
        x += colW;
      }
      this.y += h;
    };

    if (tok.header?.length) {
      // keep header with at least one body row when possible
      this.ensureSpace(2 * lineH + 4 * padY);
      drawRow(tok.header, true);
    }
    for (const row of tok.rows ?? []) {
      const h = Math.max(1, ...row.map((c: any) => wrapCell(c, false).length)) * lineH + 2 * padY;
      if (this.s.paginate && this.y + h > this.contentBottom) {
        this.ensureSpace(h);
        if (tok.header?.length) drawRow(tok.header, true);
      }
      drawRow(row, false);
    }
    this.y += this.bodyGap * 0.6;
  }

  // ── running header + footer, stamped after content is laid out ─────────
  stampChrome(title: string) {
    const { pageW, pageH, margin } = this.g;
    const n = this.doc.getNumberOfPages();
    const headerY = Math.min(margin * 0.62, margin - 4);
    const footerY = Math.max(pageH - margin * 0.42, pageH - margin + 12);
    const showFoot = this.s.showFooter && this.s.footerText.trim().length > 0;
    const showNums = this.s.showPageNumbers && this.s.paginate && n > 0;

    for (let p = 1; p <= n; p++) {
      this.doc.setPage(p);

      if (this.s.showHeader && title) {
        this.doc.setFont(this.baseFamily, "normal");
        this.doc.setFontSize(this.s.bodySize * 0.82);
        this.doc.setTextColor(...MUTED);
        const tw = this.doc.getTextWidth(title);
        this.doc.text(title, (pageW - tw) / 2, headerY);
        this.doc.setDrawColor(...BORDER);
        this.doc.setLineWidth(0.5);
        this.doc.line(margin, headerY + 5, pageW - margin, headerY + 5);
      }

      if (showFoot || showNums) {
        this.doc.setFont(this.baseFamily, "normal");
        this.doc.setFontSize(this.s.bodySize * 0.78);
        this.doc.setTextColor(...MUTED);
        if (showFoot) {
          const ft = this.s.footerText.trim();
          this.doc.text(ft, margin, footerY);
          if (/(github\.com|https?:\/\/|\.\w{2,})/.test(ft)) {
            const url = /^https?:\/\//.test(ft) ? ft : `https://${ft.replace(/^\/+/, "")}`;
            this.doc.link(margin, footerY - this.s.bodySize * 0.7, this.doc.getTextWidth(ft), this.s.bodySize, {
              url,
            });
          }
        }
        if (showNums) {
          const t = `Page ${p} / ${n}`;
          const w = this.doc.getTextWidth(t);
          this.doc.text(t, pageW - margin - w, footerY);
        }
      }
    }
  }
}

// ── public API ───────────────────────────────────────────────────────────
function geometryFor(s: Settings): { pageW: number; fullPageH: number; margin: number } {
  const pageW = s.pageSize === "a4" ? 595.28 : 612;
  const fullPageH = s.pageSize === "a4" ? 841.89 : 792;
  return { pageW, fullPageH, margin: s.margin * PT };
}

export function buildPdf(md: string, settings: Settings): jsPDF {
  const tokens = lex(md) as any[];
  const { pageW, fullPageH, margin } = geometryFor(settings);
  const title = documentTitle(md);

  if (settings.paginate) {
    const doc = new jsPDF({ unit: "pt", format: [pageW, fullPageH], compress: false });
    const r = new Renderer(doc, settings, { pageW, pageH: fullPageH, margin }, true);
    r.run(tokens);
    r.stampChrome(title);
    return doc;
  }

  // continuous single page: measure height first, then draw onto an exact page.
  // (paginate=false never page-breaks, so the measuring page size is irrelevant.)
  const MAX_H = 14400; // jsPDF's hard limit on page height (in pt)
  const measureDoc = new jsPDF({ unit: "pt", format: [pageW, fullPageH], compress: false });
  const rm = new Renderer(measureDoc, settings, { pageW, pageH: fullPageH, margin }, false);
  rm.run(tokens);
  const pageH = Math.min(MAX_H, Math.max(rm.y + margin, margin * 2 + settings.bodySize * 2));

  const doc = new jsPDF({ unit: "pt", format: [pageW, pageH], compress: false });
  const r = new Renderer(doc, settings, { pageW, pageH, margin }, true);
  r.run(tokens);
  r.stampChrome(title);
  return doc;
}

export function buildPdfBlob(md: string, settings: Settings): Blob {
  return buildPdf(md, settings).output("blob");
}

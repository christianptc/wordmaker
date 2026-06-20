import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  Header,
  LevelFormat,
  LineRuleType,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TabStopType,
  TextRun,
  WidthType,
  convertInchesToTwip,
  type IParagraphOptions,
  type ISectionOptions,
} from "docx";
import { fontById } from "./presets";
import { headingSizes } from "./typography";
import { lex } from "./markdown";
import { documentTitle } from "./doc-title";
import type { Settings } from "./types";

// ── unit helpers ────────────────────────────────────────────────────────────
const TWIPS_PER_PT = 20; // 1pt = 20 twentieths-of-a-point (twips)
const halfPt = (pt: number) => Math.round(pt * 2); // docx font size unit
const twips = (pt: number) => Math.round(pt * TWIPS_PER_PT);

const LINK_COLOR = "2563EB";
const CODE_FILL = "F4F4F5";
const QUOTE_COLOR = "3F3F46";
const QUOTE_BORDER = "D4D4D8";
const RULE_COLOR = "D4D4D8";

interface RunCtx {
  font: string;
  size: number; // half-points
  bold?: boolean;
  italics?: boolean;
  strike?: boolean;
  color?: string;
}

interface BuildState {
  settings: Settings;
  font: string;
  bodyHalf: number;
  monoHalf: number;
  lineSpacing: number; // docx "auto" line units (240 = single)
  paraAfter: number; // twips
  orderedInstance: number; // bumped per ordered list so numbering restarts
}

// ── inline tokens → TextRun[] ───────────────────────────────────────────────
function inlineRuns(tokens: any[], ctx: RunCtx): (TextRun | ExternalHyperlink)[] {
  const out: (TextRun | ExternalHyperlink)[] = [];
  for (const tok of tokens ?? []) {
    switch (tok.type) {
      case "text":
        if (tok.tokens?.length) out.push(...inlineRuns(tok.tokens, ctx));
        else out.push(new TextRun({ ...ctx, text: tok.text ?? "" }));
        break;
      case "strong":
        out.push(...inlineRuns(tok.tokens, { ...ctx, bold: true }));
        break;
      case "em":
        out.push(...inlineRuns(tok.tokens, { ...ctx, italics: true }));
        break;
      case "del":
        out.push(...inlineRuns(tok.tokens, { ...ctx, strike: true }));
        break;
      case "codespan":
        out.push(
          new TextRun({
            text: tok.text ?? "",
            font: "Consolas",
            size: ctx.size,
            bold: ctx.bold,
            italics: ctx.italics,
            shading: { type: ShadingType.CLEAR, color: "auto", fill: CODE_FILL },
          })
        );
        break;
      case "link": {
        const label = tok.text ?? "";
        out.push(
          new ExternalHyperlink({
            link: tok.href ?? "",
            children: [
              new TextRun({
                text: label,
                font: ctx.font,
                size: ctx.size,
                bold: ctx.bold,
                italics: ctx.italics,
                color: LINK_COLOR,
                underline: {},
              }),
            ],
          })
        );
        break;
      }
      case "br":
        out.push(new TextRun({ ...ctx, text: "", break: 1 }));
        break;
      case "image":
        out.push(new TextRun({ ...ctx, italics: true, text: tok.text || tok.href || "" }));
        break;
      case "escape":
        out.push(new TextRun({ ...ctx, text: tok.text ?? "" }));
        break;
      default:
        if (tok.tokens?.length) out.push(...inlineRuns(tok.tokens, ctx));
        else if (tok.text) out.push(new TextRun({ ...ctx, text: tok.text }));
    }
  }
  return out;
}

// ── block tokens → Paragraph | Table ────────────────────────────────────────
function blocks(tokens: any[], st: BuildState): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  const baseCtx: RunCtx = { font: st.font, size: st.bodyHalf };
  const heads = headingSizes(st.settings);
  const headArr = [heads.h1, heads.h2, heads.h3, heads.h4, heads.h5, heads.h6];

  for (const tok of tokens ?? []) {
    switch (tok.type) {
      case "space":
        break;

      case "heading": {
        const pt = headArr[Math.min(tok.depth, 6) - 1];
        out.push(
          new Paragraph({
            children: inlineRuns(tok.tokens, {
              font: st.font,
              size: halfPt(pt),
              bold: true,
            }),
            spacing: {
              before: tok.depth === 1 ? 0 : twips(st.settings.bodySize * 0.95),
              after: twips(st.settings.bodySize * 0.4),
              line: Math.round(st.lineSpacing * 0.85),
              lineRule: LineRuleType.AUTO,
            },
          })
        );
        break;
      }

      case "paragraph":
        out.push(para(inlineRuns(tok.tokens, baseCtx), st));
        break;

      case "list":
        out.push(...listBlocks(tok, st, 0));
        break;

      case "blockquote":
        out.push(...quoteBlocks(tok.tokens, st));
        break;

      case "code":
        out.push(...codeBlocks(tok.text ?? "", st));
        break;

      case "hr":
        out.push(
          new Paragraph({
            spacing: { before: twips(st.settings.bodySize), after: twips(st.settings.bodySize) },
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE_COLOR, space: 1 },
            },
            children: [],
          })
        );
        break;

      case "table":
        out.push(tableBlock(tok, st));
        break;

      case "html":
        // raw HTML lines — drop tags, keep any text content
        break;

      default:
        if (tok.tokens?.length) out.push(...blocks(tok.tokens, st));
        else if (tok.text)
          out.push(para([new TextRun({ ...baseCtx, text: tok.text })], st));
    }
  }
  return out;
}

function para(
  children: (TextRun | ExternalHyperlink)[],
  st: BuildState,
  extra: Partial<IParagraphOptions> = {}
): Paragraph {
  return new Paragraph({
    children,
    spacing: { after: st.paraAfter, line: st.lineSpacing, lineRule: LineRuleType.AUTO },
    ...extra,
  });
}

function listBlocks(list: any, st: BuildState, level: number): Paragraph[] {
  const out: Paragraph[] = [];
  const ordered = !!list.ordered;
  const instance = ordered ? ++st.orderedInstance : 0;
  const baseCtx: RunCtx = { font: st.font, size: st.bodyHalf };

  for (const item of list.items ?? []) {
    const lead: (TextRun | ExternalHyperlink)[] = [];
    const tail: Paragraph[] = [];

    if (item.task) {
      lead.push(new TextRun({ ...baseCtx, text: item.checked ? "☑ " : "☐ " }));
    }

    for (const child of item.tokens ?? []) {
      if (child.type === "list") {
        tail.push(...listBlocks(child, st, level + 1));
      } else if (child.type === "text" || child.type === "paragraph") {
        const inl = child.tokens?.length
          ? inlineRuns(child.tokens, baseCtx)
          : [new TextRun({ ...baseCtx, text: child.text ?? "" })];
        lead.push(...inl);
      } else if (child.type === "space") {
        // ignore
      } else {
        const sub = blocks([child], st);
        for (const b of sub) if (b instanceof Paragraph) tail.push(b);
      }
    }

    out.push(
      new Paragraph({
        children: lead,
        spacing: { after: Math.round(st.paraAfter * 0.35), line: st.lineSpacing, lineRule: LineRuleType.AUTO },
        ...(ordered
          ? { numbering: { reference: "wm-ordered", level, instance } }
          : { bullet: { level } }),
      })
    );
    out.push(...tail);
  }
  return out;
}

function quoteBlocks(tokens: any[], st: BuildState): Paragraph[] {
  const ctx: RunCtx = { font: st.font, size: st.bodyHalf, italics: true, color: QUOTE_COLOR };
  const out: Paragraph[] = [];
  for (const tok of tokens ?? []) {
    if (tok.type === "paragraph" || tok.type === "text") {
      out.push(
        new Paragraph({
          children: inlineRuns(tok.tokens ?? [{ type: "text", text: tok.text }], ctx),
          spacing: { after: st.paraAfter, line: st.lineSpacing, lineRule: LineRuleType.AUTO },
          indent: { left: twips(st.settings.bodySize) },
          border: {
            left: { style: BorderStyle.SINGLE, size: 18, color: QUOTE_BORDER, space: 12 },
          },
        })
      );
    } else if (tok.type === "blockquote") {
      out.push(...quoteBlocks(tok.tokens, st));
    }
  }
  return out;
}

function codeBlocks(text: string, st: BuildState): Paragraph[] {
  const lines = text.replace(/\n$/, "").split("\n");
  return lines.map((line, i) => {
    const first = i === 0;
    const last = i === lines.length - 1;
    return new Paragraph({
      children: [new TextRun({ text: line.length ? line : " ", font: "Consolas", size: st.monoHalf })],
      shading: { type: ShadingType.CLEAR, color: "auto", fill: CODE_FILL },
      spacing: {
        before: first ? twips(st.settings.bodySize * 0.4) : 0,
        after: last ? st.paraAfter : 0,
        line: Math.round(240 * 1.35),
        lineRule: LineRuleType.AUTO,
      },
      indent: { left: twips(st.settings.bodySize * 0.6), right: twips(st.settings.bodySize * 0.6) },
    });
  });
}

function tableBlock(tok: any, st: BuildState): Table {
  const ctx: RunCtx = { font: st.font, size: st.bodyHalf };
  const align = (a: string | null) =>
    a === "center" ? AlignmentType.CENTER : a === "right" ? AlignmentType.RIGHT : AlignmentType.LEFT;

  const headerCells: TableCell[] = (tok.header ?? []).map(
    (cell: any, c: number) =>
      new TableCell({
        shading: { type: ShadingType.CLEAR, color: "auto", fill: "F4F4F5" },
        children: [
          new Paragraph({
            alignment: align(tok.align?.[c]),
            children: inlineRuns(cell.tokens ?? [{ type: "text", text: cell.text }], {
              ...ctx,
              bold: true,
            }),
          }),
        ],
      })
  );

  const bodyRows: TableRow[] = (tok.rows ?? []).map(
    (row: any[]) =>
      new TableRow({
        children: row.map(
          (cell: any, c: number) =>
            new TableCell({
              children: [
                new Paragraph({
                  alignment: align(tok.align?.[c]),
                  children: inlineRuns(cell.tokens ?? [{ type: "text", text: cell.text }], ctx),
                }),
              ],
            })
        ),
      })
  );

  const border = { style: BorderStyle.SINGLE, size: 4, color: "E4E4E7" };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: border,
      bottom: border,
      left: border,
      right: border,
      insideHorizontal: border,
      insideVertical: border,
    },
    rows: [new TableRow({ tableHeader: true, children: headerCells }), ...bodyRows],
  });
}

// ── public builder (pure, no DOM — used by tests too) ────────────────────────
export function buildDocument(md: string, settings: Settings): Document {
  const font = fontById(settings.fontId).docx;
  const st: BuildState = {
    settings,
    font,
    bodyHalf: halfPt(settings.bodySize),
    monoHalf: halfPt(settings.bodySize * 0.92),
    lineSpacing: Math.round(settings.lineHeight * 240),
    paraAfter: twips(settings.bodySize * settings.paraSpacing),
    orderedInstance: 0,
  };

  const children = blocks(lex(md) as any[], st);

  const pageWidth = settings.pageSize === "a4" ? 8.27 : 8.5;
  const pageHeight = settings.pageSize === "a4" ? 11.69 : 11;
  const m = convertInchesToTwip(settings.margin);

  const section: ISectionOptions = {
    properties: {
      page: {
        size: {
          width: convertInchesToTwip(pageWidth),
          height: convertInchesToTwip(pageHeight),
        },
        margin: { top: m, right: m, bottom: m, left: m },
      },
    },
    headers: buildHeader(md, settings, font, st.bodyHalf),
    footers: buildFooter(settings, font, st.bodyHalf),
    children: children.length ? children : [new Paragraph({ children: [] })],
  };

  return new Document({
    creator: "Wordmaker",
    title: "Document",
    styles: {
      default: {
        document: { run: { font, size: st.bodyHalf } },
      },
    },
    numbering: {
      config: [
        {
          reference: "wm-ordered",
          levels: [0, 1, 2, 3, 4, 5].map((level) => ({
            level,
            format: LevelFormat.DECIMAL,
            text: `%${level + 1}.`,
            alignment: AlignmentType.START,
            style: {
              paragraph: {
                indent: {
                  left: convertInchesToTwip(0.35 * (level + 1)),
                  hanging: convertInchesToTwip(0.25),
                },
              },
            },
          })),
        },
      ],
    },
    sections: [section],
  });
}

// ── running header / footer (mirrors the PDF options) ────────────────────────
function buildHeader(md: string, settings: Settings, font: string, bodyHalf: number) {
  if (!settings.showHeader) return undefined;
  const title = documentTitle(md);
  return {
    default: new Header({
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: title, font, size: Math.round(bodyHalf * 0.85), color: "71717A" }),
          ],
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 4, color: "E4E4E7", space: 4 },
          },
        }),
      ],
    }),
  };
}

function buildFooter(settings: Settings, font: string, bodyHalf: number) {
  if (!settings.showFooter && !settings.showPageNumbers) return undefined;

  const pageWidth = settings.pageSize === "a4" ? 8.27 : 8.5;
  const rightTab = convertInchesToTwip(pageWidth - 2 * settings.margin);
  const size = Math.round(bodyHalf * 0.82);
  const children: (TextRun | ExternalHyperlink)[] = [];

  const ft = settings.footerText.trim();
  if (settings.showFooter && ft) {
    if (/(github\.com|https?:\/\/|\.\w{2,})/.test(ft)) {
      const url = /^https?:\/\//.test(ft) ? ft : `https://${ft.replace(/^\/+/, "")}`;
      children.push(
        new ExternalHyperlink({
          link: url,
          children: [new TextRun({ text: ft, font, size, color: "71717A" })],
        })
      );
    } else {
      children.push(new TextRun({ text: ft, font, size, color: "71717A" }));
    }
  }

  if (settings.showPageNumbers) {
    children.push(new TextRun({ text: "\t", font, size }));
    children.push(
      new TextRun({
        children: ["Page ", PageNumber.CURRENT, " / ", PageNumber.TOTAL_PAGES],
        font,
        size,
        color: "71717A",
      })
    );
  }

  return {
    default: new Footer({
      children: [
        new Paragraph({
          tabStops: [{ type: TabStopType.RIGHT, position: rightTab }],
          children,
        }),
      ],
    }),
  };
}

// ── browser-only: build, pack to a Blob ──────────────────────────────────────
export async function buildDocumentBlob(md: string, settings: Settings): Promise<Blob> {
  return Packer.toBlob(buildDocument(md, settings));
}

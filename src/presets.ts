import type { FontOption, Preset } from "./types";

/**
 * Each font decouples the *display* family (a nice web font used in the live
 * preview and the printed PDF) from the *docx* family (a name that actually
 * exists in Microsoft Word), chosen to look as close as possible to the
 * display font. That way both export paths look good.
 */
export const FONTS: FontOption[] = [
  {
    id: "inter",
    label: "Inter — modern sans",
    css: "'Inter', system-ui, sans-serif",
    docx: "Calibri",
    kind: "sans",
  },
  {
    id: "plex",
    label: "IBM Plex Sans — neutral sans",
    css: "'IBM Plex Sans', system-ui, sans-serif",
    docx: "Segoe UI",
    kind: "sans",
  },
  {
    id: "arial",
    label: "Helvetica / Arial — classic sans",
    css: "Helvetica, Arial, sans-serif",
    docx: "Arial",
    kind: "sans",
  },
  {
    id: "lora",
    label: "Lora — elegant serif",
    css: "'Lora', Georgia, serif",
    docx: "Georgia",
    kind: "serif",
  },
  {
    id: "source-serif",
    label: "Source Serif — book serif",
    css: "'Source Serif 4', Cambria, serif",
    docx: "Cambria",
    kind: "serif",
  },
  {
    id: "georgia",
    label: "Georgia — readable serif",
    css: "Georgia, 'Times New Roman', serif",
    docx: "Georgia",
    kind: "serif",
  },
];

export function fontById(id: string): FontOption {
  return FONTS.find((f) => f.id === id) ?? FONTS[0];
}

export const PRESETS: Preset[] = [
  {
    id: "modern-sans",
    label: "Modern Sans",
    settings: {
      fontId: "inter",
      bodySize: 11.5,
      titleSize: 30,
      lineHeight: 1.6,
      paraSpacing: 0.85,
      margin: 1.0,
    },
  },
  {
    id: "classic-serif",
    label: "Classic Serif",
    settings: {
      fontId: "lora",
      bodySize: 12,
      titleSize: 28,
      lineHeight: 1.7,
      paraSpacing: 0.9,
      margin: 1.1,
    },
  },
  {
    id: "academic",
    label: "Academic",
    settings: {
      fontId: "source-serif",
      bodySize: 12,
      titleSize: 22,
      lineHeight: 1.95,
      paraSpacing: 0.45,
      margin: 1.0,
    },
  },
  {
    id: "report",
    label: "Clean Report",
    settings: {
      fontId: "plex",
      bodySize: 11,
      titleSize: 26,
      lineHeight: 1.55,
      paraSpacing: 0.8,
      margin: 1.0,
    },
  },
  {
    id: "compact",
    label: "Compact",
    settings: {
      fontId: "arial",
      bodySize: 10.5,
      titleSize: 19,
      lineHeight: 1.4,
      paraSpacing: 0.55,
      margin: 0.75,
    },
  },
];

export function presetById(id: string): Preset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0];
}

export const SAMPLE_MARKDOWN = `# The Anatomy of a Good Document

A well-formatted document is **invisible**: the reader notices the ideas, not
the typography. This sample shows how *Wordmaker* renders common Markdown.

## Why formatting matters

Good spacing and a consistent type scale make text easier to scan. A few rules
go a long way:

1. Keep line height generous — around 1.5–1.7 for body text.
2. Give paragraphs room to breathe.
3. Use a clear hierarchy of heading sizes.

### Things you can write

- **Bold** and *italic* and ~~strikethrough~~ text
- Inline \`code\` for short snippets
- [Links](https://example.com) that stay tidy
- Nested lists:
  - like this one
  - and this

> Typography is the craft of endowing human language with a durable visual
> form. A blockquote is set apart so the reader knows it is borrowed voice.

\`\`\`
function greet(name) {
  return \`Hello, \${name}!\`;
}
\`\`\`

## A small table

| Element     | Purpose                  | Frequency |
| ----------- | ------------------------ | --------- |
| Heading     | Structure and hierarchy  | High      |
| Paragraph   | The body of the argument | Constant  |
| Blockquote  | Emphasis / citation      | Sparingly |

---

That's it. Tweak the font, sizes, and spacing on the left, then export to
**Word** or **PDF**.
`;

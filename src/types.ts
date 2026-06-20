export type PageSize = "letter" | "a4";

export interface Settings {
  /** id of the chosen font from FONTS */
  fontId: string;
  /** body text size in points */
  bodySize: number;
  /** H1 / title size in points */
  titleSize: number;
  /** unitless line height multiplier */
  lineHeight: number;
  /** space after a paragraph, in em (relative to body size) */
  paraSpacing: number;
  /** page margin in inches */
  margin: number;

  // ── output / page options (not part of a style preset) ──
  pageSize: PageSize;
  /** false → render as one continuous page instead of paginating */
  paginate: boolean;
  /** running header (the document title, centered) on every page */
  showHeader: boolean;
  /** running footer (footerText) on every page */
  showFooter: boolean;
  /** show "Page x / N" in the footer */
  showPageNumbers: boolean;
  /** editable footer text (defaults to the repo link) */
  footerText: string;
}

/** Settings keys that are output options, not typographic style. */
export const OUTPUT_KEYS = [
  "pageSize",
  "paginate",
  "showHeader",
  "showFooter",
  "showPageNumbers",
  "footerText",
] as const;

export type OutputKey = (typeof OUTPUT_KEYS)[number];

/** Typographic style only — the part a preset controls. */
export type StyleSettings = Omit<Settings, OutputKey>;

export const DEFAULT_OUTPUT: Pick<Settings, OutputKey> = {
  pageSize: "letter",
  paginate: true,
  showHeader: false,
  showFooter: true,
  showPageNumbers: true,
  footerText: "github.com/christianptc/wordmaker",
};

export interface FontOption {
  id: string;
  label: string;
  /** CSS font stack used for on-screen preview */
  css: string;
  /** Word-safe font name written into the .docx */
  docx: string;
  kind: "sans" | "serif";
}

export interface Preset {
  id: string;
  label: string;
  /** the typographic settings this style applies (font + sizing/spacing) */
  settings: StyleSettings;
}

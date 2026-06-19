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
  pageSize: PageSize;
}

export interface FontOption {
  id: string;
  label: string;
  /** CSS font stack used for on-screen preview + the printed PDF */
  css: string;
  /** Word-safe font name written into the .docx */
  docx: string;
  kind: "sans" | "serif";
}

export interface Preset {
  id: string;
  label: string;
  /** the typographic settings this style applies (font + sizing/spacing) */
  settings: Omit<Settings, "pageSize">;
}

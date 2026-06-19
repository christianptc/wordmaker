import type { Settings } from "./types";

export interface HeadingSizes {
  h1: number;
  h2: number;
  h3: number;
  h4: number;
  h5: number;
  h6: number;
}

/**
 * Derive heading sizes (in points) from the body size and the chosen title
 * (H1) size. H2–H6 are interpolated between the two on a smooth curve so the
 * type scale always feels balanced regardless of the user's choices.
 *
 * Shared by the live preview (CSS) and the .docx exporter so both agree.
 */
export function headingSizes(s: Settings): HeadingSizes {
  const b = s.bodySize;
  const t = Math.max(s.titleSize, b); // title never smaller than body
  const lerp = (k: number) => Math.round((b + (t - b) * k) * 10) / 10;
  return {
    h1: Math.round(t * 10) / 10,
    h2: lerp(0.62),
    h3: lerp(0.4),
    h4: lerp(0.24),
    h5: lerp(0.12),
    h6: b,
  };
}

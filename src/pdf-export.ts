import type { Settings } from "./types";

/**
 * Export to PDF using the browser's own print engine. This yields real,
 * selectable vector text in the chosen font, with the exact spacing shown in
 * the preview — far higher fidelity than rasterizing the DOM to a canvas.
 *
 * We inject an @page rule so the page size and margins match the settings,
 * then call print(); the user picks "Save as PDF" (macOS) or "Microsoft Print
 * to PDF" (Windows), both of which are built in.
 */
export function exportPdf(settings: Settings) {
  const id = "wm-print-page";
  let style = document.getElementById(id) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = id;
    document.head.appendChild(style);
  }
  const size = settings.pageSize === "a4" ? "A4" : "Letter";
  style.textContent = `@page { size: ${size}; margin: ${settings.margin}in; }`;

  // Align the printed footer's inset with the page margin so the GitHub link
  // sits flush under the left edge of the text block.
  document.documentElement.style.setProperty("--pdf-margin", `${settings.margin}in`);

  // Let the style apply before opening the print dialog.
  requestAnimationFrame(() => window.print());
}

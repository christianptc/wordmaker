import "./style.css";
import { FONTS, PRESETS, SAMPLE_MARKDOWN, fontById, presetById } from "./presets";
import { renderHtml } from "./markdown";
import { headingSizes } from "./typography";
import { exportDocx } from "./docx-export";
import { exportPdf } from "./pdf-export";
import type { PageSize, Settings } from "./types";

const STORE_KEY = "wordmaker:v1";

// ── element handles ──────────────────────────────────────────────────────────
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const els = {
  preset: $<HTMLSelectElement>("preset"),
  font: $<HTMLSelectElement>("font"),
  bodySize: $<HTMLInputElement>("bodySize"),
  titleSize: $<HTMLInputElement>("titleSize"),
  lineHeight: $<HTMLInputElement>("lineHeight"),
  paraSpacing: $<HTMLInputElement>("paraSpacing"),
  margin: $<HTMLInputElement>("margin"),
  pageSize: $<HTMLSelectElement>("pageSize"),
  bodySizeVal: $("bodySizeVal"),
  titleSizeVal: $("titleSizeVal"),
  lineHeightVal: $("lineHeightVal"),
  paraSpacingVal: $("paraSpacingVal"),
  marginVal: $("marginVal"),
  editor: $<HTMLTextAreaElement>("editor"),
  paper: $("paper"),
  wordCount: $("wordCount"),
  pageHint: $("pageHint"),
  exportDocx: $<HTMLButtonElement>("exportDocx"),
  exportPdf: $<HTMLButtonElement>("exportPdf"),
  loadSample: $<HTMLButtonElement>("loadSample"),
  clear: $<HTMLButtonElement>("clear"),
  reset: $<HTMLButtonElement>("reset"),
};

// ── state ────────────────────────────────────────────────────────────────────
interface AppState {
  presetId: string;
  settings: Settings;
  markdown: string;
}

const defaultPreset = PRESETS[0];
let state: AppState = load() ?? {
  presetId: defaultPreset.id,
  settings: { ...defaultPreset.settings, pageSize: "letter" },
  markdown: SAMPLE_MARKDOWN,
};

function load(): AppState | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppState;
    if (!parsed?.settings) return null;
    return parsed;
  } catch {
    return null;
  }
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota / private mode */
  }
}

// ── populate option lists ────────────────────────────────────────────────────
function buildOptions() {
  els.preset.innerHTML = PRESETS.map(
    (p) => `<option value="${p.id}">${p.label}</option>`
  ).join("");
  els.font.innerHTML = FONTS.map(
    (f) => `<option value="${f.id}">${f.label}</option>`
  ).join("");
}

// ── reflect state → controls ─────────────────────────────────────────────────
function syncControls() {
  const s = state.settings;
  els.preset.value = state.presetId;
  els.font.value = s.fontId;
  els.bodySize.value = String(s.bodySize);
  els.titleSize.value = String(s.titleSize);
  els.lineHeight.value = String(s.lineHeight);
  els.paraSpacing.value = String(s.paraSpacing);
  els.margin.value = String(s.margin);
  els.pageSize.value = s.pageSize;

  els.bodySizeVal.textContent = `${s.bodySize} pt`;
  els.titleSizeVal.textContent = `${s.titleSize} pt`;
  els.lineHeightVal.textContent = s.lineHeight.toFixed(2);
  els.paraSpacingVal.textContent = `${s.paraSpacing.toFixed(2)} em`;
  els.marginVal.textContent = `${s.margin.toFixed(2)} in`;
  els.pageHint.textContent =
    s.pageSize === "a4" ? "A4 · 210 × 297 mm" : "Letter · 8.5 × 11 in";
}

// ── apply typography to the preview paper via CSS variables ──────────────────
function applyStyles() {
  const s = state.settings;
  const font = fontById(s.fontId);
  const h = headingSizes(s);
  const p = els.paper.style;

  p.setProperty("--doc-font", font.css);
  p.setProperty("--doc-size", `${s.bodySize}pt`);
  p.setProperty("--doc-line", String(s.lineHeight));
  p.setProperty("--doc-para", `${s.paraSpacing}em`);
  p.setProperty("--doc-pad", `${s.margin}in`);
  p.setProperty("--doc-h1", `${h.h1}pt`);
  p.setProperty("--doc-h2", `${h.h2}pt`);
  p.setProperty("--doc-h3", `${h.h3}pt`);
  p.setProperty("--doc-h4", `${h.h4}pt`);
  p.setProperty("--doc-h5", `${h.h5}pt`);
  p.setProperty("--doc-h6", `${h.h6}pt`);
  p.maxWidth = s.pageSize === "a4" ? "8.27in" : "8.5in";
}

// ── render preview + counters ────────────────────────────────────────────────
function renderPreview() {
  els.paper.innerHTML = renderHtml(state.markdown);
  const words = state.markdown.trim().match(/\S+/g)?.length ?? 0;
  els.wordCount.textContent = `${words.toLocaleString()} word${words === 1 ? "" : "s"}`;
}

// ── change handlers ──────────────────────────────────────────────────────────
function onSettingChange<K extends keyof Settings>(key: K, value: Settings[K]) {
  state.settings = { ...state.settings, [key]: value };
  applyStyles();
  syncControls();
  save();
}

function applyPreset(id: string) {
  const preset = presetById(id);
  state.presetId = id;
  state.settings = { ...preset.settings, pageSize: state.settings.pageSize };
  applyStyles();
  syncControls();
  save();
}

// ── wire events ──────────────────────────────────────────────────────────────
function wire() {
  els.preset.addEventListener("change", () => applyPreset(els.preset.value));

  els.font.addEventListener("change", () => onSettingChange("fontId", els.font.value));
  els.bodySize.addEventListener("input", () =>
    onSettingChange("bodySize", parseFloat(els.bodySize.value))
  );
  els.titleSize.addEventListener("input", () =>
    onSettingChange("titleSize", parseFloat(els.titleSize.value))
  );
  els.lineHeight.addEventListener("input", () =>
    onSettingChange("lineHeight", parseFloat(els.lineHeight.value))
  );
  els.paraSpacing.addEventListener("input", () =>
    onSettingChange("paraSpacing", parseFloat(els.paraSpacing.value))
  );
  els.margin.addEventListener("input", () =>
    onSettingChange("margin", parseFloat(els.margin.value))
  );
  els.pageSize.addEventListener("change", () =>
    onSettingChange("pageSize", els.pageSize.value as PageSize)
  );

  els.editor.addEventListener("input", () => {
    state.markdown = els.editor.value;
    renderPreview();
    save();
  });

  els.loadSample.addEventListener("click", () => {
    state.markdown = SAMPLE_MARKDOWN;
    els.editor.value = SAMPLE_MARKDOWN;
    renderPreview();
    save();
  });

  els.clear.addEventListener("click", () => {
    state.markdown = "";
    els.editor.value = "";
    renderPreview();
    save();
    els.editor.focus();
  });

  els.reset.addEventListener("click", () => applyPreset(state.presetId));

  els.exportPdf.addEventListener("click", () => exportPdf(state.settings));

  els.exportDocx.addEventListener("click", async () => {
    const label = els.exportDocx.textContent;
    els.exportDocx.disabled = true;
    els.exportDocx.textContent = "Building…";
    try {
      await exportDocx(state.markdown, state.settings, docName());
    } catch (err) {
      console.error(err);
      alert("Sorry — something went wrong building the .docx file.");
    } finally {
      els.exportDocx.disabled = false;
      els.exportDocx.textContent = label;
    }
  });

  // Tab inserts two spaces in the editor instead of leaving the field.
  els.editor.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = els.editor;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      ta.value = ta.value.slice(0, start) + "  " + ta.value.slice(end);
      ta.selectionStart = ta.selectionEnd = start + 2;
      state.markdown = ta.value;
      renderPreview();
      save();
    }
  });

  // Cmd/Ctrl+S → export Word; Cmd/Ctrl+P → export PDF.
  window.addEventListener("keydown", (e) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    if (e.key.toLowerCase() === "s") {
      e.preventDefault();
      els.exportDocx.click();
    } else if (e.key.toLowerCase() === "p") {
      e.preventDefault();
      exportPdf(state.settings);
    }
  });
}

/** Derive a filename from the first heading / first line of the document. */
function docName(): string {
  const firstLine =
    state.markdown
      .split("\n")
      .map((l) => l.replace(/^#+\s*/, "").trim())
      .find((l) => l.length > 0) ?? "document";
  const slug = firstLine
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "document"}.docx`;
}

// ── init ─────────────────────────────────────────────────────────────────────
buildOptions();
els.editor.value = state.markdown;
syncControls();
applyStyles();
renderPreview();
wire();

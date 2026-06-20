import "./style.css";
import { FONTS, PRESETS, SAMPLE_MARKDOWN, fontById, presetById } from "./presets";
import { renderHtml } from "./markdown";
import { headingSizes } from "./typography";
import { documentTitle, documentSlug } from "./doc-title";
import { download } from "./download";
import { DEFAULT_OUTPUT, OUTPUT_KEYS } from "./types";
import type { PageSize, Settings } from "./types";
import {
  addRecord,
  clearAll,
  deleteRecord,
  listRecords,
  newId,
  type HistoryRecord,
} from "./history";
import { renderHistory, type HistoryHandlers } from "./history-view";

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
  paginate: $<HTMLInputElement>("paginate"),
  showHeader: $<HTMLInputElement>("showHeader"),
  showFooter: $<HTMLInputElement>("showFooter"),
  showPageNumbers: $<HTMLInputElement>("showPageNumbers"),
  footerText: $<HTMLInputElement>("footerText"),
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
  viewnav: $("viewnav"),
  historyCount: $("historyCount"),
  workspace: $("workspace"),
  history: $("history"),
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
  settings: { ...defaultPreset.settings, ...DEFAULT_OUTPUT },
  markdown: SAMPLE_MARKDOWN,
};

function load(): AppState | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AppState>;
    if (!parsed?.settings) return null;
    // merge so older saves gain any newly added output options
    const settings = { ...defaultPreset.settings, ...DEFAULT_OUTPUT, ...parsed.settings } as Settings;
    return {
      presetId: parsed.presetId ?? defaultPreset.id,
      settings,
      markdown: parsed.markdown ?? "",
    };
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
function updateReadouts() {
  const s = state.settings;
  els.bodySizeVal.textContent = `${s.bodySize} pt`;
  els.titleSizeVal.textContent = `${s.titleSize} pt`;
  els.lineHeightVal.textContent = s.lineHeight.toFixed(2);
  els.paraSpacingVal.textContent = `${s.paraSpacing.toFixed(2)} em`;
  els.marginVal.textContent = `${s.margin.toFixed(2)} in`;
  els.pageHint.textContent = s.pageSize === "a4" ? "A4 · 210 × 297 mm" : "Letter · 8.5 × 11 in";
}

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
  els.paginate.checked = s.paginate;
  els.showHeader.checked = s.showHeader;
  els.showFooter.checked = s.showFooter;
  els.showPageNumbers.checked = s.showPageNumbers;
  els.footerText.value = s.footerText;
  updateReadouts();
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
  updateReadouts();
  save();
}

function applyPreset(id: string) {
  const preset = presetById(id);
  state.presetId = id;
  const keepOutput = Object.fromEntries(
    OUTPUT_KEYS.map((k) => [k, state.settings[k]])
  ) as Pick<Settings, (typeof OUTPUT_KEYS)[number]>;
  state.settings = { ...preset.settings, ...keepOutput };
  applyStyles();
  syncControls();
  save();
}

// ── export → download + save to history ──────────────────────────────────────
async function doExport(kind: "pdf" | "docx") {
  const btn = kind === "pdf" ? els.exportPdf : els.exportDocx;
  btn.disabled = true;
  btn.classList.add("is-busy");
  try {
    const base = documentSlug(state.markdown);
    let blob: Blob;
    let name: string;
    if (kind === "pdf") {
      const m = await import("./pdf-export");
      blob = m.buildPdfBlob(state.markdown, state.settings);
      name = `${base}.pdf`;
    } else {
      const m = await import("./docx-export");
      blob = await m.buildDocumentBlob(state.markdown, state.settings);
      name = `${base}.docx`;
    }
    download(blob, name);
    await saveToHistory(kind, name, blob);
  } catch (err) {
    console.error(err);
    alert(`Sorry — the ${kind.toUpperCase()} export failed.\n\n${(err as Error)?.message ?? err}`);
  } finally {
    btn.disabled = false;
    btn.classList.remove("is-busy");
  }
}

async function saveToHistory(kind: "pdf" | "docx", name: string, blob: Blob) {
  const rec: HistoryRecord = {
    id: newId(),
    name,
    kind,
    size: blob.size,
    createdAt: Date.now(),
    title: documentTitle(state.markdown),
    markdown: state.markdown,
    settings: { ...state.settings },
    blob,
  };
  try {
    await addRecord(rec);
    await refreshHistoryCount();
    if (currentView === "history") loadHistory();
  } catch (e) {
    console.warn("Could not save to history", e);
  }
}

// ── history view ─────────────────────────────────────────────────────────────
const historyHandlers: HistoryHandlers = {
  onDownload: (rec) => download(rec.blob, rec.name),
  onOpen: (rec) => {
    state.markdown = rec.markdown;
    state.settings = { ...DEFAULT_OUTPUT, ...rec.settings };
    els.editor.value = rec.markdown;
    syncControls();
    applyStyles();
    renderPreview();
    save();
    setView("editor");
  },
  onDelete: async (rec) => {
    await deleteRecord(rec.id);
    await refreshHistoryCount();
    loadHistory();
  },
  onClear: async () => {
    if (!confirm("Delete all saved downloads? This cannot be undone.")) return;
    await clearAll();
    await refreshHistoryCount();
    loadHistory();
  },
};

async function loadHistory() {
  try {
    const recs = await listRecords();
    renderHistory(els.history, recs, historyHandlers);
  } catch (e) {
    console.error(e);
    els.history.innerHTML = `<div class="history__head"><div><h2 class="history__title">Download history</h2>
      <p class="history__sub">History is unavailable in this browser context.</p></div></div>`;
  }
}

async function refreshHistoryCount() {
  try {
    const recs = await listRecords();
    const n = recs.length;
    els.historyCount.textContent = String(n);
    els.historyCount.hidden = n === 0;
  } catch {
    els.historyCount.hidden = true;
  }
}

// ── view switching ───────────────────────────────────────────────────────────
type View = "editor" | "history";
let currentView: View = "editor";

function setView(v: View) {
  currentView = v;
  els.workspace.hidden = v !== "editor";
  els.history.hidden = v !== "history";
  els.viewnav.querySelectorAll<HTMLElement>(".viewnav__btn").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.view === v)
  );
  if (v === "history") loadHistory();
}

// ── wire events ──────────────────────────────────────────────────────────────
function wire() {
  els.preset.addEventListener("change", () => applyPreset(els.preset.value));
  els.font.addEventListener("change", () => onSettingChange("fontId", els.font.value));
  els.bodySize.addEventListener("input", () => onSettingChange("bodySize", parseFloat(els.bodySize.value)));
  els.titleSize.addEventListener("input", () => onSettingChange("titleSize", parseFloat(els.titleSize.value)));
  els.lineHeight.addEventListener("input", () => onSettingChange("lineHeight", parseFloat(els.lineHeight.value)));
  els.paraSpacing.addEventListener("input", () => onSettingChange("paraSpacing", parseFloat(els.paraSpacing.value)));
  els.margin.addEventListener("input", () => onSettingChange("margin", parseFloat(els.margin.value)));
  els.pageSize.addEventListener("change", () => onSettingChange("pageSize", els.pageSize.value as PageSize));

  els.paginate.addEventListener("change", () => onSettingChange("paginate", els.paginate.checked));
  els.showHeader.addEventListener("change", () => onSettingChange("showHeader", els.showHeader.checked));
  els.showFooter.addEventListener("change", () => onSettingChange("showFooter", els.showFooter.checked));
  els.showPageNumbers.addEventListener("change", () =>
    onSettingChange("showPageNumbers", els.showPageNumbers.checked)
  );
  els.footerText.addEventListener("input", () => onSettingChange("footerText", els.footerText.value));

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

  els.exportPdf.addEventListener("click", () => doExport("pdf"));
  els.exportDocx.addEventListener("click", () => doExport("docx"));

  els.viewnav.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-view]");
    if (b) setView(b.dataset.view as View);
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
    const k = e.key.toLowerCase();
    if (k === "s") {
      e.preventDefault();
      doExport("docx");
    } else if (k === "p") {
      e.preventDefault();
      doExport("pdf");
    }
  });
}

// ── init ─────────────────────────────────────────────────────────────────────
buildOptions();
els.editor.value = state.markdown;
syncControls();
applyStyles();
renderPreview();
wire();
setView("editor");
refreshHistoryCount();

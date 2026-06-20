import type { HistoryRecord } from "./history";

export interface HistoryHandlers {
  onDownload(rec: HistoryRecord): void;
  onOpen(rec: HistoryRecord): void;
  onDelete(rec: HistoryRecord): void;
  onClear(): void;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fmtDate(ts: number): string {
  const diff = Date.now() - ts;
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < min) return "just now";
  if (diff < hr) return `${Math.floor(diff / min)} min ago`;
  if (diff < day) return `${Math.floor(diff / hr)} h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function snippet(md: string): string {
  const line = md
    .split("\n")
    .map((l) => l.replace(/^#+\s*/, "").replace(/[*_`>#-]/g, "").trim())
    .find((l) => l.length > 0);
  return line ? (line.length > 90 ? line.slice(0, 90) + "…" : line) : "Empty document";
}

export function renderHistory(container: HTMLElement, records: HistoryRecord[], h: HistoryHandlers) {
  const byId = new Map(records.map((r) => [r.id, r]));
  const totalSize = records.reduce((a, r) => a + r.size, 0);

  if (records.length === 0) {
    container.innerHTML = `
      <div class="history__head">
        <div>
          <h2 class="history__title">Download history</h2>
          <p class="history__sub">Every PDF and Word file you export is saved here.</p>
        </div>
      </div>
      <div class="history__empty">
        <div class="history__empty-mark">↓</div>
        <p>No downloads yet.</p>
        <p class="history__empty-hint">Export a Word or PDF document and it will appear here, ready to re-download or re-open any time.</p>
      </div>`;
    return;
  }

  const cards = records
    .map((r) => {
      const fontLabel = r.settings.fontId;
      return `
      <article class="hcard">
        <div class="hcard__top">
          <span class="badge badge--${r.kind}">${r.kind.toUpperCase()}</span>
          <time class="hcard__time">${esc(fmtDate(r.createdAt))}</time>
        </div>
        <h3 class="hcard__name" title="${esc(r.name)}">${esc(r.name)}</h3>
        <p class="hcard__snippet">${esc(snippet(r.markdown))}</p>
        <p class="hcard__meta">${fmtBytes(r.size)} · ${r.settings.bodySize}pt · ${esc(fontLabel)} · ${
          r.settings.pageSize === "a4" ? "A4" : "Letter"
        }</p>
        <div class="hcard__actions">
          <button class="btn btn--solid btn--sm" data-action="download" data-id="${r.id}">Download</button>
          <button class="btn btn--ghost btn--sm" data-action="open" data-id="${r.id}">Open in editor</button>
          <button class="hcard__del" data-action="delete" data-id="${r.id}" title="Delete" aria-label="Delete">
            <svg viewBox="0 0 24 24" width="15" height="15"><path fill="currentColor" d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-1 12H7L6 9Z"/></svg>
          </button>
        </div>
      </article>`;
    })
    .join("");

  container.innerHTML = `
    <div class="history__head">
      <div>
        <h2 class="history__title">Download history</h2>
        <p class="history__sub">${records.length} file${records.length === 1 ? "" : "s"} · ${fmtBytes(totalSize)} stored locally</p>
      </div>
      <button class="btn btn--quiet" data-action="clear">Clear all</button>
    </div>
    <div class="history__grid">${cards}</div>`;

  container.onclick = (e) => {
    const btn = (e.target as HTMLElement).closest("[data-action]") as HTMLElement | null;
    if (!btn) return;
    const action = btn.dataset.action!;
    if (action === "clear") {
      h.onClear();
      return;
    }
    const rec = byId.get(btn.dataset.id!);
    if (!rec) return;
    if (action === "download") h.onDownload(rec);
    else if (action === "open") h.onOpen(rec);
    else if (action === "delete") h.onDelete(rec);
  };
}

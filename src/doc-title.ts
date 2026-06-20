/** Derive a document title from the first H1, else the first non-empty line. */
export function documentTitle(md: string): string {
  const lines = md.split("\n");
  const h1 = lines.find((l) => /^#\s+\S/.test(l));
  if (h1) return h1.replace(/^#\s+/, "").trim();
  const first = lines.map((l) => l.replace(/^#+\s*/, "").trim()).find((l) => l.length > 0);
  return first ?? "Document";
}

/** A filesystem-safe base name (no extension) derived from the title. */
export function documentSlug(md: string): string {
  const slug = documentTitle(md)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "document";
}

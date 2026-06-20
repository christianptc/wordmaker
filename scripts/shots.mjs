// Drive the real app with the system Chrome to (a) verify the exported PDF and
// (b) capture README screenshots. Requires `npm run preview` on :4173.
//
// Every output PNG is flattened onto white and brightness-checked, so a
// transparent/black frame can never end up in the README.
import puppeteer from "puppeteer-core";
import { execSync } from "node:child_process";
import { deflateSync, crc32 } from "node:zlib";
import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  statSync,
  mkdirSync,
} from "node:fs";
import { basename, join } from "node:path";

// ── minimal opaque-RGB PNG encoder (no alpha channel at all) ────────────────
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0, 0);
  return Buffer.concat([len, body, crc]);
}
function writeRgbPng(w, h, rgb, outPath) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 = truecolour RGB (no alpha)
  const stride = w * 3;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const png = Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  writeFileSync(outPath, png);
}

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL = "http://localhost:4173/";
const DL = "/tmp/wm-downloads";
const QL = "/tmp/wm-ql";

for (const d of [DL, QL]) {
  rmSync(d, { recursive: true, force: true });
  mkdirSync(d, { recursive: true });
}
mkdirSync("docs", { recursive: true });

const COVER_LETTER = `# Bewerbung als Werkstudent

Sehr geehrte Frau Müller,

mit großem Interesse habe ich Ihre Stellenanzeige gelesen. Als
**Informatikstudent** im fünften Semester bringe ich solide Kenntnisse in
*TypeScript*, Node.js und modernem Frontend-Design mit.

## Was ich mitbringe

- Erfahrung mit \`React\`, \`Vite\` und CI/CD-Pipelines
- Sauberer, gut dokumentierter Code
- Eigenständige, strukturierte Arbeitsweise

> Ich arbeite gern im Team, übernehme aber auch gern Verantwortung für
> abgeschlossene Features.

Über die Gelegenheit zu einem persönlichen Gespräch würde ich mich sehr freuen.

Mit freundlichen Grüßen
Christian
`;

// ── helpers ──────────────────────────────────────────────────────────────────
/** Mean brightness (0–255) of a PNG, via a 1×1 BMP downscale. */
function meanBrightness(png) {
  const bmp = "/tmp/wm-px.bmp";
  execSync(`sips -z 1 1 -s format bmp "${png}" --out "${bmp}"`, { stdio: "ignore" });
  const b = readFileSync(bmp);
  const off = b.readUInt32LE(10);
  return (b[off] + b[off + 1] + b[off + 2]) / 3;
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--force-color-profile=srgb"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1480, height: 1000, deviceScaleFactor: 2 });

const client = await page.target().createCDPSession();
await client.send("Browser.setDownloadBehavior", {
  behavior: "allow",
  downloadPath: DL,
  eventsEnabled: true,
});

const settle = async () => {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  await new Promise((r) => setTimeout(r, 350));
};

/**
 * Composite a (possibly transparent) PNG onto solid white in-page, then write
 * it back out as an opaque RGB PNG with no alpha channel whatsoever — so it
 * renders identically on light and dark GitHub themes.
 */
async function flattenToRgbPng(srcPath, outPath) {
  const dataUrl = `data:image/png;base64,${readFileSync(srcPath).toString("base64")}`;
  const { w, h, b64, minA } = await page.evaluate(
    (src) =>
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement("canvas");
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          const ctx = c.getContext("2d");
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0);
          const d = ctx.getImageData(0, 0, c.width, c.height).data;
          const rgb = new Uint8Array(c.width * c.height * 3);
          let minAlpha = 255;
          for (let i = 0, j = 0; i < d.length; i += 4, j += 3) {
            rgb[j] = d[i];
            rgb[j + 1] = d[i + 1];
            rgb[j + 2] = d[i + 2];
            if (d[i + 3] < minAlpha) minAlpha = d[i + 3];
          }
          const parts = [];
          for (let k = 0; k < rgb.length; k += 0x8000)
            parts.push(String.fromCharCode.apply(null, rgb.subarray(k, k + 0x8000)));
          resolve({ w: c.width, h: c.height, b64: btoa(parts.join("")), minA: minAlpha });
        };
        img.onerror = () => reject(new Error("image load failed"));
        img.src = src;
      }),
    dataUrl
  );
  writeRgbPng(w, h, Buffer.from(b64, "base64"), outPath);
  return minA;
}

/** Screenshot, retrying if the frame comes back dark (GPU black-frame guard). */
async function capture(outPath) {
  for (let i = 0; i < 6; i++) {
    await settle();
    await page.screenshot({ path: outPath });
    const m = meanBrightness(outPath);
    if (m >= 80) return m;
    console.log(`  · ${outPath} dark (mean ${m.toFixed(0)}), retry ${i + 1}…`);
    await new Promise((r) => setTimeout(r, 600));
  }
  throw new Error(`${outPath} stayed dark after retries`);
}

const setMarkdown = (md) =>
  page.evaluate((text) => {
    const ta = document.getElementById("editor");
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    set.call(ta, text);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }, md);

const setToggle = (id, on) =>
  page.evaluate(
    (i, v) => {
      const c = document.getElementById(i);
      if (c.checked !== v) {
        c.checked = v;
        c.dispatchEvent(new Event("change", { bubbles: true }));
      }
    },
    id,
    on
  );

// ── 1) Hero — editor view, default sample ───────────────────────────────────
await page.goto(URL, { waitUntil: "networkidle0" });
await capture("docs/app.png");

// ── 2) Real export → verify, then a crisp, white-flattened PDF image ────────
await setMarkdown(COVER_LETTER);
await setToggle("showHeader", true);
await setToggle("showFooter", true);
await settle();

const before = new Set(readdirSync(DL));
await page.click("#exportPdf");

const pdfPath = await (async () => {
  for (let i = 0; i < 60; i++) {
    const f = readdirSync(DL).filter((x) => x.endsWith(".pdf") && !before.has(x))[0];
    if (f) {
      const p = join(DL, f);
      const s1 = statSync(p).size;
      await new Promise((r) => setTimeout(r, 200));
      if (s1 > 0 && statSync(p).size === s1) return p;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("PDF download did not appear");
})();

const raw = execSync(`/usr/bin/strings "${pdfPath}"`, { maxBuffer: 1 << 24 }).toString();
const checks = {
  "valid PDF": execSync(`/usr/bin/file "${pdfPath}"`).toString().includes("PDF document"),
  "footer link present": raw.includes("github.com/christianptc/wordmaker"),
  "no 'localhost' chrome": !raw.toLowerCase().includes("localhost"),
  "page number present": raw.includes("Page "),
};
let ok = true;
for (const [k, v] of Object.entries(checks)) {
  console.log(`  ${v ? "✓" : "✗"} exported PDF: ${k}`);
  if (!v) ok = false;
}

// crisp vector raster via QuickLook, then composite onto white and re-encode
// as an opaque RGB PNG (no alpha) so it can never render dark.
execSync(`qlmanage -t -s 1600 -o "${QL}" "${pdfPath}"`, { stdio: "ignore" });
const qlPng = join(QL, `${basename(pdfPath)}.png`);
if (!existsSync(qlPng)) throw new Error("qlmanage raster missing");
const pdfMinAlpha = await flattenToRgbPng(qlPng, "docs/pdf.png");
console.log(`  ${pdfMinAlpha === 255 ? "✓" : "✗"} exported PDF: image fully opaque (min alpha ${pdfMinAlpha})`);
if (pdfMinAlpha !== 255) ok = false;

// ── 3) History view — contains the export ───────────────────────────────────
await page.evaluate(() => document.querySelector('[data-view="history"]').click());
await capture("docs/history.png");

await browser.close();

// final brightness report (a "black" image would be near 0)
console.log("");
for (const f of ["docs/app.png", "docs/pdf.png", "docs/history.png"]) {
  const m = meanBrightness(f);
  const hasAlpha = execSync(`sips -g hasAlpha "${f}"`).toString().includes("yes");
  console.log(`  ${m >= 80 && !hasAlpha ? "✓" : "✗"} ${f}: brightness ${m.toFixed(0)}, alpha=${hasAlpha}`);
  if (m < 80 || hasAlpha) ok = false;
}

console.log(ok ? "\n✓ all screenshots opaque, light, and verified" : "\n✗ a screenshot is dark or transparent");
if (!ok) process.exit(1);

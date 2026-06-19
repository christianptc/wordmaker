// Capture README screenshots with the system Chrome (no Chromium download).
// Not part of the app build; run ad-hoc to refresh docs/ images.
import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL = "http://localhost:4173/";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--hide-scrollbars", "--force-color-profile=srgb"],
});

const page = await browser.newPage();
await page.setViewport({ width: 1480, height: 940, deviceScaleFactor: 2 });

async function settle() {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  await new Promise((r) => setTimeout(r, 350));
}

// helper: drive the app's localStorage to a given state, then reload.
async function setState(preset, settings, markdown) {
  await page.evaluate(
    (p, s, md) => {
      localStorage.setItem(
        "wordmaker:v1",
        JSON.stringify({ presetId: p, settings: s, markdown: md })
      );
    },
    preset,
    settings,
    markdown
  );
  await page.reload({ waitUntil: "networkidle0" });
  await settle();
}

// 1) Hero — default Modern Sans with the built-in sample.
await page.goto(URL, { waitUntil: "networkidle0" });
await settle();
await page.screenshot({ path: "docs/app.png" });

// 2) Classic Serif variant, to show styling changes.
const serifMd = `# On Typography

The quick brown fox jumps over the lazy dog. Good documents feel
**effortless** to read because the spacing and the type scale do the
quiet work of guiding the eye.

## A short list

1. Choose a typeface with intent.
2. Give the body generous line height.
3. Let headings breathe.

> Whitespace is to be regarded as an active element, not a passive
> background.
`;
await setState(
  "classic-serif",
  {
    fontId: "lora",
    bodySize: 12,
    titleSize: 30,
    lineHeight: 1.75,
    paraSpacing: 0.9,
    margin: 1.1,
    pageSize: "letter",
  },
  serifMd
);
await page.screenshot({ path: "docs/app-serif.png" });

// 3) Close-up of just the rendered "paper" for a clean preview crop.
const paper = await page.$("#paper");
await paper.screenshot({ path: "docs/preview.png" });

// 4) Print-emulated view: shows the exported PDF look, including the GitHub
//    repo link printed at the bottom-left (the running footer).
const margin = "0.9in";
await page.emulateMediaType("print");
await page.evaluate((m) => {
  document.documentElement.style.setProperty("--pdf-margin", m);
}, margin);
await page.addStyleTag({
  content: `@media print {
    html, body { background: #fff !important; }
    .preview__scroll { padding: 0 !important; }
    #paper { padding: ${margin} !important; }
  }`,
});
await page.setViewport({ width: 880, height: 1140, deviceScaleFactor: 2 });
await settle();
await page.screenshot({ path: "docs/pdf.png" });

await browser.close();
console.log("wrote docs/app.png, docs/app-serif.png, docs/preview.png, docs/pdf.png");

// Drive the real app with the system Chrome to (a) verify the exported PDF and
// (b) capture README screenshots. Requires `npm run preview` on :4173.
import puppeteer from "puppeteer-core";
import { execSync } from "node:child_process";
import { existsSync, readdirSync, rmSync, statSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL = "http://localhost:4173/";
const DL = "/tmp/wm-downloads";

rmSync(DL, { recursive: true, force: true });
mkdirSync(DL, { recursive: true });
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

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--hide-scrollbars", "--force-color-profile=srgb"],
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
  await new Promise((r) => setTimeout(r, 300));
};

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

await page.goto(URL, { waitUntil: "networkidle0" });
await settle();

// 1) Hero — default sample, editor view.
await page.screenshot({ path: "docs/app.png" });

// 2) Real export: cover letter, header on, footer on → verify + screenshot.
await setMarkdown(COVER_LETTER);
await setToggle("showHeader", true);
await setToggle("showFooter", true);
await settle();

const before = new Set(existsSync(DL) ? readdirSync(DL) : []);
await page.click("#exportPdf");

const waitForPdf = async () => {
  for (let i = 0; i < 60; i++) {
    const files = readdirSync(DL).filter((f) => f.endsWith(".pdf") && !before.has(f));
    if (files.length) {
      const f = join(DL, files[0]);
      const s1 = statSync(f).size;
      await new Promise((r) => setTimeout(r, 200));
      if (statSync(f).size === s1 && s1 > 0) return f;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("PDF download did not appear");
};
const pdfPath = await waitForPdf();

// verify contents
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

// rasterize first page for the README
execSync(`sips -s format png "${pdfPath}" --out docs/pdf.png`, { stdio: "ignore" });

// 3) History view — should now contain the export.
await page.evaluate(() => document.querySelector('[data-view="history"]').click());
await settle();
await page.screenshot({ path: "docs/history.png" });

await browser.close();
console.log(ok ? "\n✓ exported-PDF verification passed" : "\n✗ exported-PDF verification FAILED");
console.log("wrote docs/app.png, docs/pdf.png, docs/history.png");
if (!ok) process.exit(1);

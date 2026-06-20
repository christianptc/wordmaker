/**
 * Checks for the self-contained jsPDF generator (runs in Node):
 *  - produces a valid PDF
 *  - contains NO browser print chrome (no "localhost", no page-title bar)
 *  - includes the custom footer text when enabled
 *  - works in both paginated and continuous (single-page) modes
 *
 *   npm run test:pdf
 */
import { buildPdf } from "../src/pdf-export";
import { SAMPLE_MARKDOWN } from "../src/presets";
import type { Settings } from "../src/types";

const base: Settings = {
  fontId: "inter",
  bodySize: 11.5,
  titleSize: 30,
  lineHeight: 1.6,
  paraSpacing: 0.85,
  margin: 1,
  pageSize: "letter",
  paginate: true,
  showHeader: true,
  showFooter: true,
  showPageNumbers: true,
  footerText: "github.com/christianptc/wordmaker",
};

function pdfText(settings: Settings, md = SAMPLE_MARKDOWN) {
  const doc = buildPdf(md, settings);
  const buf = Buffer.from(doc.output("arraybuffer"));
  return { buf, text: buf.toString("latin1") };
}

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name} ${detail}`);
  }
};

// 1) valid PDF, paginated
{
  const { buf, text } = pdfText(base);
  check("paginated: valid %PDF header", text.startsWith("%PDF-"));
  check("paginated: non-trivial size", buf.length > 1000, `(${buf.length} bytes)`);
  check("paginated: footer link text present", text.includes("github.com/christianptc/wordmaker"));
  check("paginated: NO 'localhost' chrome", !text.toLowerCase().includes("localhost"));
  check("paginated: page-number field present", text.includes("Page "));
}

// 2) continuous single page (no pagination)
{
  const { buf, text } = pdfText({ ...base, paginate: false });
  check("continuous: valid PDF", text.startsWith("%PDF-") && buf.length > 1000);
  check("continuous: footer present", text.includes("github.com/christianptc/wordmaker"));
}

// 3) footer/header off → footer text absent
{
  const { text } = pdfText({ ...base, showFooter: false, showHeader: false, showPageNumbers: false });
  check("chrome off: footer text absent", !text.includes("github.com/christianptc/wordmaker"));
  check("chrome off: still valid PDF", text.startsWith("%PDF-"));
}

// 4) custom footer text honoured
{
  const { text } = pdfText({ ...base, footerText: "my-custom-footer-xyz" });
  check("custom footer honoured", text.includes("my-custom-footer-xyz"));
}

// 5) empty document does not throw
{
  const { text } = pdfText(base, "");
  check("empty doc: valid PDF", text.startsWith("%PDF-"));
}

console.log("");
if (failures) {
  console.error(`✗ ${failures} PDF check(s) failed`);
  process.exit(1);
} else {
  console.log("✓ all PDF checks passed");
}

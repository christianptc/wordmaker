/**
 * End-to-end check of the Markdown → .docx pipeline, runnable in Node (no DOM).
 * Verifies the token walker handles every supported construct and that docx can
 * actually pack the resulting document into a valid (non-trivial) .docx buffer.
 *
 *   npm test
 */
import { Packer } from "docx";
import { buildDocument } from "../src/docx-export";
import { SAMPLE_MARKDOWN } from "../src/presets";
import type { Settings } from "../src/types";

const settings: Settings = {
  fontId: "lora",
  bodySize: 12,
  titleSize: 28,
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

const cases: Record<string, string> = {
  sample: SAMPLE_MARKDOWN,
  empty: "",
  headings: "# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6\n",
  inline: "Normal **bold** *italic* ~~strike~~ `code` [link](https://x.com).",
  nestedLists:
    "1. first\n2. second\n   - sub a\n   - sub b\n     1. deep\n3. third\n\n- [ ] todo\n- [x] done\n",
  quoteAndCode: "> a quote\n> second line\n\n```\nconst x = 1;\nconsole.log(x);\n```\n",
  table: "| A | B |\n| :- | -: |\n| 1 | 2 |\n| 3 | 4 |\n",
  hr: "Above\n\n---\n\nBelow",
};

let failures = 0;

for (const [name, md] of Object.entries(cases)) {
  try {
    const doc = buildDocument(md, settings);
    const buf = await Packer.toBuffer(doc);
    if (!buf || buf.length < 400) {
      throw new Error(`buffer too small (${buf?.length ?? 0} bytes)`);
    }
    // .docx is a zip; first two bytes are "PK".
    if (buf[0] !== 0x50 || buf[1] !== 0x4b) {
      throw new Error("not a valid zip/docx header");
    }
    console.log(`  ✓ ${name.padEnd(14)} ${buf.length.toLocaleString()} bytes`);
  } catch (err) {
    failures++;
    console.error(`  ✗ ${name}:`, err instanceof Error ? err.message : err);
  }
}

console.log("");
if (failures) {
  console.error(`✗ ${failures} case(s) failed`);
  process.exit(1);
} else {
  console.log(`✓ all ${Object.keys(cases).length} cases produced valid .docx output`);
}

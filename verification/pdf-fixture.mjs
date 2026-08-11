// Generates a deterministic, real single-page PDF resume fixture with an
// accurate xref table, so it parses with pdf.js / pdf-parse exactly like a
// production resume. Run: node verification/pdf-fixture.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('./fixtures/minimal-resume.pdf', import.meta.url));
mkdirSync(dirname(OUT), { recursive: true });

const TEXT = 'Browser Proof Candidate Resume - Senior Fullstack Engineer - React TypeScript Node.js';

const content = `BT /F1 12 Tf 72 720 Td (${TEXT}) Tj ET`;

function buildPdf(text) {
  const objs = [];
  const add = (body) => {
    objs.push(body);
    return objs.length;
  };
  const catalog = add('<< /Type /Catalog /Pages 2 0 R >>');
  const pages = add('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  const page = add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>');
  const contents = add(`<< /Length ${text.length} >>\nstream\n${text}\nendstream`);
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  let out = '%PDF-1.4\n';
  const offsets = [];
  const render = (n) => `${n} 0 obj\n${objs[n - 1]}\nendobj\n`;
  for (let i = 1; i <= objs.length; i++) {
    offsets.push(out.length);
    out += render(i);
  }
  const xrefStart = out.length;
  out += `xref\n0 ${objs.length + 1}\n`;
  out += '0000000000 65535 f \n';
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return out;
}

const pdf = buildPdf(content);
writeFileSync(OUT, pdf, 'utf8');
console.log(`wrote ${OUT} (${pdf.length} bytes)`);

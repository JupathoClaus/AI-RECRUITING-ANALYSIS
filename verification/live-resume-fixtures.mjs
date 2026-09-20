import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('./fixtures', import.meta.url));
mkdirSync(DIR, { recursive: true });

function buildPdf(text) {
  const objs = [];
  const add = (body) => { objs.push(body); return objs.length; };
  const catalog = add('<< /Type /Catalog /Pages 2 0 R >>');
  const pages = add('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  const page = add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>');
  const contents = add(`<< /Length ${text.length} >>\nstream\n${text}\nendstream`);
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let out = '%PDF-1.4\n';
  const offsets = [];
  const render = (n) => `${n} 0 obj\n${objs[n - 1]}\nendobj\n`;
  for (let i = 1; i <= objs.length; i++) { offsets.push(out.length); out += render(i); }
  const xrefStart = out.length;
  out += `xref\n0 ${objs.length + 1}\n`;
  out += '0000000000 65535 f \n';
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return out;
}

const TEXT_A = 'Ava Liu - Senior Backend Engineer - 6 years building Node.js and TypeScript services with PostgreSQL schemas, REST APIs and queue workers. Led a five-person engineering team.';
const TEXT_B = 'Ben Okafor - Data Analyst - 4 years analysing business metrics with Excel and Python, building Power BI dashboards, financial reporting and budgeting for the finance team.';

writeFileSync(join(DIR, 'live-backend-resume.pdf'), buildPdf(TEXT_A), 'utf8');
writeFileSync(join(DIR, 'live-analyst-resume.pdf'), buildPdf(TEXT_B), 'utf8');
console.log('wrote live-backend-resume.pdf + live-analyst-resume.pdf');
console.log('A:', TEXT_A);
console.log('B:', TEXT_B);
const { writeFileSync } = require('fs');
const { resolve } = require('path');
const docx = require('docx');

const RESUME_TEXT = [
  'Test Candidate',
  'test.candidate@example.com',
  '+256 700 123456',
  'Nationality: Ugandan',
  'Address: Kampala, Uganda',
  '',
  'Professional Summary:',
  'Backend software engineer with five years of experience.',
  '',
  'Skills:',
  'TypeScript',
  'Node.js',
  'NestJS',
  'PostgreSQL',
  'Redis',
  'BullMQ',
  'Prisma',
  '',
  'Work Experience:',
  'Backend Engineer at Example Technologies from 2021 to 2026.',
  '',
  'Education:',
  'Bachelor of Science in Computer Science.',
  '',
  'Certification:',
  'AWS Certified Cloud Practitioner.',
].join('\n');

function generatePdf() {
  const pdfEsc = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const pdfContent = RESUME_TEXT.split('\n').map((l, i) => {
    if (i === 0) return `BT /F1 12 Tf 50 ${750 - i * 14} Td (${pdfEsc(l)}) Tj`;
    return `0 -14 Td (${pdfEsc(l)}) Tj`;
  }).join('\n') + ' ET';
  const streamLen = Buffer.byteLength(pdfContent);

  const pdf = [
    '%PDF-1.4',
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj',
    '4 0 obj<</Length ' + streamLen + '>>stream',
    pdfContent,
    'endstream',
    'endobj',
    '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Courier>>endobj',
    'xref',
    '0 6',
    '0000000000 65535 f ',
    '0000000009 00000 n ',
    '0000000058 00000 n ',
    '0000000115 00000 n ',
    '0000000255 00000 n ',
    '0000000350 00000 n ',
    'trailer<</Size 6/Root 1 0 R>>',
    'startxref',
    '396',
    '%%EOF',
  ].join('\n');

  const buf = Buffer.from(pdf, 'binary');
  writeFileSync(resolve(__dirname, 'sample-resume.pdf'), buf);
  console.log('PDF:', buf.length, 'bytes, header:', buf.slice(0, 4).toString());
}

async function generateDocx() {
  const doc = new docx.Document({
    sections: [{
      children: RESUME_TEXT.split('\n').map((line) =>
        new docx.Paragraph({ children: [new docx.TextRun(line || ' ')] })
      ),
    }],
  });
  const buf = await docx.Packer.toBuffer(doc);
  writeFileSync(resolve(__dirname, 'sample-resume.docx'), Buffer.from(buf));
  console.log('DOCX:', buf.byteLength, 'bytes, header:', Buffer.from(buf).slice(0, 4).toString());
}

function generateEmptyPdf() {
  const buf = Buffer.from([
    '%PDF-1.4\n',
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n',
    '2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\n',
    'xref\n0 3\n',
    '0000000000 65535 f \n',
    '0000000009 00000 n \n',
    '0000000058 00000 n \n',
    'trailer<</Size 3/Root 1 0 R>>\n',
    'startxref\n110\n%%EOF\n',
  ].join(''), 'binary');
  writeFileSync(resolve(__dirname, 'empty-resume.pdf'), buf);
  console.log('Empty PDF:', buf.length, 'bytes');
}

function generateUnsupported() {
  const buf = Buffer.from('This is not a valid resume format.');
  writeFileSync(resolve(__dirname, 'unsupported-resume.txt'), buf);
  console.log('Unsupported:', buf.length, 'bytes');
}

generatePdf();
generateEmptyPdf();
generateUnsupported();
generateDocx().then(() => console.log('Done')).catch(console.error);

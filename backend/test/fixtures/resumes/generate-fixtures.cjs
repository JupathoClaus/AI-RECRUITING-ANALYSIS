const { writeFileSync } = require('fs');
const { resolve } = require('path');
const { PDFDocument, StandardFonts } = require('pdf-lib');
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
];

async function generatePdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Courier);
  const page = doc.addPage([612, 792]);
  let y = 750;
  const fontSize = 11;
  for (const line of RESUME_TEXT) {
    if (line === '') {
      y -= fontSize + 2;
      continue;
    }
    page.drawText(line, { x: 50, y, size: fontSize, font });
    y -= fontSize + 2;
  }
  const buf = await doc.save();
  writeFileSync(resolve(__dirname, 'sample-resume.pdf'), Buffer.from(buf));
  console.log('PDF:', buf.byteLength, 'bytes, header:', Buffer.from(buf).slice(0, 4).toString());
}

async function generateDocx() {
  const doc = new docx.Document({
    sections: [{
      children: RESUME_TEXT.map((line) =>
        new docx.Paragraph({ children: [new docx.TextRun(line || ' ')] })
      ),
    }],
  });
  const buf = await docx.Packer.toBuffer(doc);
  writeFileSync(resolve(__dirname, 'sample-resume.docx'), Buffer.from(buf));
  console.log('DOCX:', buf.byteLength, 'bytes, header:', Buffer.from(buf).slice(0, 4).toString());
}

function generateCorruptPdf() {
  const buf = Buffer.from('%PDF-1.4 garbage data that is not a valid PDF\x00\x00\x00');
  writeFileSync(resolve(__dirname, 'corrupt-resume.pdf'), buf);
  console.log('Corrupt PDF:', buf.length, 'bytes');
}

function generateEmptyPdf() {
  const buf = Buffer.from([
    '%PDF-1.4\n',
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n',
    '2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\n',
    'xref\n0 3\n',
    '0000000000 65535 f \n',
    '0000000011 00000 n \n',
    '0000000060 00000 n \n',
    'trailer<</Size 3/Root 1 0 R>>\n',
    'startxref\n109\n%%EOF\n',
  ].join(''), 'binary');
  writeFileSync(resolve(__dirname, 'empty-resume.pdf'), buf);
  console.log('Empty PDF:', buf.length, 'bytes');
}

function generateUnsupported() {
  writeFileSync(resolve(__dirname, 'unsupported-resume.txt'), Buffer.from('just text'));
  console.log('Unsupported generated');
}

(async () => {
  await generatePdf();
  await generateDocx();
  generateCorruptPdf();
  generateEmptyPdf();
  generateUnsupported();
  console.log('All fixtures regenerated successfully');
})();

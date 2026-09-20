// Generates a minimal valid DOCX fixture for testing
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('./fixtures/minimal-resume.docx', import.meta.url));
mkdirSync(dirname(OUT), { recursive: true });

// Create a minimal DOCX (ZIP with required files)
// DOCX is a ZIP archive containing:
// - [Content_Types].xml
// - _rels/.rels
// - word/document.xml
// - word/_rels/document.xml.rels

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>Browser Proof Candidate Resume - Senior Fullstack Engineer - React TypeScript Node.js</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;

const JSZip = await import('jszip').then(m => m.default || m);
const zip = new JSZip();
zip.file('[Content_Types].xml', contentTypes);
zip.file('_rels/.rels', rels);
zip.folder('word')?.file('document.xml', documentXml);
zip.folder('word/_rels')?.file('document.xml.rels', documentRels);

const docx = await zip.generateAsync({ type: 'nodebuffer' });
writeFileSync(OUT, docx);
console.log(`wrote ${OUT} (${docx.length} bytes)`);
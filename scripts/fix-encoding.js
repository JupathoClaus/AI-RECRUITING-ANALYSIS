// Fix double-encoded UTF-8 characters in source files
// This happens when UTF-8 text is treated as Latin-1 then re-encoded as UTF-8
const fs = require('fs');
const path = require('path');

const files = [
  'src/app/dashboard/page.tsx',
  'src/app/analytics/page.tsx',
  'src/app/hiring/page.tsx',
  'src/app/pipeline/page.tsx',
  'src/app/candidates/page.tsx',
  'src/app/candidates/compare/page.tsx',
  'src/app/interviews/page.tsx',
  'src/app/ai-interviews/page.tsx',
  'src/app/jobs/page.tsx',
  'src/app/settings/page.tsx',
  'src/app/company/page.tsx',
  'src/app/reports/page.tsx',
  'src/app/notifications/page.tsx',
  'src/app/login/page.tsx',
  'src/app/help/page.tsx',
  'src/app/page.tsx',
  'src/components/layout/sidebar.tsx',
  'src/components/layout/notification-drawer.tsx',
  'src/components/candidates/add-candidate-dialog.tsx',
  'src/components/ai-interview/ai-interview-detail-dialog.tsx',
  'src/components/ui/modal-header.tsx',
];

let totalFixed = 0;

files.forEach(filePath => {
  try {
    const buf = fs.readFileSync(filePath);
    const text = buf.toString('latin1'); // Read raw bytes as latin1 to detect corruption

    // Check if the file contains double-encoded sequences by looking for the
    // latin1 representation of double-encoded UTF-8 em-dash: bytes C3 A2 C2 80 C2 94
    // In latin1 that appears as: Ã¢â‚¬â€œ (or similar)
    // The reliable detection: re-read as UTF-8 and look for mojibake patterns
    const textUtf8 = buf.toString('utf8');

    // Patterns to fix (regex as byte strings interpreted in utf8)
    // Double-encoded em-dash: E2 80 94 was encoded as C3A2 C280 C294
    // In UTF-8 string this looks like: \u00e2\u0080\u0094 -> but stored as multi-byte
    // More reliably: look for the actual garbled string pattern
    let fixed = textUtf8;
    
    // â€" is the UTF-8 string for double-encoded em-dash U+2014
    // In the source it appears literally as those chars
    const hasBad = fixed.includes('\u00e2\u20ac\u201d') || // â€" 
                   fixed.includes('\u00e2\u20ac\u201c') || // â€œ
                   fixed.includes('\u00e2\u20ac\u2122') || // â€™  
                   fixed.includes('\u00c2\u00b7');          // Â·

    if (hasBad) {
      fixed = fixed
        .replace(/\u00e2\u20ac\u201d/g, '\u2014')   // â€" -> em dash
        .replace(/\u00e2\u20ac\u201c/g, '\u2013')   // â€" -> en dash
        .replace(/\u00e2\u20ac\u2122/g, '\u2019')   // â€™ -> right single quote  
        .replace(/\u00c2\u00b7/g, '\u00b7');         // Â· -> middle dot
      
      fs.writeFileSync(filePath, fixed, 'utf8');
      console.log('FIXED: ' + filePath);
      totalFixed++;
    } else {
      console.log('clean: ' + filePath);
    }
  } catch(e) {
    console.log('ERROR ' + filePath + ': ' + e.message);
  }
});

console.log('\nTotal files fixed: ' + totalFixed);

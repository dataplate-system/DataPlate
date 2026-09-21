import { readFileSync, writeFileSync } from 'fs';

const file = 'c:/Users/keven/DataPlate/frontend/JavaScript/adm.js';
let content = readFileSync(file, 'utf8');

// Find all occurrences of the Euro sign (U+20AC) with context
const euroChar = '€';
let idx = 0;
const samples = [];
while ((idx = content.indexOf(euroChar, idx)) !== -1 && samples.length < 5) {
  samples.push({ idx, ctx: JSON.stringify(content.slice(Math.max(0, idx-3), idx+5)) });
  idx++;
}
console.log('Euro sign occurrences (first 5):', samples);

// The pattern is â€" = U+00E2 + U+20AC + U+201D (right dbl quote) = garbled em dash
// Or â€œ = U+00E2 + U+20AC + U+0153 (oe) = garbled left dbl quote
// Replace all â€x patterns based on trailing char
const original = content;
content = content
  .split('â€’').join('-')   // â€™ = garbled em dash variant
  .split('â€”').join('-')   // â€" = em dash
  .split('â€œ').join('"')   // â€œ = left double quote
  .split('â€').join('');         // catch-all: remove remaining â€ sequences

if (content !== original) {
  writeFileSync(file, content, 'utf8');
  console.log('Fixed remaining sequences');
} else {
  console.log('No changes');
}

// Verify
const remaining = [...content].filter(c => c.charCodeAt(0) === 0x20AC);
console.log(`Remaining euro signs: ${remaining.length}`);

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const dir = 'c:/Users/keven/DataPlate/frontend/JavaScript';
const files = readdirSync(dir).filter(f => f.endsWith('.js'));

// Replace decorative Unicode chars AND their garbled multi-char representations
// The garbled forms arise when UTF-8 multi-byte sequences are misread as Latin-1/CP1252
const replacements = [
  // Garbled sequences (multi-char representations of Unicode chars)
  ['â€”', '-'],   // â€" = em dash
  ['â€™', '...'], // â€¢ = ellipsis (some versions)
  ['â€œ', '"'],   // â€œ = left double quote
  ['â€', '"'],   // â€ = right double quote (CP1252 0x9D)
  ['â€˜', "'"],   // â€˜ = left single quote
  ['â€™', '...'], // â€¢
  // Actual Unicode chars -> ASCII
  ['—', '-'],    // em dash
  ['–', '-'],    // en dash
  ['…', '...'],  // ellipsis
  ['→', '->'],   // right arrow
  ['←', '<-'],   // left arrow
  ['↑', '^'],    // up arrow
  ['↓', 'v'],    // down arrow
  ['─', '-'],    // box draw horizontal
  ['├', '|'],    // box draw T-right
  ['│', '|'],    // box draw vertical
  ['┐', '+'],    // box draw corners
  ['┌', '+'],
  ['┘', '+'],
  ['└', '+'],
  ['“', '"'],    // left double quote
  ['”', '"'],    // right double quote
  ['‘', "'"],    // left single quote
  ['’', "'"],    // right single quote
  ['•', '*'],    // bullet
];

for (const file of files) {
  const path = join(dir, file);
  let content = readFileSync(path, 'utf8');
  const original = content;
  for (const [from, to] of replacements) {
    content = content.split(from).join(to);
  }
  if (content !== original) {
    writeFileSync(path, content, 'utf8');
    console.log('Fixed:', file);
  } else {
    console.log('Clean:', file);
  }
}
console.log('Done.');

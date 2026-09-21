import { readFileSync, writeFileSync } from 'fs';

const file = 'c:/Users/keven/DataPlate/frontend/JavaScript/adm.js';
const content = readFileSync(file, 'utf8');
const euroSign = '€';

const lines = content.split('\n');
let fixed = 0;

const result = lines.map(line => {
  if (line.includes(euroSign)) {
    // These are all comment separator lines - simplify them
    // e.g. "// âãä Section name âãâãâ" -> "// Section name"
    const cleaned = line
      .replace(/\/\/\s*[^\w\s]*([\w\sÀ-ɏ]+)[^\w\s]*$/u, (_, name) => `// ${name.trim()}`)
      .replace(/[^\x00-\x7FÀ-ɏ]/g, ''); // remove any remaining non-ASCII non-Portuguese
    fixed++;
    return cleaned;
  }
  return line;
});

writeFileSync(file, result.join('\n'), 'utf8');
console.log(`Cleaned ${fixed} comment lines.`);

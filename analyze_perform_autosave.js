const fs = require('fs');
const path = require('path');
const content = fs.readFileSync(path.join('views','theme','themeform.ejs'),'utf8').split('\n');
let start = -1;
for (let i = 0; i < content.length; i++) {
  if (content[i].includes('async function performAutoSave()')) {
    start = i;
    break;
  }
}
if (start === -1) {
  console.error('Not found');
  process.exit(1);
}
let depth = 0;
let foundStart = false;
for (let i = start; i < content.length; i++) {
  const line = content[i];
  if (!foundStart && line.includes('async function performAutoSave()')) {
    foundStart = true;
  }
  if (foundStart) {
    for (const ch of line) {
      if (ch === '{') depth++;
      if (ch === '}') depth--;
    }
    console.log(`${i+1}: depth=${depth} | ${line}`);
    if (foundStart && depth === 0 && i > start) {
      console.log('Function ends at line', i+1);
      break;
    }
  }
}

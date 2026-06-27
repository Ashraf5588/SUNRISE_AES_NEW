const fs = require('fs');
const vm = require('vm');
const path = require('path');
const filename = path.join('views','theme','themeform.ejs');
const content = fs.readFileSync(filename, 'utf8').split('\n');
let inScript = false;
let attrs = '';
let scriptLines = [];
let scriptCount = 0;
for(let i=0; i<content.length; i++) {
  const line = content[i];
  if(!inScript) {
    const match = line.match(/<script\b([^>]*)>/i);
    if(match) {
      attrs = match[1] || '';
      if(/src\s*=/.test(attrs) || /type\s*=\s*(['\"])?(application\/json|text\/template|text\/x-template)\1/i.test(attrs)) {
        continue;
      }
      inScript = true;
      scriptCount += 1;
      scriptLines = [];
      startLine = i+1;
      continue;
    }
  } else {
    const endMatch = line.match(/<\/script>/i);
    if(endMatch) {
      if(scriptCount === 7) {
        const script = scriptLines.join('\n');
        for(let j=1; j<=scriptLines.length; j++) {
          try { new vm.Script(scriptLines.slice(0,j).join('\n'), {filename: `script7-${j}.js`}); }
          catch(e) {
            console.error(`FAILED AT SCRIPT 7 LINE ${startLine + j -1}: ${e.message}`);
            console.error('LINE:', scriptLines[j-1]);
            process.exit(1);
          }
        }
        console.log('SCRIPT 7 PARSES OK LINE-BY-LINE');
        process.exit(0);
      }
      inScript = false;
      continue;
    }
    scriptLines.push(line);
  }
}
console.error('SCRIPT 7 NOT FOUND');
process.exit(1);

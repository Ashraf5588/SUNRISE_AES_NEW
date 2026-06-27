const fs = require("fs");
const vm = require("vm");
const path = require("path");
const filename = path.join("views","theme","themeform.ejs");
const content = fs.readFileSync(filename, "utf8");
const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
let m, idx = 0;
while ((m = scriptRe.exec(content)) !== null) {
  const attrs = m[1];
  const body = m[2];
  if (/src\s*=/.test(attrs)) continue;
  if (/type\s*=\s*(['\"])?(application\/json|text\/template|text\/x-template)\1/i.test(attrs)) continue;
  idx += 1;
  try {
    new vm.Script(body, { filename: `script-${idx}.js` });
    console.log(`SCRIPT ${idx} OK`);
  } catch (e) {
    console.error(`SCRIPT ${idx} ERROR: ${e.stack}`);
    console.error('----- BEGIN SCRIPT ' + idx + ' -----');
    console.error(body);
    console.error('----- END SCRIPT ' + idx + ' -----');
    process.exit(1);
  }
}
if (idx === 0) console.log('NO JS SCRIPTS FOUND'); else console.log('ALL SCRIPTS OK');

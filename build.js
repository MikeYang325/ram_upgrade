const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const parts = ['_payload/page1.b64', '_payload/page2.b64'];
const encoded = parts
  .map((p) => fs.readFileSync(path.join(__dirname, p), 'utf8'))
  .join('')
  .replace(/\s+/g, '');

const gzip = Buffer.from(encoded, 'base64');
let html;
try {
  html = zlib.gunzipSync(gzip);
} catch (err) {
  console.warn(`gunzip failed (${err.code || err.message}); retrying raw deflate without gzip CRC trailer`);
  html = zlib.inflateRawSync(gzip.subarray(10, -8));
}

const text = html.toString('utf8');
if (html.length !== 105393 || !text.includes('Safar Flyer') || !text.includes('Royal Air Maroc')) {
  throw new Error(`Built HTML failed validation: ${html.length} bytes`);
}

fs.rmSync(path.join(__dirname, 'dist'), { recursive: true, force: true });
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist/index.html'), html);

console.log(`Built dist/index.html (${html.length} bytes)`);

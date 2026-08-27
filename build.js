const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const parts = ['_payload/page1.b64', '_payload/page2.b64'];
const encoded = parts
  .map((p) => fs.readFileSync(path.join(__dirname, p), 'utf8'))
  .join('')
  .replace(/\s+/g, '');

const html = zlib.gunzipSync(Buffer.from(encoded, 'base64'));

if (!html.toString('utf8').includes('Safar Flyer')) {
  throw new Error('Built HTML failed validation');
}

fs.rmSync(path.join(__dirname, 'dist'), { recursive: true, force: true });
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist/index.html'), html);

console.log(`Built dist/index.html (${html.length} bytes)`);

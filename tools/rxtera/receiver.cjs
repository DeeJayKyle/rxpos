const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const dir = process.argv[4]; fs.mkdirSync(dir, { recursive: true });
const token = process.argv[2];
http.createServer((req, res) => {
  const h = { 'Access-Control-Allow-Origin': process.argv[3], 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Private-Network': 'true', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  if (req.method === 'OPTIONS') { res.writeHead(204, h); return res.end(); }
  const m = req.url.match(/^\/([0-9a-f]+)\/([a-z0-9_-]+)$/i);
  if (req.method !== 'POST' || !m || m[1] !== token) { res.writeHead(403, h); return res.end(); }
  let b = ''; req.on('data', (d) => b += d); req.on('end', () => {
    try { JSON.parse(b); fs.writeFileSync(path.join(dir, m[2] + '.json'), b); res.writeHead(200, h); res.end('ok'); console.log('saved', m[2], b.length); }
    catch (e) { res.writeHead(400, h); res.end('bad'); }
  });
}).listen(8799, '127.0.0.1', () => console.log('listening'));

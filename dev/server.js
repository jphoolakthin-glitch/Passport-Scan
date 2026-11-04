/**
 * Local dev server: serves frontend/ and runs the real backend/*.gs code on mocks.
 *   node dev/server.js            -> http://localhost:8080  (sign in by typing an email)
 * State persists in dev/.data.json (delete it to start over).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createGas } = require('./gas-mock');

const PORT = +process.env.PORT || 8080;
const DATA = path.join(__dirname, '.data.json');
const fresh = !fs.existsSync(DATA);
const gas = createGas({ state: fresh ? undefined : JSON.parse(fs.readFileSync(DATA, 'utf8')), persistFile: DATA });
if (fresh) {
  gas.setup();
  gas.setProp_('GOOGLE_CLIENT_ID', 'dev-client-id');
  console.log(gas.seedDemoData());
  gas.runLicenseCheck();
  fs.writeFileSync(DATA, JSON.stringify(gas.state));
}

const FRONT = path.join(__dirname, '..', 'frontend');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      gas.resetExecution();
      const out = gas.handleRequest_(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    });
    return;
  }
  const url = req.url.split('?')[0];
  if (url === '/config.js') {
    res.writeHead(200, { 'Content-Type': TYPES['.js'] });
    res.end("window.APP_CONFIG = { API_URL: '/api', GOOGLE_CLIENT_ID: 'dev-client-id', DEV_LOGIN: true };");
    return;
  }
  const file = path.join(FRONT, path.normalize(url === '/' ? '/index.html' : url));
  if (!file.startsWith(FRONT) || !fs.existsSync(file)) { res.writeHead(404); res.end('Not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`PSMS dev server: http://localhost:${PORT}  (sign in as owner@example.com)`));

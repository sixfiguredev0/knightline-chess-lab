const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
// Deliberately serve only demo assets, never the surrounding checkout or Git data.
const publicFiles = new Set([
  '/popup.html','/popup.css','/popup.js','/icon.svg','/appSettings.js','/engineController.js',
  '/moveSelectionPolicy.js','/autoMoveController.js','/boardAdapter.js','/boardPosition.js',
  '/boardReader.js','/app.js','/content.js','/content.css','/lib/chess.js',
  '/tools/demo.html','/tools/demo.css','/tools/demo-chrome.js','/tools/demo-board.js'
]);
function createServer(port = 4317) {
  const server = http.createServer((request, response) => {
    const deny = status => { response.writeHead(status, {'Content-Type':'text/plain','X-Content-Type-Options':'nosniff'}); response.end('Not available'); };
    if (!['GET','HEAD'].includes(request.method)) return deny(405);
    if (!/^(127\.0\.0\.1|localhost):\d+$/.test(request.headers.host || '')) return deny(403);
    if (request.headers.origin && ![`http://${request.headers.host}`].includes(request.headers.origin)) return deny(403);
    let relative;
    try {
      const url = new URL(request.url, `http://${request.headers.host}`);
      relative = decodeURIComponent(['/', '/analysis'].includes(url.pathname) ? '/tools/demo.html' : url.pathname);
    } catch { return deny(400); }
    if (!publicFiles.has(relative)) return deny(404);
    const file = path.resolve(root, '.' + relative);
    if (!file.startsWith(root + path.sep)) return deny(403);
    let content;
    try {
      if (!fs.realpathSync(file).startsWith(fs.realpathSync(root) + path.sep)) return deny(403);
      content = fs.readFileSync(file);
    } catch { return deny(404); }
    if (relative === '/popup.html') content = content.toString().replace('<script src="appSettings.js">', '<script src="/tools/demo-chrome.js"></script><script src="appSettings.js">');
    const type = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.svg':'image/svg+xml'}[path.extname(file)] || 'application/octet-stream';
    response.writeHead(200, {'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
    response.end(request.method === 'HEAD' ? undefined : content);
  });
  return new Promise((resolve,reject) => { server.once('error',reject); server.listen(port, '127.0.0.1', () => resolve(server)); });
}
module.exports = {createServer};
if (require.main === module) createServer().then(() => console.log('Offline demo: http://127.0.0.1:4317/analysis\nPress Ctrl+C to stop.'));

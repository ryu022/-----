const http = require('http');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  const requestPath = req.url === '/' ? '/index.html' : req.url;
  const decoded = decodeURIComponent(requestPath);
  const relative = decoded.replace(/^\/+/, '');
  const target = path.resolve(root, relative);

  if (!target.startsWith(root)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  fs.stat(target, (err, stat) => {
    if (err || !stat.isFile()) {
      res.statusCode = 404;
      res.end('Not Found');
      return;
    }

    const ext = path.extname(target).toLowerCase();
    res.setHeader('Content-Type', mime[ext] || 'application/octet-stream');
    fs.createReadStream(target).pipe(res);
  });
});

server.listen(8000, '127.0.0.1', () => {
  console.log('server running on http://127.0.0.1:8000');
});

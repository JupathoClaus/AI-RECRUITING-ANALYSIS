// Fake "backend" that serves /api/v1/health/live with 200 and stays alive
// indefinitely — simulates a healthy verification backend.
const http = require('http');
const port = Number(process.argv[2] || 3100);
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end('{"status":"ok"}');
});
server.listen(port, () => console.log(`[fake-backend-ok] ready on ${port}`));

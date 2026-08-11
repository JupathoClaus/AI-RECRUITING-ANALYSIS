// Fake "backend" that serves 200 then crashes 1.5 s after boot — simulates a
// backend that dies shortly after reporting ready (port conflict detected late).
const http = require('http');
const port = Number(process.argv[2] || 3100);
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end('{"status":"ok"}');
});
server.listen(port, () => {
  console.log(`[fake-backend-crash] ready on ${port}`);
  setTimeout(() => {
    console.error('[fake-backend-crash] crashing now');
    process.exit(1);
  }, 1500);
});

// Fake foreign service for the infra port-guard regression test.
// Listens on the given port and answers 200 to ANY path, mimicking an
// unrelated application that happens to occupy the verification port.
const http = require('http');
const port = Number(process.argv[2] || 3100);
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end('{"status":"ok"}');
});
server.listen(port, () => console.log(`[fake-foreign] listening on ${port}`));

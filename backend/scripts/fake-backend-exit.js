// Fake "backend" that exits immediately with code 1 — simulates a real
// verification backend crashing at boot (e.g. EADDRINUSE on its port).
process.exit(1);

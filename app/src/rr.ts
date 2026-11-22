// Shared pure logic (geofencing, OSM/Wikipedia parsing, summarizer). src/core.js is a copy of ../core.js
// (kept identical by `npm run sync-core`, enforced by __tests__/core-sync.test.ts).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const RR: any = require('./core.js');
export default RR;

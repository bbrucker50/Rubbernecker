import fs from 'fs';
import path from 'path';

test('app/src/core.js is identical to the website core.js (run `npm run sync-core`)', () => {
  const a = fs.readFileSync(path.join(__dirname, '../src/core.js'), 'utf8');
  const b = fs.readFileSync(path.join(__dirname, '../../core.js'), 'utf8');
  expect(a).toBe(b);
});

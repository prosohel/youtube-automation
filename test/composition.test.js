const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'src', 'remotion');
const files = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(path.join(dir, d.name)) : [path.join(dir, d.name)]));

// The Docker image that renders the real videos has no emoji font: an emoji character in the composition
// shows as an empty box there (it did: the 🔔 on the subscribe button). Draw icons as SVG instead.
test('the video composition draws no emoji characters', () => {
  const hits = [];
  for (const f of files(DIR).filter((x) => /\.jsx?$/.test(x))) {
    fs.readFileSync(f, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (/\p{Extended_Pictographic}/u.test(line)) hits.push(`${path.relative(DIR, f)}:${i + 1}`);
      });
  }
  assert.deepEqual(hits, []);
});

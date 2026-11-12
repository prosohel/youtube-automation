const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../src/loudness');

const STDERR = `[Parsed_loudnorm_0 @ 0x1] \n{\n\t"input_i" : "-23.45",\n\t"input_tp" : "-6.10",\n\t"input_lra" : "9.80",\n\t"input_thresh" : "-33.70",\n\t"output_i" : "-14.00",\n\t"output_tp" : "-1.00",\n\t"output_lra" : "9.80",\n\t"output_thresh" : "-24.30",\n\t"normalization_type" : "dynamic",\n\t"target_offset" : "0.55"\n}\n`;

test('parseMeasure reads the loudnorm JSON from ffmpeg stderr and ignores anything else', () => {
  const m = L.parseMeasure(`noise before ${STDERR}`);
  assert.equal(m.input_i, '-23.45');
  assert.equal(L.parseMeasure('no json here'), null);
  assert.equal(L.parseMeasure('{"foo":1}'), null);
});

test('the second pass carries every measured value and the -14 LUFS / -1 dBTP target', () => {
  const f = L.secondPass(L.parseMeasure(STDERR));
  assert.match(f, /^loudnorm=I=-14:TP=-1:LRA=11:/);
  assert.match(f, /measured_I=-23.45:measured_TP=-6.10:measured_LRA=9.80:measured_thresh=-33.70:offset=0.55:linear=true/);
});

test('a file that is not a video is left alone and reports null', async () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const f = path.join(os.tmpdir(), `not-a-video-${Date.now()}.mp4`);
  fs.writeFileSync(f, 'hello');
  assert.equal(await L.normalizeLoudness(f), null);
  assert.equal(fs.readFileSync(f, 'utf8'), 'hello');
  fs.rmSync(f);
});

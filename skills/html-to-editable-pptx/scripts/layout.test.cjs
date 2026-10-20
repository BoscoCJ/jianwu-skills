const { test } = require('node:test');
const assert = require('node:assert/strict');
const { splitLayers, axisPosition, imagePlacement, gradientXml, resolveFont, clipPlacement } = require('./layout.cjs');

test('background commas inside colors and URLs stay intact', () => {
  assert.deepEqual(splitLayers('linear-gradient(rgba(0,0,0,.6), rgb(255,255,255)), url("a,b.png")'),
    ['linear-gradient(rgba(0,0,0,.6), rgb(255,255,255))', 'url("a,b.png")']);
});

test('positions distinguish pixels, percentages and computed calc', () => {
  assert.equal(axisPosition('10px', -200), 10);
  assert.equal(axisPosition('10%', -200), -20);
  assert.equal(axisPosition('calc(100% - 10px)', -200), -210);
  assert.equal(axisPosition('bottom', 200), 200);
  assert.throws(() => axisPosition('3em', 100), /Unsupported/);
});

test('cover and contain keep aspect ratios and crop from the specified origin', () => {
  const base = { x: 0, y: 0, width: 100, height: 100, naturalWidth: 400, naturalHeight: 200, objectFit: 'cover' };
  const centered = imagePlacement({ ...base, objectPosition: '50% 50%' });
  assert.equal(centered.crop.l, 0.25);
  assert.equal(centered.crop.r, 0.25);
  const offset = imagePlacement({ ...base, objectPosition: 'calc(100% - 10px) 50%' });
  assert.equal(offset.crop.l, 0.55);
  assert.equal(offset.bounds.width, 90);
  const contained = imagePlacement({ ...base, objectFit: 'contain', objectPosition: '50% 50%' });
  assert.equal(contained.bounds.height, 50);
  assert.equal(contained.bounds.y, 25);
});

test('gradient missing stops interpolate and alpha is native', () => {
  const xml = gradientXml('linear-gradient(to right, rgba(0, 0, 0, 0) 20%, rgb(10, 20, 30), rgba(0, 0, 0, 0.8) 80%)');
  assert.match(xml, /pos="20000"/);
  assert.match(xml, /pos="50000"/);
  assert.match(xml, /pos="80000"/);
  assert.match(xml, /alpha val="0"/);
  assert.match(xml, /alpha val="80000"/);
  const diagonal = gradientXml('linear-gradient(to bottom right, rgb(0,0,0), rgb(255,255,255))', 1, 200, 100);
  assert.match(diagonal, new RegExp(`ang="${Math.round(Math.atan2(200, 100) * 180 / Math.PI * 60000)}"`));
});

test('font resolution is per style and absent explicit mappings fail', () => {
  const installed = ['Arial', 'Microsoft YaHei', 'Georgia'];
  assert.equal(resolveFont('"PingFang SC", "Microsoft YaHei", sans-serif', installed, 'Arial').face, 'Microsoft YaHei');
  assert.equal(resolveFont('Georgia, serif', installed, 'Arial').face, 'Georgia');
  assert.equal(resolveFont('BrandFont', installed, 'Arial', { BrandFont: 'Georgia' }).face, 'Georgia');
  assert.throws(() => resolveFont('BrandFont', installed, 'Arial', { BrandFont: 'AbsentFont' }), /not installed/);
});

test('background auto and explicit dimensions keep intrinsic sizing', () => {
  const base = { x: 0, y: 0, width: 600, height: 300, naturalWidth: 400, naturalHeight: 200, objectPosition: '50% 50%' };
  assert.equal(imagePlacement({ ...base, objectFit: 'auto' }).bounds.width, 400);
  assert.equal(imagePlacement({ ...base, objectFit: 'auto' }).bounds.x, 100);
  assert.equal(imagePlacement({ ...base, objectFit: '50% auto' }).bounds.height, 150);
  assert.equal(imagePlacement({ ...base, objectFit: '200px 100px' }).bounds.width, 200);
  const clipped = clipPlacement(imagePlacement({ ...base, objectFit: 'cover' }), { x: 100, y: 50, width: 200, height: 100 });
  assert.equal(clipped.bounds.width, 200);
  assert.ok(Math.abs(clipped.crop.l - 1 / 6) < 0.0001);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { compare, regionMetric } = require('./visual.cjs');
const dependencies = process.env.PPTX_NODE_MODULES;
const sharp = require(dependencies ? path.join(dependencies, 'sharp') : 'sharp');

test('regional metric detects a missing dark text/scrim region masked by white space', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pptx-visual-'));
  const sourceFile = path.join(directory, 'source.png');
  const renderFile = path.join(directory, 'render.png');
  const region = { x: 100, y: 100, width: 40, height: 40, type: 'text', text: 'important' };
  const square = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#000000' } }).png().toBuffer();
  await sharp({ create: { width: 1000, height: 1000, channels: 3, background: '#ffffff' } })
    .composite([{ input: square, left: region.x, top: region.y }]).png().toFile(sourceFile);
  await sharp({ create: { width: 1000, height: 1000, channels: 3, background: '#ffffff' } }).png().toFile(renderFile);
  const result = await compare(sourceFile, renderFile, [region], directory, '01', { global: 0.1, region: 0.22 });
  assert.ok(result.global_rmse < 0.1);
  assert.ok(result.regions[0].rmse > 0.9);
  assert.equal(result.flagged, true);
  const identical = await compare(sourceFile, sourceFile, [region], directory, '02', { global: 0.1, region: 0.22 });
  assert.equal(identical.global_rmse, 0);
  assert.equal(identical.flagged, false);
});

test('off-canvas or empty metric regions do not silently pass as zero error', () => {
  assert.equal(regionMetric(new Float32Array(100), 10, 10, { x: 20, y: 20, width: 2, height: 2 }), null);
});

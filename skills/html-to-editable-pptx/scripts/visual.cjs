const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { parseArgs } = require('node:util');
const { values } = parseArgs({ options: { pptx: { type: 'string' }, deps: { type: 'string' },
  'region-limit': { type: 'string', default: '0.22' }, 'global-limit': { type: 'string', default: '0.10' },
  'reviewed-by': { type: 'string' }, 'review-note': { type: 'string' } } });
const dependencies = values.deps || process.env.PPTX_NODE_MODULES;
const sharp = require(dependencies ? path.join(dependencies, 'sharp') : 'sharp');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function regionMetric(errors, width, height, bounds) {
  const left = Math.max(0, Math.floor(bounds.x));
  const top = Math.max(0, Math.floor(bounds.y));
  const right = Math.min(width, Math.ceil(bounds.x + bounds.width));
  const bottom = Math.min(height, Math.ceil(bounds.y + bounds.height));
  let sum = 0;
  for (let vertical = top; vertical < bottom; vertical += 1) {
    for (let horizontal = left; horizontal < right; horizontal += 1) sum += errors[vertical * width + horizontal];
  }
  return right > left && bottom > top ? Math.sqrt(sum / ((right - left) * (bottom - top))) : null;
}

async function compare(sourceFile, renderFile, operations, directory, number, limits) {
  const source = await sharp(sourceFile).flatten({ background: '#ffffff' }).removeAlpha().blur(0.8).raw().toBuffer({ resolveWithObject: true });
  const rendered = await sharp(renderFile).flatten({ background: '#ffffff' }).removeAlpha().blur(0.8).raw().toBuffer({ resolveWithObject: true });
  if (source.info.width !== rendered.info.width || source.info.height !== rendered.info.height) throw Error(`Slide ${number}: image dimensions differ.`);
  const { width, height } = source.info;
  const errors = new Float32Array(width * height);
  const heatmap = Buffer.alloc(width * height * 3);
  for (let pixel = 0; pixel < errors.length; pixel += 1) {
    let sum = 0;
    for (let channel = 0; channel < 3; channel += 1) {
      const difference = (source.data[pixel * 3 + channel] - rendered.data[pixel * 3 + channel]) / 255;
      sum += difference * difference / 3;
    }
    errors[pixel] = sum;
    heatmap[pixel * 3] = Math.min(255, Math.round(Math.sqrt(sum) * 700));
    heatmap[pixel * 3 + 1] = Math.min(80, Math.round(Math.sqrt(sum) * 160));
  }
  const global = regionMetric(errors, width, height, { x: 0, y: 0, width, height });
  const regions = operations.filter(item => item.type === 'text' || item.type === 'image' || item.gradient?.startsWith('linear-gradient'))
    .map((item, index) => ({ region: index + 1, type: item.type, text: item.text, bounds: { x: item.x, y: item.y, width: item.width, height: item.height },
      rmse: regionMetric(errors, width, height, item) })).filter(item => item.rmse !== null);
  const regionWidth = Math.round(width / 2);
  const regionHeight = Math.round(height / 2);
  const panels = await Promise.all([sharp(sourceFile), sharp(renderFile), sharp(heatmap, { raw: { width, height, channels: 3 } })]
    .map(panel => panel.resize(regionWidth, regionHeight).png().toBuffer()));
  await sharp({ create: { width: regionWidth * 3, height: regionHeight, channels: 3, background: '#ffffff' } })
    .composite(panels.map((input, index) => ({ input, left: index * regionWidth, top: 0 })))
    .png().toFile(path.join(directory, `comparison-${number}.png`));
  return { slide: Number(number), global_rmse: global, flagged: global > limits.global || regions.some(region => region.rmse > limits.region),
    regions, source_sha256: digest(await fs.readFile(sourceFile)), render_sha256: digest(await fs.readFile(renderFile)) };
}

async function main() {
  if (!values.pptx) throw Error('Usage: node visual.cjs --pptx deck.pptx --deps NODE_MODULES');
  if (Boolean(values['reviewed-by']) !== Boolean(values['review-note'])) throw Error('Manual sign-off requires both --reviewed-by and --review-note.');
  const filename = path.resolve(values.pptx);
  const directory = filename.slice(0, -5) + '-artifacts';
  const source = JSON.parse(await fs.readFile(path.join(directory, 'source-layout.json'), 'utf8'));
  const renderManifest = JSON.parse((await fs.readFile(path.join(directory, 'render-manifest.json'), 'utf8')).replace(/^\uFEFF/, ''));
  const pptxHash = digest(await fs.readFile(filename));
  if (renderManifest.pptx_sha256 !== pptxHash) throw Error('PowerPoint renders are stale: rerun render.ps1.');
  const limits = { global: Number(values['global-limit']), region: Number(values['region-limit']) };
  if (!Object.values(limits).every(limit => Number.isFinite(limit) && limit > 0 && limit <= 1)) throw Error('Metric limits must be in (0,1].');
  const results = [];
  for (let index = 0; index < source.length; index += 1) {
    const number = String(index + 1).padStart(2, '0');
    const renderFile = path.join(directory, `render-${number}.png`);
    const hash = digest(await fs.readFile(renderFile));
    if (renderManifest.images.find(image => image.slide === index + 1)?.sha256 !== hash) throw Error(`Slide ${number}: render hash mismatch.`);
    results.push(await compare(path.join(directory, `source-${number}.png`), renderFile, source[index].operations, directory, number, limits));
  }
  const report = { pptx_sha256: pptxHash, created: new Date().toISOString(), metric: 'blurred RGB RMSE, global and per-object; triage only, not proof of fidelity',
    status: values['reviewed-by'] ? 'reviewed' : 'needs_review', reviewed_by: values['reviewed-by'] || null,
    review_note: values['review-note'] || null, limits, flagged_slides: results.filter(slide => slide.flagged).map(slide => slide.slide), slides: results };
  await fs.writeFile(path.join(directory, 'visual-verification.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, flagged_slides: report.flagged_slides, global_rmse: results.map(slide => slide.global_rmse) }));
}

module.exports = { regionMetric, compare };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });

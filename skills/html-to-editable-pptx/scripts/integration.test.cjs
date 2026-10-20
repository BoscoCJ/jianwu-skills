const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const dependencies = process.env.PPTX_NODE_MODULES;
const dependency = name => require(dependencies ? path.join(dependencies, name) : name);

test('native export keeps fonts, rotation, crops, radius, layered scrim and paragraph runs', async () => {
  const directory = process.env.PPTX_TEST_DIRECTORY || await fs.mkdtemp(path.join(os.tmpdir(), 'editable-pptx-'));
  await fs.mkdir(directory, { recursive: true });
  const sharp = dependency('sharp');
  const JSZip = dependency('jszip');
  const imagePath = path.join(directory, 'original.png');
  await sharp({ create: { width: 400, height: 200, channels: 3, background: '#197b93' } })
    .composite([{ input: await sharp({ create: { width: 100, height: 200, channels: 3, background: '#df4538' } }).png().toBuffer(), left: 0, top: 0 },
      { input: await sharp({ create: { width: 100, height: 200, channels: 3, background: '#fac65b' } }).png().toBuffer(), left: 300, top: 0 }])
    .png().toFile(imagePath);
  const html = `<!doctype html><meta charset="utf-8"><title>Native regression fixture</title><style>
    *{box-sizing:border-box}body{margin:0;font-family:"Microsoft YaHei",sans-serif}#stage{width:960px;height:540px}
    .slide{position:absolute;inset:0;width:960px;height:540px;display:none;background:#fff;color:#183648}
    .active{display:block}.notes,#hud{position:absolute;bottom:0}h1{position:absolute;left:40px;top:20px;margin:0;font:40px Georgia}
    .rotated{position:absolute;left:70px;top:125px;width:220px;height:45px;font:30px Georgia;transform:rotate(-12deg);background:#f5dc8b}
    .translated{position:absolute;left:330px;top:105px;width:240px;height:70px;transform:translate(20px,10px);background:#c7ebe3;font-size:28px;padding:12px}
    .skew{position:absolute;left:640px;top:125px;width:80px;height:12px;background:#c8102e;transform:skewX(-24deg)}
    img{position:absolute;top:230px;width:210px;height:130px;object-fit:cover}
    .first{left:40px;border-radius:24px;object-position:10px 20px}.second{left:280px;border-radius:18px;object-position:right 10px bottom 20px}
    .photo{position:absolute;left:520px;top:230px;width:210px;height:130px;overflow:hidden;border-radius:20px}.photo img{inset:auto;left:-45px;top:-25px;width:300px;height:180px;object-position:left top}
    .paragraph{position:absolute;left:40px;top:385px;width:830px;font-size:28px;line-height:1.45;margin:0}.paragraph b{color:#c8102e;background:#ffe58f}.paragraph em{font:italic 30px Georgia}
    .layered{background:linear-gradient(to right,rgba(0,0,0,.82) 0%,rgba(0,0,0,.30) 45%,rgba(0,0,0,0) 100%),url("original.png") center/cover no-repeat,#fff;color:white}
    .layered h1{font-family:Georgia}.layered p{position:absolute;left:40px;top:170px;width:380px;font-size:30px;line-height:1.5;margin:0}
    .floating{position:absolute;left:500px;top:260px;width:350px;height:130px;background:linear-gradient(to bottom right,rgba(255,255,255,.9),rgba(255,255,255,.5));border-radius:20px;z-index:2;color:#183648;font-size:28px;padding:24px}
    .under{position:absolute;left:650px;top:300px;width:250px;height:120px;background:#c8102e;z-index:1}
    </style><div id="hud">HIDDEN TOOLBAR</div><div id="stage">
    <section class="slide active"><h1>Mixed fonts / 原生回归</h1><div class="rotated">Rotated label</div><div class="translated">仅平移，不倾斜</div><div class="skew"></div>
    <img class="first" src="original.png"><img class="second" src="original.png"><div class="photo"><img src="original.png"></div>
    <p class="paragraph">原配色与<b>粗体红字</b>保持不变，<em>editable rich text</em><br>增加文字时整段可重排，不会自动缩小字号。</p><aside class="notes">备注不应出现在画布</aside></section>
    <section class="slide layered"><h1>Layered image + native scrim</h1><p>保留底图与渐变遮罩。<br>编辑文字，不修改图片。</p><div class="floating">前景叠层与圆角</div><div class="under"></div>
    <p style="top:430px;opacity:.5">Half opacity direct</p><p style="top:480px"><span style="opacity:.5"><em>Half opacity nested</em></span></p>
    <div style="position:absolute;left:650px;top:430px;width:100px;height:50px;border-radius:20px;background:#3178bf;transform:scale(1.5);transform-origin:top left"></div>
    <aside class="notes">Second slide notes</aside></section></div>`;
  const input = path.join(directory, 'regression.html');
  await fs.writeFile(input, html);
  for (const mode of ['line', 'paragraph']) {
    const output = path.join(directory, `regression-${mode}.pptx`);
    execFileSync(process.execPath, [path.join(__dirname, 'export.cjs'), '--input', input, '--output', output,
      '--width', '960', '--height', '540', '--edit-mode', mode, '--preview', '--overwrite', ...(dependencies ? ['--deps', dependencies] : [])],
    { encoding: 'utf8', timeout: 120000, windowsHide: true });
    const artifacts = output.slice(0, -5) + '-artifacts';
    const manifest = JSON.parse(await fs.readFile(path.join(artifacts, 'manifest.json'), 'utf8'));
    assert.deepEqual(manifest.warnings, []);
    const source = JSON.parse(await fs.readFile(path.join(artifacts, 'source-layout.json'), 'utf8'));
    const zip = await JSZip.loadAsync(await fs.readFile(output));
    const first = await zip.file('ppt/slides/slide1.xml').async('string');
    const second = await zip.file('ppt/slides/slide2.xml').async('string');
    assert.match(first, /typeface="Georgia"/);
    assert.match(first, /typeface="Microsoft YaHei"/);
    const rotations = [...first.matchAll(/rot="(\d+)"/g)].map(match => Number(match[1]) / 60000);
    assert.ok(rotations.some(rotation => Math.abs(rotation - 348) < 0.01));
    assert.match(first, /<a:custGeom>/);
    assert.match(first, /<a:srcRect/);
    assert.match(first, /prst="roundRect"/);
    assert.match(first, /<a:noAutofit\/>/);
    assert.doesNotMatch(first, /<a:(normAutofit|spAutoFit)/);
    assert.match(second, /<a:gradFill/);
    assert.doesNotMatch(first + second, /HIDDEN TOOLBAR/);
    const clipped = source[0].operations.find(operation => operation.type === 'image' && operation.clipFrames?.length);
    assert.equal(clipped.pptxPlacement.bounds.x, 520);
    assert.equal(clipped.pptxPlacement.bounds.y, 230);
    assert.equal(clipped.pptxPlacement.bounds.width, 210);
    assert.equal(clipped.pptxPlacement.bounds.height, 130);
    if (mode === 'paragraph') {
      const paragraph = source[0].operations.find(operation => operation.editMode === mode && operation.text.includes('原配色'));
      assert.ok(paragraph);
      assert.ok(paragraph.runs.some(run => run.color === 'rgb(200, 16, 46)' && run.weight >= 600));
      assert.ok(paragraph.runs.some(run => run.fontFace === 'Georgia'));
      assert.ok(paragraph.runs.some(run => run.highlight === 'rgb(255, 229, 143)'));
      assert.match(first, /<a:highlight>/);
      for (const phrase of ['Half opacity direct', 'Half opacity nested']) {
        const faded = source[1].operations.find(operation => operation.type === 'text' && operation.text === phrase);
        assert.ok(faded.runs.every(run => run.opacity === 0.5));
      }
      const rotated = source[0].operations.find(operation => operation.type === 'text' && operation.text === 'Rotated label');
      assert.ok(Math.abs(rotated.rotate - 348) < 0.01);
      assert.ok(source[0].operations.filter(operation => operation.type === 'text').length < 8);
      assert.match(first, /wrap="square"/);
    }
  }
  await fs.writeFile(path.join(directory, 'auto-background.html'), html.replace('center/cover no-repeat', 'center no-repeat'));
  execFileSync(process.execPath, [path.join(__dirname, 'export.cjs'), '--input', path.join(directory, 'auto-background.html'),
    '--output', path.join(directory, 'auto-background.pptx'), '--width', '960', '--height', '540', '--overwrite',
    ...(dependencies ? ['--deps', dependencies] : [])], { timeout: 120000, windowsHide: true });
  if (process.env.PPTX_PYTHON) {
    const original = path.join(directory, 'regression-line.pptx');
    const damaged = path.join(directory, 'negative-alpha.pptx');
    const damagedArtifacts = damaged.slice(0, -5) + '-artifacts';
    await fs.mkdir(damagedArtifacts, { recursive: true });
    for (const filename of ['manifest.json', 'source-layout.json']) {
      await fs.copyFile(path.join(original.slice(0, -5) + '-artifacts', filename), path.join(damagedArtifacts, filename));
    }
    const zip = await JSZip.loadAsync(await fs.readFile(original));
    const xml = await zip.file('ppt/slides/slide1.xml').async('string');
    zip.file('ppt/slides/slide1.xml', xml.replace('<a:srgbClr val="183648"/>', '<a:srgbClr val="183648"><a:alpha val="10000"/></a:srgbClr>'));
    await fs.writeFile(damaged, await zip.generateAsync({ type: 'nodebuffer' }));
    assert.throws(() => execFileSync(process.env.PPTX_PYTHON, [path.join(__dirname, 'verify.py'), damaged], { encoding: 'utf8', stdio: 'pipe' }));
    const report = JSON.parse(await fs.readFile(path.join(damagedArtifacts, 'verification.json'), 'utf8'));
    assert.equal(report.structural_passed, false);
    assert.ok(report.errors.some(error => error.includes('Alpha mismatch')));
    await fs.writeFile(path.join(damagedArtifacts, 'render-manifest.json'), JSON.stringify({ pptx_sha256: 'obsolete', images: [] }));
    assert.throws(() => execFileSync(process.execPath, [path.join(__dirname, 'visual.cjs'), '--pptx', damaged,
      ...(dependencies ? ['--deps', dependencies] : [])], { encoding: 'utf8', stdio: 'pipe' }), /stale/);
  }
  process.stdout.write(`Regression artifacts: ${directory}\n`);
});

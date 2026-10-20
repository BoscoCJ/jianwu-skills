const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL, fileURLToPath } = require('node:url');
const { parseArgs } = require('node:util');
const { existsSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const { splitLayers, imagePlacement, color, gradientXml, resolveFont, roundedClip, polygonXml, clipPlacement, intersectPolygons } = require('./layout.cjs');
const extractDocument = require('./extract.cjs');
const { createHash } = require('node:crypto');
const { values } = parseArgs({ options: {
  input: { type: 'string' }, output: { type: 'string' }, deps: { type: 'string' },
  browser: { type: 'string' }, selector: { type: 'string', default: '.slide' },
  stage: { type: 'string', default: '#stage' }, width: { type: 'string', default: '1920' },
  height: { type: 'string', default: '1080' }, 'min-font': { type: 'string', default: '24' },
  'font-face': { type: 'string', default: 'Microsoft YaHei' }, 'font-map': { type: 'string' },
  'edit-mode': { type: 'string', default: 'line' }, css: { type: 'string' },
  hide: { type: 'string', default: '#hud,#bar,.notes' }, notes: { type: 'string', default: '.notes' },
  preview: { type: 'boolean', default: false }, overwrite: { type: 'boolean', default: false },
  help: { type: 'boolean', default: false },
} });
if (values.help || !values.input || !values.output) {
  console.log('node export.cjs --input deck.html --output editable.pptx [--deps NODE_MODULES] [--browser CHROME_EXE] [--selector .slide] [--stage #stage] [--width 1920 --height 1080] [--min-font 24] [--font-face "Microsoft YaHei"] [--font-map fonts.json] [--edit-mode line|paragraph] [--css overrides.css] [--hide "#hud,#bar,.notes"] [--notes .notes] [--preview] [--overwrite]');
  process.exit(values.help ? 0 : 1);
}
if (!['line', 'paragraph'].includes(values['edit-mode'])) throw Error('edit-mode must be line or paragraph.');
const dependencies = values.deps || process.env.PPTX_NODE_MODULES;
const dependency = name => require(dependencies ? path.join(dependencies, name) : name);
const { chromium } = dependency('playwright');
const PptxGenJS = dependency('pptxgenjs');
const JSZip = dependency('jszip');
const width = Number(values.width);
const height = Number(values.height);
const minimumFont = Number(values['min-font']);
if (![width, height, minimumFont].every(value => Number.isFinite(value) && value > 0)) throw Error('Canvas dimensions and minimum font must be positive numbers.');
const inputPath = path.resolve(values.input);
const outputPath = path.resolve(values.output);
if (!outputPath.toLowerCase().endsWith('.pptx')) throw Error('Output must have the .pptx extension.');
if (existsSync(outputPath) && !values.overwrite) throw Error('Output already exists; choose a new filename or pass --overwrite.');
const outputDirectory = outputPath.slice(0, -5) + '-artifacts';

const inches = pixels => pixels / 96;
const points = pixels => pixels * 0.75;

function box(item) {
  return { x: inches(item.x), y: inches(item.y), w: inches(item.width), h: inches(item.height) };
}

function shadow(value, opacity) {
  if (!value || value === 'none') return undefined;
  const match = value.match(/(rgba?\([^)]+\))\s+([-\d.]+)px\s+([-\d.]+)px\s+([-\d.]+)px/);
  if (!match) return undefined;
  const shadowColor = color(match[1], opacity);
  return { type: 'outer', color: shadowColor.color, opacity: 1 - shadowColor.transparency / 100,
    offset: points(Math.hypot(Number(match[2]), Number(match[3]))),
    angle: Math.atan2(Number(match[3]), Number(match[2])) * 180 / Math.PI,
    blur: points(Number(match[4])) / 2 };
}

async function main() {
  await fs.mkdir(outputDirectory, { recursive: true });
  for (const filename of ['verification.json', 'visual-verification.json', 'render-manifest.json']) {
    await fs.rm(path.join(outputDirectory, filename), { force: true });
  }
  const fontMapping = values['font-map'] ? JSON.parse(await fs.readFile(path.resolve(values['font-map']), 'utf8')) : {};
  let installedFonts;
  if (process.platform === 'win32') {
    installedFonts = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-Command',
      '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Add-Type -AssemblyName System.Drawing; ConvertTo-Json -Compress -InputObject @((New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.GetName(1033); $_.Name })'], { encoding: 'utf8', windowsHide: true }).replace(/^\uFEFF/, ''));
  } else {
    installedFonts = execFileSync('fc-list', ['--format', '%{family}\n'], { encoding: 'utf8' }).split(/[\n,]/).map(value => value.trim()).filter(Boolean);
  }
  const fontSubstitutions = [];
  function assignFont(run) {
    const result = resolveFont(run.fontFamily, installedFonts, values['font-face'], fontMapping);
    run.fontFace = result.face;
    if (result.fallback || result.mapped) fontSubstitutions.push({ source: run.fontFamily, target: result.face, explicit: Boolean(result.mapped) });
    return run;
  }
  const executablePath = values.browser || process.env.PPTX_BROWSER || [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].find(candidate => existsSync(candidate));
  const browser = await chromium.launch({ executablePath, headless: true });
  const deck = new PptxGenJS();
  deck.defineLayout({ name: 'HTML_NATIVE', width: inches(width), height: inches(height) });
  deck.layout = 'HTML_NATIVE';
  deck.title = path.basename(inputPath, path.extname(inputPath));
  deck.subject = '原生文字与形状；独立原图；保留 HTML 字号比例与位置';
  deck.lang = 'zh-CN';
  deck.theme = { headFontFace: values['font-face'], bodyFontFace: values['font-face'], lang: 'zh-CN' };
  const patches = [];
  const source = [];
  const media = new Map();
  async function registerMedia(filename) {
    if (!media.has(filename)) media.set(filename, createHash('sha256').update(await fs.readFile(filename)).digest('hex'));
    return filename;
  }
  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(inputPath).href);
    deck.title = await page.title();
    if (values.css) await page.addStyleTag({ path: path.resolve(values.css) });
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode())); });
    await page.addStyleTag({ content: `${values.hide},${values.notes} { display:none!important } *,*::before,*::after { animation:none!important;transition:none!important }` });
    await page.evaluate(({ selector, stage, minimumFont, notesSelector }) => {
      document.querySelector(stage)?.style.setProperty('transform', 'none', 'important');
      const slides = [...document.querySelectorAll(selector)];
      if (!slides.length) throw Error(`No slides found for ${selector}`);
      for (const slide of slides) {
        slides.forEach(current => current.classList.toggle('active', current === slide));
        for (const element of [slide, ...slide.querySelectorAll('*')]) {
          if (element.closest(notesSelector)) continue;
          for (const pseudo of ['before', 'after']) {
            const style = getComputedStyle(element, `::${pseudo}`);
            if (!/^".+"$/.test(style.content)) continue;
            const span = document.createElement('span');
            span.textContent = JSON.parse(style.content);
            for (const property of ['color', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'display', 'padding', 'margin']) span.style.setProperty(property, style.getPropertyValue(property));
            element.dataset[`pptx${pseudo}`] = 'true';
            if (pseudo === 'before') element.prepend(span); else element.append(span);
          }
        }
        const smallText = [slide, ...slide.querySelectorAll('*')].filter(element =>
          !element.closest(notesSelector) && getComputedStyle(element).display !== 'none' &&
          [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim()) &&
          parseFloat(getComputedStyle(element).fontSize) < minimumFont);
        smallText.forEach(element => element.style.setProperty('font-size', `${minimumFont}px`, 'important'));
      }
      const style = document.createElement('style');
      style.textContent = '[data-pptxbefore]::before,[data-pptxafter]::after { content:none!important }';
      document.head.append(style);
    }, { selector: values.selector, stage: values.stage, minimumFont, notesSelector: values.notes });
    const count = await page.locator(values.selector).count();
    for (let index = 0; index < count; index += 1) {
      const data = await page.evaluate(extractDocument, { slideIndex: index, selector: values.selector, notesSelector: values.notes, editMode: values['edit-mode'] });
      for (const operation of data.operations.filter(operation => operation.type === 'text')) {
        assignFont(operation);
        operation.runs?.forEach(assignFont);
        if (operation.fontSize < minimumFont - 0.01 || operation.runs?.some(run => run.fontSize < minimumFont - 0.01)) {
          data.warnings.push('A CSS transform reduces visible text below the minimum font size.');
        }
      }
      if (values.preview) {
        await page.screenshot({ path: path.join(outputDirectory, `source-${String(index + 1).padStart(2, '0')}.png`), animations: 'disabled' });
      }
      source.push(data);
      const slide = deck.addSlide();
      slide.background = { color: color(data.background).color };
      const expanded = [];
      for (const operation of data.operations) {
        if (operation.type !== 'shape') { expanded.push(operation); continue; }
        const borders = operation.borders;
        const visibleBorders = borders.filter(border => border.width > 0 && border.style !== 'none');
        expanded.push({ ...operation, borders: [] });
        if (operation.backgroundImage && operation.backgroundImage !== 'none') {
          const layers = splitLayers(operation.backgroundImage);
          const sizes = splitLayers(operation.backgroundSize);
          const positions = splitLayers(operation.backgroundPosition);
          const repeats = splitLayers(operation.backgroundRepeat);
          const origins = splitLayers(operation.backgroundOrigin);
          const clips = splitLayers(operation.backgroundClip);
          for (let layerIndex = layers.length - 1; layerIndex >= 0; layerIndex -= 1) {
            const layer = layers[layerIndex];
            if (layer === 'none') continue;
            const origin = origins[layerIndex % origins.length];
            const clip = clips[layerIndex % clips.length];
            const inset = borders.map((border, side) => origin === 'border-box' ? 0 : border.width + (origin === 'content-box' ? operation.padding[side] : 0));
            const layerBounds = { ...operation, x: operation.x + inset[3], y: operation.y + inset[0],
              width: operation.width - inset[1] - inset[3], height: operation.height - inset[0] - inset[2],
              radius: Math.max(0, operation.radius - Math.max(...inset)), backgroundImage: undefined, borders: [], shadow: 'none' };
            if (operation.rotate || operation.polygon) data.warnings.push('Transformed background layers need positioning-box adaptation.');
            if (!['border-box', 'padding-box', 'content-box'].includes(origin) || !['border-box', 'padding-box', 'content-box'].includes(clip)) {
              data.warnings.push('Unsupported background-origin or background-clip.');
            }
            if (clip === 'content-box' && origin !== 'content-box') data.warnings.push('Mixed content-box background clipping requires adaptation.');
            if (layer.startsWith('linear-gradient(')) {
              expanded.push({ ...layerBounds, background: 'rgba(0, 0, 0, 0)', gradient: layer });
            } else {
              const imageUrl = layer.match(/^url\(["']?(.+?)["']?\)$/);
              if (!imageUrl) { data.warnings.push(`Unsupported background layer: ${layer}`); continue; }
              if ((repeats[layerIndex % repeats.length] || 'repeat') !== 'no-repeat') data.warnings.push('Repeated background images require native adaptation.');
              const filename = fileURLToPath(imageUrl[1]);
              const metadata = await dependency('sharp')(filename).metadata();
              expanded.push({ ...layerBounds, type: 'image', source: imageUrl[1], naturalWidth: metadata.width,
                naturalHeight: metadata.height, objectFit: sizes[layerIndex % sizes.length], objectPosition: positions[layerIndex % positions.length] });
            }
          }
        }
        if (visibleBorders.length) {
          const uniform = visibleBorders.length === 4 && visibleBorders.every(border => border.width === visibleBorders[0].width && border.color === visibleBorders[0].color && border.style === visibleBorders[0].style);
          const half = uniform ? visibleBorders[0].width / 2 : 0;
          expanded.push({ ...operation, x: operation.x + half, y: operation.y + half, width: operation.width - half * 2,
            height: operation.height - half * 2, radius: Math.max(0, operation.radius - half),
            background: 'rgba(0, 0, 0, 0)', gradient: 'none', backgroundImage: undefined, shadow: 'none' });
        }
      }
      data.operations = expanded;
      const slidePatches = [];
      let serial = 0;
      for (const operation of data.operations) {
        const name = `html-${++serial}-${operation.type}`;
        operation.objectName = name;
        if (operation.type === 'text' && operation.text.trim()) {
          const textOptions = run => ({
            fontFace: run.fontFace, fontSize: points(run.fontSize), bold: run.weight >= 600,
            italic: run.italic, ...color(run.color, run.opacity), charSpacing: points(run.letterSpacing),
            ...(run.highlight ? { highlight: color(run.highlight, run.opacity).color } : {}),
          });
          const paragraph = operation.editMode === 'paragraph';
          const richText = paragraph ? operation.runs.map(run => ({ text: run.text, options: textOptions(run) })) : operation.text;
          slide.addText(richText, {
            ...box(operation), w: inches(operation.width + 6),
            ...textOptions(operation), margin: 0, rotate: operation.rotate || 0,
            paraSpaceAfterPt: 0, paraSpaceBeforePt: 0, valign: paragraph ? 'top' : 'mid',
            align: operation.align || 'left', wrap: paragraph, objectName: name, lang: 'zh-CN',
            ...(paragraph ? { lineSpacingMultiple: 1, lineSpacing: points(operation.lineHeight * (operation.scaleY || 1)) } : {}),
          });
          const highlights = operation.runs?.filter(run => run.highlight).flatMap(run => run.text.split('\n').filter(Boolean)
            .map(() => ({ ...color(run.highlight, run.opacity) }))) || [];
          if (highlights.length) slidePatches.push({ name, kind: 'highlight', highlights });
        } else if (operation.type === 'image') {
          const imagePath = await registerMedia(fileURLToPath(operation.source));
          let placement = imagePlacement(operation);
          for (const frame of operation.clipFrames || []) {
            if (placement) placement = clipPlacement(placement, frame);
          }
          if (!placement) continue;
          const { bounds, crop } = placement;
          operation.pptxPlacement = { bounds, crop };
          let imageRadius = operation.radius;
          let clipPolygon;
          const roundedFrames = [operation, ...(operation.clipFrames || [])].filter(frame => frame.radius > 0);
          if (roundedFrames.length) {
            clipPolygon = roundedFrames.map(frame => roundedClip(frame, bounds, frame.radius))
              .reduce((combined, polygon) => combined ? intersectPolygons(combined, polygon) : polygon, null);
            if (roundedFrames.length === 1 && ['x', 'y', 'width', 'height'].every(key => Math.abs(roundedFrames[0][key] - bounds[key]) < 0.01)) {
              imageRadius = roundedFrames[0].radius;
              clipPolygon = undefined;
            } else imageRadius = 0;
          }
          slide.addImage({ path: imagePath, ...box(bounds), rotate: operation.rotate || 0,
            transparency: 100 * (1 - operation.opacity), objectName: name, shadow: shadow(operation.shadow, operation.opacity) });
          slidePatches.push({ name, crop, radius: imageRadius, points: clipPolygon, width: bounds.width, height: bounds.height,
            minSize: Math.min(bounds.width, bounds.height), kind: 'image' });
        } else if (operation.type === 'shape') {
          const fill = color(operation.background, operation.opacity);
          const hasFill = fill.transparency < 100;
          const hasGradient = operation.gradient?.startsWith('linear-gradient');
          const borders = operation.borders.filter(border => border.width > 0 && border.style !== 'none');
          const uniform = borders.length === 4 && borders.every(border => border.width === borders[0].width && border.color === borders[0].color);
          if (hasFill || hasGradient || uniform || operation.shadow && operation.shadow !== 'none') {
            const shape = operation.radius ? 'roundRect' : 'rect';
            slide.addShape(shape, { ...box(operation), rotate: operation.rotate || 0, rectRadius: inches(operation.radius || 0),
              fill: hasGradient ? { color: '000000', transparency: 50 } : fill,
              line: uniform ? { ...color(borders[0].color, operation.opacity), width: points(borders[0].width) } : { color: 'FFFFFF', transparency: 100, width: 0 },
              shadow: shadow(operation.shadow, operation.opacity), objectName: name,
            });
            if (hasGradient) slidePatches.push({ name, kind: 'gradient', value: operation.gradient, opacity: operation.opacity, width: operation.width, height: operation.height });
            if (operation.polygon) {
              if (operation.radius) data.warnings.push('Skewed rounded shape requires custom corner adaptation.');
              slidePatches.push({ name, kind: 'polygon', points: operation.polygon, width: operation.width, height: operation.height });
            }
            if (operation.rotate && borders.length && !uniform) data.warnings.push('Rotated non-uniform borders require native adaptation.');
          }
          if (!uniform) {
            for (const border of borders) {
              if (border.style === 'dashed') {
                const horizontal = border.side === 'top' || border.side === 'bottom';
                slide.addShape('line', {
                  x: inches(operation.x + (border.side === 'right' ? operation.width - border.width / 2 : 0)),
                  y: inches(operation.y + (border.side === 'bottom' ? operation.height - border.width / 2 : 0)),
                  w: horizontal ? inches(operation.width) : 0,
                  h: horizontal ? 0 : inches(operation.height),
                  line: { ...color(border.color, operation.opacity), width: points(border.width), dashType: 'dash' },
                  objectName: `${name}-${border.side}`,
                });
                continue;
              }
              const borderBox = { ...operation };
              if (border.side === 'top') borderBox.height = border.width;
              if (border.side === 'bottom') { borderBox.y += operation.height - border.width; borderBox.height = border.width; }
              if (border.side === 'left') borderBox.width = border.width;
              if (border.side === 'right') { borderBox.x += operation.width - border.width; borderBox.width = border.width; }
              slide.addShape('rect', { ...box(borderBox), fill: color(border.color, operation.opacity), line: { transparency: 100, width: 0 }, objectName: `${name}-${border.side}` });
            }
          }
        }
      }
      slide.addNotes(data.notes);
      patches.push(slidePatches);
    }
  } finally {
    await browser.close();
  }
  const zip = await JSZip.loadAsync(await deck.write({ outputType: 'nodebuffer' }));
  for (let index = 0; index < source.length; index += 1) {
    const filename = `ppt/slides/slide${index + 1}.xml`;
    let xml = await zip.file(filename).async('string');
    xml = xml.replace(/<a:bodyPr([^>]*)>/g, '<a:bodyPr$1><a:noAutofit/>');
    for (const patch of patches[index]) {
      const pattern = patch.kind === 'image' ? /<p:pic>.*?<\/p:pic>/gs : /<p:sp>.*?<\/p:sp>/gs;
      xml = xml.replace(pattern, fragment => {
        if (!fragment.includes(`name="${patch.name}"`)) return fragment;
        if (patch.kind === 'gradient') {
          return fragment.replace(/<a:solidFill>.*?<\/a:solidFill>/s, gradientXml(patch.value, patch.opacity, patch.width, patch.height));
        }
        if (patch.kind === 'highlight') {
          let index = 0;
          return fragment.replace(/<a:highlight><a:srgbClr val="([^"]+)"\/><\/a:highlight>/g, (match, hex) => {
            const fill = patch.highlights[index++];
            if (!fill || fill.color !== hex) throw Error('Highlight run mapping mismatch.');
            return `<a:highlight><a:srgbClr val="${hex}"><a:alpha val="${Math.round((100 - fill.transparency) * 1000)}"/></a:srgbClr></a:highlight>`;
          });
        }
        if (patch.points) fragment = fragment.replace(/<a:prstGeom[^>]*>.*?<\/a:prstGeom>/s, polygonXml(patch.points, patch.width, patch.height));
        if (patch.crop) {
          const attributes = Object.entries(patch.crop).map(([key, value]) => `${key}="${Math.round(value * 100000)}"`).join(' ');
          fragment = fragment.replace(/<a:srcRect[^>]*\/>/g, '');
          fragment = fragment.replace(/<a:stretch>/, `<a:srcRect ${attributes}/><a:stretch>`);
        }
        if (patch.radius) {
          const adjustment = Math.round(patch.radius / patch.minSize * 100000);
          fragment = fragment.replace(/<a:prstGeom[^>]*>.*?<\/a:prstGeom>/s, `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${adjustment}"/></a:avLst></a:prstGeom>`);
        }
        return fragment;
      });
    }
    zip.file(filename, xml);
  }
  await fs.writeFile(outputPath, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
  await fs.writeFile(path.join(outputDirectory, 'source-layout.json'), JSON.stringify(source, null, 2));
  const manifest = { inputPath, outputPath, width, height, minimumFont, fontFace: values['font-face'], editMode: values['edit-mode'], fontSubstitutions,
    media: [...media].map(([filename, sha256]) => ({ filename, sha256 })),
    warnings: source.flatMap((slide, index) => slide.warnings.map(warning => ({ slide: index + 1, warning }))) };
  await fs.writeFile(path.join(outputDirectory, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ outputPath, slides: source.length, bytes: (await fs.stat(outputPath)).size,
    warnings: manifest.warnings, textRuns: source.map(slide => slide.operations.filter(operation => operation.type === 'text' && operation.text.trim()).length) }));
}

main().catch(error => { console.error(error); process.exitCode = 1; });

function splitLayers(value) {
  const result = [];
  let depth = 0;
  let quote = '';
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote) { if (character === quote && value[index - 1] !== '\\') quote = ''; }
    else if (character === '"' || character === "'") quote = character;
    else if (character === '(') depth += 1;
    else if (character === ')') depth -= 1;
    else if (character === ',' && depth === 0) { result.push(value.slice(start, index).trim()); start = index + 1; }
  }
  result.push(value.slice(start).trim());
  return result;
}

function axisPosition(value, space) {
  const normalized = value.trim().toLowerCase();
  const keywords = { left: 0, top: 0, center: 0.5, right: 1, bottom: 1 };
  if (normalized in keywords) return keywords[normalized] * space;
  if (/^-?[\d.]+%$/.test(normalized)) return parseFloat(normalized) / 100 * space;
  if (/^-?[\d.]+px$/.test(normalized) || normalized === '0') return parseFloat(normalized);
  const calculation = normalized.match(/^calc\(\s*(-?[\d.]+)%\s*([+-])\s*([\d.]+)px\s*\)$/);
  if (calculation) return Number(calculation[1]) / 100 * space + (calculation[2] === '-' ? -1 : 1) * Number(calculation[3]);
  throw Error(`Unsupported object/background position: ${value}`);
}

function imagePlacement(item) {
  const tokens = item.objectPosition.match(/calc\([^)]*\)|[^\s]+/g) || [];
  if (tokens.length === 1) tokens.push('50%');
  if (tokens.length !== 2) throw Error(`Unsupported object/background position: ${item.objectPosition}`);
  if (['top', 'bottom'].includes(tokens[0])) tokens.reverse();
  let scaleX = item.width / item.naturalWidth;
  let scaleY = item.height / item.naturalHeight;
  if (item.objectFit === 'cover') scaleX = scaleY = Math.max(scaleX, scaleY);
  else if (item.objectFit === 'contain') scaleX = scaleY = Math.min(scaleX, scaleY);
  else if (item.objectFit === 'none') scaleX = scaleY = 1;
  else if (item.objectFit === 'scale-down') scaleX = scaleY = Math.min(1, scaleX, scaleY);
  else if (item.objectFit !== 'fill') {
    const dimensions = item.objectFit.split(/\s+/);
    if (dimensions.length === 1) dimensions.push('auto');
    const length = (value, extent) => value === 'auto' ? null : /^\d*\.?\d+%$/.test(value) ? parseFloat(value) * extent / 100
      : /^\d*\.?\d+(?:px)?$/.test(value) ? parseFloat(value) : NaN;
    const requestedWidth = length(dimensions[0], item.width);
    const requestedHeight = length(dimensions[1], item.height);
    if (dimensions.length !== 2 || Number.isNaN(requestedWidth) || Number.isNaN(requestedHeight)) throw Error(`Unsupported image sizing: ${item.objectFit}`);
    scaleX = requestedWidth === null ? requestedHeight === null ? 1 : requestedHeight / item.naturalHeight : requestedWidth / item.naturalWidth;
    scaleY = requestedHeight === null ? scaleX : requestedHeight / item.naturalHeight;
  }
  const renderedWidth = item.naturalWidth * scaleX;
  const renderedHeight = item.naturalHeight * scaleY;
  const offsetX = axisPosition(tokens[0], item.width - renderedWidth);
  const offsetY = axisPosition(tokens[1], item.height - renderedHeight);
  const left = Math.max(0, offsetX);
  const top = Math.max(0, offsetY);
  const right = Math.min(item.width, offsetX + renderedWidth);
  const bottom = Math.min(item.height, offsetY + renderedHeight);
  if (right <= left || bottom <= top) return null;
  return {
    bounds: { ...item, x: item.x + left, y: item.y + top, width: right - left, height: bottom - top },
    crop: { l: (left - offsetX) / renderedWidth, r: (offsetX + renderedWidth - right) / renderedWidth,
      t: (top - offsetY) / renderedHeight, b: (offsetY + renderedHeight - bottom) / renderedHeight },
  };
}

function color(value, opacity = 1) {
  const match = value?.match(/rgba?\(([^)]+)\)/);
  if (!match) return { color: '000000', transparency: 100 };
  const channels = match[1].split(',').map(Number);
  return { color: channels.slice(0, 3).map(channel => Math.round(channel).toString(16).padStart(2, '0')).join('').toUpperCase(),
    transparency: 100 * (1 - (channels[3] ?? 1) * opacity) };
}

function gradientXml(value, opacity = 1, width = 1, height = 1) {
  const parts = splitLayers(value.slice(value.indexOf('(') + 1, -1));
  let direction = '180deg';
  if (!/^rgba?\(/.test(parts[0])) direction = parts.shift();
  let angle;
  if (/^to /.test(direction)) {
    const horizontal = /right/.test(direction) ? 1 : /left/.test(direction) ? -1 : 0;
    const vertical = /bottom/.test(direction) ? 1 : /top/.test(direction) ? -1 : 0;
    angle = Math.atan2(vertical * width, horizontal * height) * 180 / Math.PI;
  } else if (/^-?[\d.]+deg$/.test(direction)) angle = parseFloat(direction) - 90;
  else throw Error(`Unsupported gradient direction: ${direction}`);
  const stops = parts.map(part => {
    const match = part.match(/^(rgba?\([^)]+\))(?:\s+(-?[\d.]+)%)?$/);
    if (!match) throw Error(`Unsupported gradient stop: ${part}`);
    return { fill: color(match[1], opacity), position: match[2] === undefined ? null : Number(match[2]) / 100 };
  });
  if (stops.length < 2) throw Error('Gradient needs at least two stops.');
  stops[0].position ??= 0;
  stops.at(-1).position ??= 1;
  let previous = 0;
  for (let index = 1; index < stops.length; index += 1) {
    if (stops[index].position === null) continue;
    stops[index].position = Math.max(stops[previous].position, stops[index].position);
    for (let missing = previous + 1; missing < index; missing += 1) {
      stops[missing].position = stops[previous].position + (stops[index].position - stops[previous].position) * (missing - previous) / (index - previous);
    }
    previous = index;
  }
  if (stops.some(stop => stop.position < 0 || stop.position > 1)) throw Error('Gradient stops outside 0–100% need adaptation.');
  const xml = stops.map(stop => `<a:gs pos="${Math.round(stop.position * 100000)}"><a:srgbClr val="${stop.fill.color}"><a:alpha val="${Math.round((100 - stop.fill.transparency) * 1000)}"/></a:srgbClr></a:gs>`).join('');
  return `<a:gradFill rotWithShape="1"><a:gsLst>${xml}</a:gsLst><a:lin ang="${Math.round(((angle % 360 + 360) % 360) * 60000)}" scaled="1"/></a:gradFill>`;
}

function resolveFont(stack, installed, fallback, mapping = {}) {
  const families = splitLayers(stack).map(value => value.replace(/^['"]|['"]$/g, ''));
  for (const family of families) {
    const mapped = mapping[family] || family;
    const available = installed.find(name => name.toLowerCase() === mapped.toLowerCase());
    if (available) return { face: available, mapped: mapped !== family };
    if (mapping[family]) throw Error(`Mapped font is not installed: ${mapped}`);
    const generic = { 'sans-serif': 'Arial', serif: 'Times New Roman', monospace: 'Courier New' }[family];
    if (generic && installed.some(name => name.toLowerCase() === generic.toLowerCase())) return { face: generic, mapped: false };
  }
  if (!installed.some(name => name.toLowerCase() === fallback.toLowerCase())) throw Error(`Fallback font is not installed: ${fallback}`);
  return { face: fallback, fallback: true };
}

function roundedClip(frame, bounds, radius) {
  let polygon = [];
  const centers = [[frame.width - radius, radius, -90], [frame.width - radius, frame.height - radius, 0],
    [radius, frame.height - radius, 90], [radius, radius, 180]];
  for (const [centerX, centerY, angle] of centers) {
    for (let step = 0; step <= 24; step += 1) {
      const radians = (angle + step * 90 / 24) * Math.PI / 180;
      polygon.push({ x: frame.x - bounds.x + centerX + radius * Math.cos(radians),
        y: frame.y - bounds.y + centerY + radius * Math.sin(radians) });
    }
  }
  for (const [axis, limit, minimum] of [['x', 0, true], ['x', bounds.width, false], ['y', 0, true], ['y', bounds.height, false]]) {
    const clipped = [];
    for (let index = 0; index < polygon.length; index += 1) {
      const previous = polygon[(index + polygon.length - 1) % polygon.length];
      const current = polygon[index];
      const previousInside = minimum ? previous[axis] >= limit : previous[axis] <= limit;
      const currentInside = minimum ? current[axis] >= limit : current[axis] <= limit;
      if (previousInside !== currentInside) {
        const fraction = (limit - previous[axis]) / (current[axis] - previous[axis]);
        clipped.push({ x: previous.x + fraction * (current.x - previous.x), y: previous.y + fraction * (current.y - previous.y) });
      }
      if (currentInside) clipped.push(current);
    }
    polygon = clipped;
  }
  return polygon;
}

function polygonXml(points, width, height) {
  const commands = points.map((point, index) => `<a:${index ? 'lnTo' : 'moveTo'}><a:pt x="${Math.round(point.x * 9525)}" y="${Math.round(point.y * 9525)}"/></a:${index ? 'lnTo' : 'moveTo'}>`).join('');
  return `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="${Math.round(width * 9525)}" h="${Math.round(height * 9525)}">${commands}<a:close/></a:path></a:pathLst></a:custGeom>`;
}

function clipPlacement(placement, frame) {
  const { bounds, crop } = placement;
  const left = Math.max(bounds.x, frame.x);
  const top = Math.max(bounds.y, frame.y);
  const right = Math.min(bounds.x + bounds.width, frame.x + frame.width);
  const bottom = Math.min(bounds.y + bounds.height, frame.y + frame.height);
  if (right <= left || bottom <= top) return null;
  const remainingX = 1 - crop.l - crop.r;
  const remainingY = 1 - crop.t - crop.b;
  return { bounds: { ...bounds, x: left, y: top, width: right - left, height: bottom - top },
    crop: { l: crop.l + (left - bounds.x) / bounds.width * remainingX,
      r: crop.r + (bounds.x + bounds.width - right) / bounds.width * remainingX,
      t: crop.t + (top - bounds.y) / bounds.height * remainingY,
      b: crop.b + (bounds.y + bounds.height - bottom) / bounds.height * remainingY } };
}

function intersectPolygons(subject, clipping) {
  let result = subject;
  for (let edge = 0; edge < clipping.length && result.length; edge += 1) {
    const start = clipping[edge];
    const end = clipping[(edge + 1) % clipping.length];
    const cross = point => (end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x);
    const input = result;
    result = [];
    for (let index = 0; index < input.length; index += 1) {
      const previous = input[(index + input.length - 1) % input.length];
      const current = input[index];
      const before = cross(previous);
      const after = cross(current);
      if ((before >= -0.00001) !== (after >= -0.00001)) {
        const fraction = before / (before - after);
        result.push({ x: previous.x + fraction * (current.x - previous.x), y: previous.y + fraction * (current.y - previous.y) });
      }
      if (after >= -0.00001) result.push(current);
    }
  }
  return result;
}

module.exports = { splitLayers, axisPosition, imagePlacement, color, gradientXml, resolveFont, roundedClip, polygonXml, clipPlacement, intersectPolygons };

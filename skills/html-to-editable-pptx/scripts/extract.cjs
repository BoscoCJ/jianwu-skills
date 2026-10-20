module.exports = function extractDocument({ slideIndex, selector, notesSelector, editMode }) {
  const slides = [...document.querySelectorAll(selector)];
  slides.forEach((slide, current) => slide.classList.toggle('active', current === slideIndex));
  const root = slides[slideIndex];
  const elements = [root, ...root.querySelectorAll('*')];
  const transforms = new Map();
  const originalStyles = new Map();
  for (const element of elements) {
    const style = getComputedStyle(element);
    transforms.set(element, { transform: style.transform, origin: style.transformOrigin });
    originalStyles.set(element, element.getAttribute('style'));
  }
  elements.forEach(element => element.style.setProperty('transform', 'none', 'important'));
  const rootBounds = root.getBoundingClientRect();
  const operations = [];
  const warnings = [];
  const readingOrder = new Map();
  const textWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (textWalker.nextNode()) readingOrder.set(textWalker.currentNode, readingOrder.size * 100000);
  const rectangle = element => {
    const bounds = element.getBoundingClientRect();
    return { x: bounds.x - rootBounds.x, y: bounds.y - rootBounds.y, width: bounds.width, height: bounds.height };
  };
  const font = style => ({ fontSize: parseFloat(style.fontSize), fontFamily: style.fontFamily,
    weight: Number(style.fontWeight), italic: style.fontStyle === 'italic', color: style.color,
    letterSpacing: parseFloat(style.letterSpacing) || 0 });
  function geometry(bounds, matrix, kind) {
    const scaleX = Math.hypot(matrix.a, matrix.b);
    const scaleY = Math.hypot(matrix.c, matrix.d);
    const orthogonal = Math.abs(matrix.a * matrix.c + matrix.b * matrix.d) < 0.0001;
    const center = new DOMPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2).matrixTransform(matrix);
    if (orthogonal && matrix.a * matrix.d - matrix.b * matrix.c > 0) {
      return { x: center.x - bounds.width * scaleX / 2, y: center.y - bounds.height * scaleY / 2,
        width: bounds.width * scaleX, height: bounds.height * scaleY,
        rotate: (Math.atan2(matrix.b, matrix.a) * 180 / Math.PI + 360) % 360, scaleX, scaleY };
    }
    if (kind !== 'shape') warnings.push(`Non-orthogonal or reflected transform on ${kind} requires native adaptation.`);
    const corners = [[0, 0], [bounds.width, 0], [bounds.width, bounds.height], [0, bounds.height]]
      .map(([horizontal, vertical]) => new DOMPoint(bounds.x + horizontal, bounds.y + vertical).matrixTransform(matrix));
    const left = Math.min(...corners.map(point => point.x));
    const top = Math.min(...corners.map(point => point.y));
    return { x: left, y: top, width: Math.max(...corners.map(point => point.x)) - left,
      height: Math.max(...corners.map(point => point.y)) - top,
      polygon: corners.map(point => ({ x: point.x - left, y: point.y - top })), rotate: 0, scaleX, scaleY };
  }
  function radius(style, bounds) {
    const values = ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'].map(corner => {
      const parts = style[`border${corner}Radius`].split(' ');
      const horizontal = parseFloat(parts[0]) * (parts[0].endsWith('%') ? bounds.width / 100 : 1);
      const vertical = parseFloat(parts[1] || parts[0]) * ((parts[1] || parts[0]).endsWith('%') ? bounds.height / 100 : 1);
      return [horizontal, vertical];
    });
    if (values.some(value => Math.abs(value[0] - value[1]) > 0.1 || Math.abs(value[0] - values[0][0]) > 0.1)) {
      warnings.push('Unequal or elliptical corner radii require native adaptation.');
    }
    return Math.min(values[0][0], bounds.width / 2, bounds.height / 2);
  }
  function text(node, opacity, matrix) {
    const style = getComputedStyle(node.parentElement);
    const range = document.createRange();
    const created = [];
    let current;
    for (let offset = 0; offset < node.length; offset += 1) {
      range.setStart(node, offset);
      range.setEnd(node, offset + 1);
      const bounds = range.getBoundingClientRect();
      if (!bounds.width || !bounds.height) continue;
      const character = /\s/.test(node.textContent[offset]) ? ' ' : node.textContent[offset];
      const localX = bounds.x - rootBounds.x;
      const localY = bounds.y - rootBounds.y;
      if (!current || Math.abs(current.y - localY) > 1 || localX > current.x + current.width + 1) {
        current = { type: 'text', text: '', x: localX, y: localY, width: 0, height: bounds.height,
          ...font(style), opacity, readingOrder: readingOrder.get(node) + offset, parentClass: node.parentElement.className };
        operations.push(current);
        created.push(current);
      }
      current.text += character;
      current.width = bounds.right - rootBounds.x - current.x;
    }
    for (const operation of created) {
      Object.assign(operation, geometry(operation, matrix, 'text'), { transformed: true });
      operation.fontSize *= operation.scaleY;
      operation.letterSpacing *= operation.scaleX;
      if (Math.abs(operation.scaleX - operation.scaleY) > 0.001) warnings.push('Non-uniform text scaling requires native adaptation.');
    }
  }
  function paragraph(element, opacity, matrix, bounds, style) {
    const runs = [];
    let pendingSpace = false;
    let paragraphOrder;
    function collect(parent, localOpacity) {
      for (const child of parent.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          let content = child.textContent;
          if (content.trim() && paragraphOrder === undefined) paragraphOrder = readingOrder.get(child);
          const childStyle = getComputedStyle(child.parentElement);
          if (!/pre/.test(childStyle.whiteSpace)) {
            content = content.replace(/\s+/g, ' ');
            if (!runs.length || pendingSpace) content = content.replace(/^ /, '');
          }
          const highlighted = child.parentElement.closest('[data-pptx-highlight]');
          if (content) runs.push({ text: content, ...font(childStyle), opacity: localOpacity,
            highlight: highlighted?.dataset.pptxHighlight });
          pendingSpace = content.endsWith(' ');
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          const childStyle = getComputedStyle(child);
          if (childStyle.display === 'none' || childStyle.visibility === 'hidden') continue;
          if (child.tagName === 'BR') { runs.push({ text: '\n', ...font(style), opacity: localOpacity }); pendingSpace = true; }
          else collect(child, localOpacity * Number(childStyle.opacity));
        }
      }
    }
    collect(element, opacity);
    if (!runs.some(run => run.text.trim())) return;
    const paddingLeft = parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth);
    const paddingTop = parseFloat(style.paddingTop) + parseFloat(style.borderTopWidth);
    const contentBounds = { x: bounds.x + paddingLeft, y: bounds.y + paddingTop,
      width: bounds.width - paddingLeft - parseFloat(style.paddingRight) - parseFloat(style.borderRightWidth),
      height: bounds.height - paddingTop - parseFloat(style.paddingBottom) - parseFloat(style.borderBottomWidth) };
    const placement = geometry(contentBounds, matrix, 'paragraph');
    if (Math.abs(placement.scaleX - placement.scaleY) > 0.001) warnings.push('Non-uniform paragraph scaling requires native adaptation.');
    for (const run of runs) { run.fontSize *= placement.scaleY; run.letterSpacing *= placement.scaleX; }
    const last = runs.at(-1);
    last.text = last.text.trimEnd();
    operations.push({ type: 'text', editMode: 'paragraph', text: runs.map(run => run.text).join(''), runs,
      ...placement, ...font(style), fontSize: parseFloat(style.fontSize) * placement.scaleY, opacity, readingOrder: paragraphOrder,
      align: style.textAlign === 'start' ? 'left' : style.textAlign === 'end' ? 'right' : style.textAlign,
      lineHeight: parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2 });
  }
  function walk(element, inheritedOpacity = 1, parentMatrix = new DOMMatrix(), ancestorClips = []) {
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || element.closest(notesSelector)) return;
    const opacity = inheritedOpacity * Number(style.opacity);
    if (opacity === 0) return;
    const bounds = rectangle(element);
    const saved = transforms.get(element);
    let matrix = parentMatrix;
    if (saved.transform !== 'none') {
      const transform = new DOMMatrix(saved.transform);
      if (!transform.is2D) warnings.push(`Unsupported 3D transform on ${element.className || element.tagName}.`);
      const origin = saved.origin.split(' ').map(parseFloat);
      const pivotX = bounds.x + origin[0];
      const pivotY = bounds.y + origin[1];
      matrix = parentMatrix.translate(pivotX, pivotY).multiply(transform).translate(-pivotX, -pivotY);
    }
    const placement = geometry(bounds, matrix, element.tagName === 'IMG' ? 'image' : 'shape');
    if (element.matches('svg,canvas,video,iframe')) warnings.push(`Unsupported ${element.tagName}: adapt as native objects before delivery.`);
    if (style.filter !== 'none' || style.clipPath !== 'none' || style.textTransform !== 'none') warnings.push(`Review CSS filter, clip-path or text-transform on ${element.className || element.tagName}.`);
    const borders = ['Top', 'Right', 'Bottom', 'Left'].map(side => ({ side: side.toLowerCase(),
      width: parseFloat(style[`border${side}Width`]) * Math.min(placement.scaleX, placement.scaleY), color: style[`border${side}Color`], style: style[`border${side}Style`] }));
    const ownRadius = radius(style, bounds) * Math.min(placement.scaleX, placement.scaleY);
    operations.push({ type: 'shape', ...placement, opacity, background: style.backgroundColor, gradient: 'none',
      radius: ownRadius, borders, shadow: style.boxShadow, className: element.className,
      backgroundImage: style.backgroundImage, backgroundSize: style.backgroundSize, backgroundPosition: style.backgroundPosition,
      backgroundRepeat: style.backgroundRepeat, backgroundOrigin: style.backgroundOrigin, backgroundClip: style.backgroundClip,
      padding: ['Top', 'Right', 'Bottom', 'Left'].map(side => parseFloat(style[`padding${side}`])),
      root: element === root });
    if (element.tagName === 'IMG') {
      if (Math.abs(placement.scaleX - placement.scaleY) > 0.001) warnings.push('Non-uniform image scaling requires native adaptation.');
      if (borders.some(border => border.width > 0) || ['Top', 'Right', 'Bottom', 'Left'].some(side => parseFloat(style[`padding${side}`]) > 0)) {
        warnings.push('IMG borders/padding require content-box adaptation.');
      }
      operations.push({ type: 'image', ...placement, source: element.src, naturalWidth: element.naturalWidth,
        naturalHeight: element.naturalHeight, objectFit: style.objectFit,
        objectPosition: style.objectPosition.replace(/(-?[\d.]+)px/g, (match, amount) => `${Number(amount) * placement.scaleX}px`),
        radius: ownRadius, clipFrames: ancestorClips, shadow: 'none', opacity });
      return;
    }
    const before = getComputedStyle(element, '::before');
    if (before.content === '""' && before.position === 'absolute') {
      if (before.transform !== 'none') warnings.push('Transformed empty pseudo-element requires native adaptation.');
      operations.push({ type: 'shape', ...geometry({ x: bounds.x + parseFloat(style.borderLeftWidth) + parseFloat(before.left),
        y: bounds.y + parseFloat(style.borderTopWidth) + parseFloat(before.top), width: parseFloat(before.width), height: parseFloat(before.height) }, matrix, 'shape'),
        background: before.backgroundColor, opacity, radius: 0, borders: [], gradient: before.backgroundImage });
    }
    const localMode = element.closest('[data-pptx-edit-mode]')?.dataset.pptxEditMode || editMode;
    const inlineOnly = [...element.querySelectorAll('*')].every(child => {
      const childStyle = getComputedStyle(child);
      return (childStyle.display === 'inline' || child.tagName === 'BR' || childStyle.display === 'none') &&
        childStyle.transform === 'none' && transforms.get(child)?.transform === 'none' && childStyle.backgroundImage === 'none' &&
        !parseFloat(childStyle.borderTopWidth) && !parseFloat(childStyle.paddingLeft) && !parseFloat(childStyle.paddingRight);
    });
    if (localMode === 'paragraph' && inlineOnly && !style.display.startsWith('inline') && element !== root) {
      for (const child of element.querySelectorAll('*')) {
        const background = getComputedStyle(child).backgroundColor;
        if (background !== 'rgba(0, 0, 0, 0)') child.dataset.pptxHighlight = background;
      }
      paragraph(element, opacity, matrix, bounds, style);
      return;
    }
    let childClips = ancestorClips;
    if (['hidden', 'clip'].includes(style.overflow)) {
      if (placement.rotate || placement.polygon) warnings.push('Transformed overflow clipping requires native adaptation.');
      const borderWidth = Math.max(...borders.map(border => border.width));
      childClips = [...ancestorClips, { x: placement.x + borders[3].width, y: placement.y + borders[0].width,
        width: placement.width - borders[1].width - borders[3].width,
        height: placement.height - borders[0].width - borders[2].width, radius: Math.max(0, ownRadius - borderWidth) }];
    }
    if (localMode === 'paragraph' && [...element.childNodes].some(child => child.nodeType === Node.TEXT_NODE && child.textContent.trim()) && !inlineOnly) {
      warnings.push('Paragraph with inline layout decorations was kept as separate objects; adapt or explicitly select line mode.');
    }
    const children = [...element.childNodes].map((node, order) => ({ node, order,
      z: node.nodeType === Node.ELEMENT_NODE ? Number(getComputedStyle(node).zIndex) || 0 : 0 }));
    children.sort((left, right) => left.z - right.z || left.order - right.order);
    for (const child of children) {
      if (child.node.nodeType === Node.TEXT_NODE) text(child.node, opacity, matrix);
      else if (child.node.nodeType === Node.ELEMENT_NODE) walk(child.node, opacity, matrix, childClips);
    }
  }
  try {
    walk(root);
    return { title: root.querySelector('h1,h2,.big')?.innerText, notes: root.querySelector(notesSelector)?.innerText || '',
      text: root.innerText, operations, warnings: [...new Set(warnings)], background: getComputedStyle(root).backgroundColor };
  } finally {
    for (const [element, style] of originalStyles) {
      if (style === null) element.removeAttribute('style'); else element.setAttribute('style', style);
    }
  }
};

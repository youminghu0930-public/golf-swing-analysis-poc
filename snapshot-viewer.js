import { createTrajectoryInspection } from './trajectory-inspection.js';
import { createTrajectoryOverlay } from './snapshot-trajectory.js';
import { trajectoryPoints } from './snapshot-data.js';
import { skeletonView } from './snapshot-framing.js';
import { createPoseOverlay } from './pose-overlay.js';
import { snapshotItems, spotlightPoints } from './snapshot-data.js';
import { installLinkedView } from './linked-view.js';
import { comparisonLabels } from './model-labels.js';
import { createSnapshotCallouts } from './snapshot-callouts.js';

const make = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const format = (text, values) => text.replace(/\{(\w+)\}/g, (_, key) => values[key]);
export function snapshotTravel(from, to, count) {
  const indices = new Set();
  for (let i = Math.floor(Math.min(from, to)); i <= Math.ceil(Math.max(from, to)); i++) indices.add((i % count + count) % count);
  return { indices: [...indices], duration: Math.min(900, 300 + Math.max(0, Math.abs(to-from)-1)*70) };
}
export function snapshotPlacement(index, position, count, width, height, cardHeight) {
  const angle = (index-position)*Math.PI*2/count;
  const depth = Math.cos(angle);
  const radius = count > 1 ? Math.max(220, width*.62) : 0;
  const scale = 1400/(1400+(1-depth)*radius);
  return { depth, scale, x: Math.sin(angle)*radius*scale,
    y: (12+cardHeight/2-height*.45)*(scale-1), opacity: 1 };
}
const svg = (tag, attributes = {}) => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
};

async function paintSVG(context, source, width, height) {
  const clone = source.cloneNode(true);
  const originals = [source, ...source.querySelectorAll('*')];
  const copies = [clone, ...clone.querySelectorAll('*')];
  originals.forEach((node, index) => {
    const style = getComputedStyle(node);
    for (const property of ['display', 'visibility', 'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'vector-effect', 'opacity']) {
      copies[index].style.setProperty(property, style.getPropertyValue(property));
    }
  });
  clone.setAttribute('width', width); clone.setAttribute('height', height);
  clone.style.visibility = 'visible';
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
  try {
    const image = new Image(); image.src = url; await image.decode();
    context.drawImage(image, 0, 0, width, height);
  } finally { URL.revokeObjectURL(url); }
}

function addShade(viewport, entry, side) {
  const shade = make('canvas', undefined, 'snapshot-shade');
  shade.setAttribute('aria-hidden', 'true');
  viewport.append(shade);
  return state => {
    const width = viewport.clientWidth, height = viewport.clientHeight;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    shade.width = Math.round(width*ratio); shade.height = Math.round(height*ratio);
    const context = shade.getContext('2d');
    const fit = Math.min(width/entry.width, height/entry.height);
    context.scale(ratio, ratio);
    // Cover the entire viewer, including letterboxing and exposed space while panning.
    context.fillStyle = 'rgba(0, 0, 0, 0.4)';
    context.fillRect(0, 0, width, height);
    context.translate(((1-state.zoom)/2+state.x)*width, ((1-state.zoom)/2+state.y)*height);
    context.scale(state.zoom, state.zoom);
    context.translate((width-entry.width*fit)/2, (height-entry.height*fit)/2);
    context.scale(fit, fit);
    context.globalCompositeOperation = 'destination-out';
    context.fillStyle = '#000';
    if (entry.range && entry.trajectories) {
      // Paint opacity as grayscale and take the pixelwise maximum (union).
      const mask = document.createElement('canvas');
      mask.width = shade.width; mask.height = shade.height;
      const maskContext = mask.getContext('2d');
      maskContext.fillStyle = '#000'; maskContext.fillRect(0, 0, mask.width, mask.height);
      maskContext.setTransform(context.getTransform());
      maskContext.globalCompositeOperation = 'lighten';
      const radius = Math.max(entry.width, entry.height) / 32;
      for (const [i, model] of ['after'].entries()) {
        if (viewport.closest('.comparison-panel').dataset[i ? 'hideAfter' : 'hideBefore'] === 'true') continue;
        const points = trajectoryPoints(entry.trajectories[model], entry.joints[0]);
        let previous;
        for (const point of points) {
          if (point && previous) {
            const gradient = maskContext.createLinearGradient(previous.x, previous.y, point.x === previous.x && point.y === previous.y ? point.x + .01 : point.x, point.y);
            gradient.addColorStop(0, `rgb(${previous.opacity*255},${previous.opacity*255},${previous.opacity*255})`);
            gradient.addColorStop(1, `rgb(${point.opacity*255},${point.opacity*255},${point.opacity*255})`);
            maskContext.strokeStyle = gradient; maskContext.lineWidth = radius * 2 * point.opacity; maskContext.lineCap = 'round';
            maskContext.beginPath(); maskContext.moveTo(previous.x, previous.y); maskContext.lineTo(point.x, point.y); maskContext.stroke();
          }
          previous = point;
        }
        const head = points.at(-1);
        if (head) { maskContext.fillStyle = '#fff'; maskContext.beginPath(); maskContext.arc(head.x, head.y, radius, 0, Math.PI*2); maskContext.fill(); }
      }
      const pixels = maskContext.getImageData(0, 0, mask.width, mask.height);
      for (let i = 0; i < pixels.data.length; i += 4) pixels.data[i+3] = pixels.data[i];
      maskContext.putImageData(pixels, 0, 0);
      context.save(); context.resetTransform();
      context.drawImage(mask, 0, 0); context.restore();
      return;
    }
    for (const [x, y] of ['after'].flatMap(model => spotlightPoints(entry[model], entry.joints))) {
      context.beginPath(); context.arc(x, y, Math.max(entry.width, entry.height)/16, 0, Math.PI*2); context.fill();
    }
  };
}

export async function mountSnapshots(root, copy, {warmAfter=Promise.resolve(),onFirstReady} = {}) {
  const labels = copy.snapshots;
  const json = async (url, cache = 'default') => {
    const response = await fetch(url, { cache });
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    return response.json();
  };
  const [config, manifest, credits] = await Promise.all([
    json('materials/data/snapshot.json', 'no-cache').catch(() => ({})), json('materials/data/snapshot-catalog.json'),
    json('materials/data/credits.json', 'no-cache').catch(() => ({})),
  ]);
  copy = { ...copy, ...comparisonLabels(copy, manifest.models) };
  const snapshots = snapshotItems(config, manifest.clips, { onWarning: message => console.warn(message) }).map(({ clip, frame, range, highlight_index, joints, title, explanations }) => {
    const cached = manifest.snapshots?.find(entry => entry.key === `${clip.key}-${frame}`);
    return { ...clip, videoId: clip.id, frame, range, highlight_index, joints, title, explanations, trajectories: range && JSON.stringify(cached?.range) === JSON.stringify(range) && JSON.stringify(cached?.selectedJoints) === JSON.stringify(joints) ? cached.trajectories : undefined, occlusionPoses: cached?.occlusionPoses, image: cached?.image, before: cached?.before, after: cached?.after,
      credit: credits[clip.key] ?? credits[clip.id] ?? credits[clip.id.split('-')[0]] ?? null };
  });
  if (!snapshots.length) { root.replaceChildren(make('p', labels.empty)); return; }
  root.dataset.ready='false';
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', labels.title);
  root.setAttribute('aria-roledescription', labels.carousel);
  const shell = make('div', undefined, 'snapshot-shell');
  const stage = make('div', undefined, 'snapshot-wheel');
  const previous = make('button', undefined, 'snapshot-arrow snapshot-previous');
  const next = make('button', undefined, 'snapshot-arrow snapshot-next');
  for (const [button, path] of [[previous, 'm15 5-7 7 7 7'], [next, 'm9 5 7 7-7 7']]) {
    const icon = svg('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' });
    icon.append(svg('path', { d: path })); button.append(icon);
  }
  for (const [button, label] of [[previous, labels.previous], [next, labels.next]]) {
    button.type = 'button'; button.title = label; button.setAttribute('aria-label', label);
    button.disabled = snapshots.length < 2;
  }
  const loaders = [], previewPainters = [];
  const cards = snapshots.map((entry, index) => {
    const displayFrame = entry.frame + 1;
    const card = make('article', undefined, 'snapshot-card');
    card.setAttribute('aria-label', format(labels.itemLabel, { video: entry.videoId, frame: displayFrame }));
    const header = make('div', undefined, 'snapshot-card-header');
    header.append(make('strong', format(copy.clipLabel, { id: entry.videoId })), make('span', format(labels.frame, { frame: displayFrame })));
    if (entry.title) header.append(make('h4', entry.title, 'snapshot-sample-title'));
    const comparison = make('div', undefined, 'snapshot-comparison');
    const viewports = [], scenes = [], overlays = [], shades = [], panels = [], callouts = [];
    const images = [], errors = [], previews = [];
    let viewState = { zoom: 1, x: 0, y: 0 }, loading, focusReady = false, manuallyAdjusted = false;
    for (const [side, viewIndex] of [['after', 0]]) {
      const panel = make('div', undefined, 'comparison-panel');
      panel.dataset.model = viewIndex === 0 ? 'general' : 'golf';
      const heading = make('div', undefined, 'panel-heading');
      heading.classList.add('comparison-legend');
      for (const [i, name] of ['after'].entries()) {
        const item = make('button', copy[name], 'legend-model legend-model-1');
        item.type = 'button'; item.setAttribute('aria-pressed', 'true');
        item.onclick = () => {
          const visible = item.getAttribute('aria-pressed') !== 'true';
          item.setAttribute('aria-pressed', String(visible));
          panel.dataset.hideAfter = String(!visible);
          shades.forEach(update => update(viewState));
          callouts.forEach(update => update(viewState));
        };
        heading.append(item);
      }
      const viewport = make('div', undefined, 'pose-viewport snapshot-image-window');
      const image = make('img');
      image.width = entry.width; image.height = entry.height;
      image.alt = `${copy[side]} · ${format(labels.itemLabel, { video: entry.videoId, frame: displayFrame })}`;
      image.draggable = false; image.decoding = 'sync';
      const imageError = make('span', labels.imageError, 'snapshot-image-error'); imageError.hidden = true;
      image.addEventListener('error', () => { imageError.hidden = false; });
      const scene = make('div', undefined, 'pose-scene'); scene.append(image);
      viewport.append(scene, imageError);
      const preview = make('canvas', undefined, 'snapshot-motion-preview');
      preview.setAttribute('aria-hidden', 'true'); viewport.append(preview); previews.push(preview);
      viewports.push(viewport); scenes.push(scene); images.push(image); errors.push(imageError);
      panel.append(viewport); comparison.append(panel);
      panels.push(panel);
    }
    const defaultFocus = () => {
      if (entry.range && entry.trajectories) {
        const points = ['after'].flatMap(side => trajectoryPoints(entry.trajectories[side], entry.joints[0]).filter(Boolean));
        const pose = { joints: points.map((_, i) => `golf_club_path_${i}`), pred: [points.map(p => [p.x, p.y, 1])] };
        return skeletonView({ pose, width: entry.width, height: entry.height, viewportWidth: viewports[0].clientWidth, viewportHeight: viewports[0].clientHeight });
      }
      const sets = ['after'].map(side => entry[side]).filter(Boolean);
      const combined = { joints: sets.flatMap((pose, index) => pose.joints.map(name => `${name}_${index}`)), pred: [sets.flatMap(pose => pose.pred[0])] };
      return skeletonView({ pose: combined, width: entry.width, height: entry.height,
        viewportWidth: viewports[0].clientWidth, viewportHeight: viewports[0].clientHeight });
    };
    const linkedView = installLinkedView(viewports, scenes, state => {
      viewState = state;
      overlays.forEach(overlay => overlay.setTransform(state));
      shades.forEach(update => update(state));
      callouts.forEach(update => update(state));
    }, {
      interactive: false,
      resizeView: state => focusReady && !manuallyAdjusted ? defaultFocus() : state,
      onInteraction: () => { manuallyAdjusted = true; },
    });
    let previewKey, previewJob = Promise.resolve();
    previewPainters.push(() => {
      previewJob = previewJob.catch(() => {}).then(async () => {
      const key = JSON.stringify([viewState, panels[0].dataset.hideBefore, panels[0].dataset.hideAfter, ...viewports.map(viewport => [viewport.clientWidth, viewport.clientHeight])]);
      if (previewKey === key) return;
      await Promise.all(viewports.map(async (viewport, i) => {
        const width = viewport.clientWidth, height = viewport.clientHeight;
        const canvas = previews[i], context = canvas.getContext('2d');
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.round(width*ratio); canvas.height = Math.round(height*ratio);
        context.scale(ratio, ratio);
        context.fillStyle = getComputedStyle(viewport).backgroundColor;
        context.fillRect(0, 0, width, height);
        await images[i].decode();
        const fit = Math.min(width/entry.width, height/entry.height);
        context.save();
        context.translate(((1-viewState.zoom)/2+viewState.x)*width, ((1-viewState.zoom)/2+viewState.y)*height);
        context.scale(viewState.zoom, viewState.zoom);
        context.drawImage(images[i], (width-entry.width*fit)/2, (height-entry.height*fit)/2, entry.width*fit, entry.height*fit);
        context.restore();
        for (const layer of viewport.querySelectorAll('.pose-overlay')) if (getComputedStyle(layer).display !== 'none') await paintSVG(context, layer, width, height);
        // Copy the actual live shading pixels; never re-export an SVG mask.
        context.drawImage(viewport.querySelector('.snapshot-shade'), 0, 0, width, height);
        for (const layer of viewport.querySelectorAll('.snapshot-callout-arrows')) if (getComputedStyle(layer).display !== 'none') await paintSVG(context, layer, width, height);
      }));
      previewKey = key;
      });
      return previewJob;
    });
    loaders.push(active => {
      images.forEach(image => { image.fetchPriority = active ? 'high' : 'low'; });
      if (loading) return loading;
      loading = (async () => {
        if (entry.image) images.forEach(image => { image.src = entry.image; });
        if (!entry.image || !entry.after || !entry.occlusionPoses || (entry.range && !entry.trajectories)) {
          throw new Error('Snapshot assets are incomplete. Run the local server to prepare the selected images.');
        }
        focusReady = true;
        linkedView.setView(defaultFocus());
        const skeleton=createPoseOverlay(viewports[0],1,copy,new Set(entry.joints.map(name=>`joint:${name}`)),()=>{},{interactive:false,fullBody:true});
        skeleton.setPose(entry.occlusionPoses.after,entry.width,entry.height);skeleton.render(0);skeleton.setTransform(viewState);overlays.push(skeleton);
        const annotationPositions = [];
        for (const [viewIndex, side] of [[1, 'after']]) {
          const overlay = entry.range ? createTrajectoryOverlay(viewports[0], viewIndex, entry)
            : createPoseOverlay(viewports[0], viewIndex, copy, new Set(entry.joints.map(name => `joint:${name}`)), () => {});
          if (!entry.range) { overlay.setPose(entry[side], entry.width, entry.height); overlay.render(0); }
          overlay.setTransform(viewState);
          overlays.push(overlay);
          if (viewIndex === 1) {
            const updateShade = addShade(viewports[0], entry, side);
            updateShade(viewState); shades.push(updateShade);
          }
          if (!entry.range) {
            const updateCallouts = createSnapshotCallouts(viewports[0], panels[0], entry, side, annotationPositions);
            updateCallouts(viewState); callouts.push(updateCallouts);
          }
        }
        if (entry.range) {
          // The selected joints are shown as a single motion trace.
        }
        // Let the first snapshot paint before the lower player competes for bandwidth.
        let timeout;
        try {
          await Promise.race([
            Promise.all(images.map(image => image.decode().catch(() => {}))),
            new Promise(resolve => { timeout = setTimeout(resolve, 5000); }),
          ]);
        } finally { clearTimeout(timeout); }
      })().catch(error => {
        console.warn(`Snapshot ${entry.key}/${entry.frame}:`, error);
        errors.forEach(node => { node.hidden = false; });
      });
      return loading;
    });
    card.append(comparison); stage.append(card);
    return card;
  });
  shell.append(stage, previous, next);
  const dots = make('div', undefined, 'snapshot-dots');
  dots.setAttribute('role', 'group'); dots.setAttribute('aria-label', labels.navigation);
  const dotButtons = snapshots.map((entry, index) => {
    const button = make('button'); button.type = 'button';
    button.setAttribute('aria-label', format(labels.show, { video: entry.videoId, frame: entry.frame + 1 }));
    button.append(make('span')); dots.append(button); return button;
  });
  const details = make('div', undefined, 'snapshot-details');
  const credit = make('p', undefined, 'snapshot-source');
  details.append(credit);
  root.replaceChildren(shell, dots, details);

  const count = cards.length;
  let position = 0, target = 0, requestedTarget = 0, navigationVersion = 0, animation;
  let stageWidth = 0, stageHeight = 0, cardHeights = [];
  const modulo = value => (value % count + count) % count;
  function layout() {
    const placements = cards.map((card, index) => snapshotPlacement(index, position, count, stageWidth, stageHeight, cardHeights[index]));
    const order = placements.map((placement, index) => index).sort((a, b) => placements[a].depth-placements[b].depth || a-b);
    const layers = new Map(order.map((index, layer) => [index, layer+1]));
    const visible = new Set(order.slice(-5));
    cards.forEach((card, index) => {
      const placement = placements[index];
      card.style.transform = `translateX(-50%) translate(${placement.x}px, ${placement.y}px) scale(${placement.scale})`;
      card.style.opacity = String(placement.opacity);
      card.style.zIndex = String(layers.get(index));
      card.style.visibility = visible.has(index) ? 'visible' : 'hidden';
    });
  }
  function updateSelection() {
    const index = modulo(target), entry = snapshots[index];
    loaders[index](true);
    // Give the active card first priority; warm up only its two immediate neighbors.
    loaders[index](true).then(() => warmAfter).then(() => setTimeout(() => {
      if (modulo(target) !== index || count < 2) return;
      loaders[modulo(index-1)](false); loaders[modulo(index+1)](false);
    }, 500));
    cards.forEach((card, i) => {
      card.setAttribute('aria-hidden', String(i !== index));
      card.inert = i !== index;
      card.classList.toggle('is-current', i === index);
    });
    dotButtons.forEach((button, i) => button.setAttribute('aria-current', String(i === index)));
    credit.replaceChildren();
    try {
      const url = new URL(typeof entry.credit === 'string' ? entry.credit : entry.credit?.url);
      if (['https:', 'http:'].includes(url.protocol)) {
        const link = make('a', copy.creditLink); link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
        credit.append(make('span', `${copy.creditLabel} `), link);
      }
    } catch { /* Credits are optional and must not block snapshot navigation. */ }
    root.dataset.snapshotIndex = String(index);
  }
  async function animate(nextTarget) {
    requestedTarget = nextTarget;
    const request = ++navigationVersion;
    const route = snapshotTravel(position, nextTarget, count);
    const prepared = new Set(route.indices.flatMap(index => [-2, -1, 0, 1, 2].map(offset => modulo(index+offset))));
    root.setAttribute('aria-busy', 'true');
    let canAnimate = true;
    try {
      await Promise.all([...prepared].map(async index => {
        await loaders[index](index === modulo(nextTarget)); await previewPainters[index]();
      }));
    } catch (error) { canAnimate = false; console.warn('Snapshot transition preview could not be prepared', error); }
    if (request !== navigationVersion) return;
    root.setAttribute('aria-busy', 'false');
    cancelAnimationFrame(animation);
    const from = position, started = performance.now(); target = nextTarget; updateSelection();
    if (!canAnimate || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      delete root.dataset.animating; position = target; layout(); return;
    }
    root.dataset.animating = 'true';
    const tick = now => {
      const progress = Math.min(1, (now-started)/route.duration);
      // Reach cruising speed slightly earlier, leaving more time to settle.
      const phase = progress ** .9;
      const eased = phase * phase * (3 - 2 * phase);
      position = from + (target-from)*eased;
      layout();
      if (progress < 1) animation = requestAnimationFrame(tick);
      else { delete root.dataset.animating; }
    };
    animation = requestAnimationFrame(tick);
  }
  previous.onclick = () => animate(requestedTarget-1);
  next.onclick = () => animate(requestedTarget+1);
  dotButtons.forEach((button, index) => {
    button.onclick = () => {
      let distance = modulo(index - modulo(requestedTarget));
      if (distance > count / 2) distance -= count;
      if (distance !== 0) animate(requestedTarget + distance);
    };
  });
  const resizeLayout = () => {
    // Reserve a stable height for every card, including different aspect ratios.
    const height = `${Math.max(...cards.map(card => card.offsetHeight))+24}px`;
    if (stage.style.height !== height) stage.style.height = height;
    stageWidth = stage.clientWidth; stageHeight = stage.clientHeight;
    cardHeights = cards.map(card => card.offsetHeight);
    layout();
  };
  const resize = new ResizeObserver(resizeLayout); resize.observe(stage); cards.forEach(card => resize.observe(card));
  updateSelection(); resizeLayout();
  await loaders[0](true); root.dataset.ready='true'; onFirstReady?.();
  await warmAfter;
  // Warm the remaining curated frames offscreen before handing bandwidth to video.
  // Sequential requests avoid a burst that competes with the selected snapshot.
  for (let index = 1; index < loaders.length; index++) await loaders[index](false);
}

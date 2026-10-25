import { overlayTransform } from './pose-geometry.js';
import { trajectoryPoints } from './snapshot-data.js';

let nextGradient = 0;
const svg = (tag, attrs) => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  return node;
};

export function createTrajectoryOverlay(viewport, index, entry) {
  const layers=entry.joints.map(joint=>createJointTrajectory(viewport,index,{...entry,joints:[joint]}));
  return {setTransform(state){layers.forEach(layer=>layer.setTransform(state));},highlight(indices,inspected){layers.forEach(layer=>layer.highlight(indices,inspected));}};
}
function createJointTrajectory(viewport, index, entry) {
  const side = index ? 'after' : 'before';
  const color = index ? '#63f5b4' : '#ffce69';
  const layer = svg('svg', { class: `pose-overlay pose-overlay-${index} snapshot-trajectory`,
    viewBox: `0 0 ${entry.width} ${entry.height}`, 'aria-label': `${side} trajectory`, role: 'img' });
  const geometry = svg('g', {});
  const markers = svg('g', { class: 'trajectory-markers' });
  const definitions = svg('defs', {}); layer.append(definitions);
  const points = trajectoryPoints(entry.trajectories[side], entry.joints[0]);
  const radius = Math.max(entry.width, entry.height) / 190;
  const dots = [];
  let previous;
  for (const point of points) {
    if (point && previous) {
      const id = `trajectory-fade-${nextGradient++}`;
      const gradient = svg('linearGradient', { id, gradientUnits: 'userSpaceOnUse', x1: previous.x, y1: previous.y, x2: point.x, y2: point.y });
      gradient.append(svg('stop', { offset: 0, 'stop-color': color, 'stop-opacity': previous.opacity }), svg('stop', { offset: 1, 'stop-color': color, 'stop-opacity': point.opacity }));
      definitions.append(gradient);
      geometry.append(svg('line', { x1: previous.x, y1: previous.y, x2: point.x, y2: point.y,
        stroke: `url(#${id})`, 'stroke-width': radius * .8, 'stroke-linecap': 'round' }));
    }
    const dot = point ? svg('circle', { class: 'trajectory-dot', 'data-frame': entry.range[0] + dots.length, cx: point.x, cy: point.y, r: radius * .6, fill: color, opacity: point.opacity }) : null;
    if (dot) markers.append(dot);
    dots.push(dot);
    previous = point;
  }
  geometry.append(markers);
  layer.append(geometry); viewport.append(layer);
  return { highlight(indices, inspected = indices) {
    dots.forEach((dot, i) => {
      if (!dot) return;
      const active = indices.has(i);
      dot.classList.toggle('is-highlighted', active);
      dot.setAttribute('r', radius * (inspected.has(i) ? 1.2 : active ? 1 : .6));
      dot.setAttribute('opacity', active ? 1 : points[i].opacity);
      dot.setAttribute('stroke', active ? '#fff' : 'none');
      dot.setAttribute('stroke-width', radius * .35);
    });
  }, setTransform(state) {
    geometry.setAttribute('transform', overlayTransform(entry.width, entry.height, viewport.clientWidth, viewport.clientHeight, state));
  } };
}

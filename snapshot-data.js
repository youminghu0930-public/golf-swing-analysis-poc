export function snapshotItems(config, clips, { onWarning } = {}) {
  const entries = [];
  for (const [video, frames] of Object.entries(config)) {
    const matches = clips.filter(clip => clip.key === video || clip.id === video);
    if (matches.length !== 1) {
      const error = `Snapshot video ${video}: expected one matching clip, found ${matches.length}. Use a view-specific key if ambiguous.`;
      if (onWarning) { onWarning(error); continue; }
      throw new Error(error);
    }
    const clip = matches[0];
    if (Array.isArray(frames)) {
      for (const sample of frames) {
        const range = sample?.range;
        const selectedJoints=sample?.joints ?? (sample?.joint ? [sample.joint] : []);
        const valid = Array.isArray(range) && range.length === 2 && range.every(Number.isInteger)
          && range[0] >= 0 && range[1] >= range[0] && range[1] < clip.frameCount
          && Array.isArray(selectedJoints) && selectedJoints.length > 0 && selectedJoints.every(joint=>typeof joint==='string' && joint.length)
          && (sample.highlight_index === undefined || Number.isInteger(sample.highlight_index) && sample.highlight_index >= range[0] && sample.highlight_index <= range[1]);
        if (!valid) {
          const error = `Invalid snapshot range or joint for ${video}`;
          if (onWarning) { onWarning(error); continue; }
          throw new Error(error);
        }
        entries.push({ clip, frame: sample.highlight_index ?? range[1], range: [...range], highlight_index: sample.highlight_index ?? range[1], joints: [...new Set(selectedJoints)], title: sample.title || '',
          explanations: { [sample.joint]: { general: sample.message_box?.before || '', specialized: sample.message_box?.after || '' } } });
      }
      continue;
    }
    for (const [value, sample] of Object.entries(frames)) {
      const legacy = Array.isArray(sample);
      const definitions = !legacy && (sample?.joints ?? (sample && typeof sample === 'object'
        ? Object.fromEntries(Object.entries(sample).filter(([name, value]) => !['title', 'message_box'].includes(name) && value && typeof value === 'object' && !Array.isArray(value)))
        : null));
      const joints = legacy ? sample : Array.isArray(definitions) ? definitions : definitions && typeof definitions === 'object' ? Object.keys(definitions) : [];
      const frame = Number(value);
      const error = !Number.isInteger(frame) || frame < 0 || frame >= clip.frameCount
        ? `Invalid snapshot frame ${video}/${value}`
        : !Array.isArray(joints) || !joints.length || joints.some(joint => typeof joint !== 'string')
          ? `Snapshot ${video}/${value} needs at least one joint name` : null;
      if (error) {
        if (onWarning) { onWarning(error); continue; }
        throw new Error(error);
      }
      const entry = { clip, frame, joints: [...new Set(joints)] };
      if (!legacy) {
        entry.title = typeof sample.title === 'string' ? sample.title : '';
        entry.explanations = Object.fromEntries(joints.map(name => [name, {
          general: typeof (definitions[name]?.before ?? definitions[name]?.general) === 'string' ? (definitions[name].before ?? definitions[name].general) : typeof (sample.message_box?.before ?? sample.message_box?.general) === 'string' ? (sample.message_box.before ?? sample.message_box.general) : '',
          specialized: typeof (definitions[name]?.after ?? definitions[name]?.specialized) === 'string' ? (definitions[name].after ?? definitions[name].specialized) : typeof (sample.message_box?.after ?? sample.message_box?.specialized) === 'string' ? (sample.message_box.after ?? sample.message_box.specialized) : '',
        }]));
      }
      entries.push(entry);
    }
  }
  return entries;
}

export function spotlightPoints(pose, names) {
  return names.flatMap(name => {
    const index = pose.joints.indexOf(name);
    const point = index < 0 ? null : pose.pred[0]?.[index];
    return point && Number.isFinite(point[0]) && Number.isFinite(point[1]) && (point[2] === undefined || point[2] >= 0) && (point[0] !== 0 || point[1] !== 0) ? [point.slice(0, 2)] : [];
  });
}

export function snapshotFocus(entry) {
  const average = points => ({ x: points.reduce((sum, point) => sum+point[0], 0)/points.length, y: points.reduce((sum, point) => sum+point[1], 0)/points.length });
  const centers = ['before', 'after'].flatMap(side => {
    const points = entry[side] ? spotlightPoints(entry[side], entry.joints) : [];
    return points.length ? [average(points)] : [];
  });
  return centers.length ? average(centers.map(point => [point.x, point.y])) : null;
}

// Preserve gaps and frame-relative opacity when a prediction is missing.
export function trajectoryPoints(pose, joint) {
  const index = pose.joints.indexOf(joint);
  return pose.pred.map((frame, offset) => {
    const point = frame?.[index];
    const valid = point && point.slice(0, 2).every(Number.isFinite)
      && (point[2] === undefined || point[2] >= 0) && (point[0] !== 0 || point[1] !== 0);
    return valid ? { x: point[0], y: point[1], opacity: pose.pred.length === 1 ? 1 : .1 + .9 * offset / (pose.pred.length - 1) } : null;
  });
}

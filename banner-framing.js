// Bound the whole swing once so the banner camera stays fixed during playback.
export function trajectoryBounds(pose) {
  const club = [], points = [];
  for (const frame of pose.pred) pose.joints.forEach((name, index) => {
    const point = frame[index];
    if (!point || !Number.isFinite(point[0]) || !Number.isFinite(point[1]) || (point[0] === 0 && point[1] === 0) || (point[2] !== undefined && point[2] < 0)) return;
    points.push(point); if (name.startsWith('golf_club_')) club.push(point);
  });
  if (!points.length) return null;
  const horizontal = club.length ? club : points;
  return { left: Math.min(...horizontal.map(p=>p[0])), right: Math.max(...horizontal.map(p=>p[0])),
    top: Math.min(...points.map(p=>p[1])), bottom: Math.max(...points.map(p=>p[1])) };
}

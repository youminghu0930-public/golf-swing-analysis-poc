import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { siteFiles } from './site-files.mjs';
const root = fileURLToPath(new URL('../dist/', import.meta.url));
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'materials/data/catalog.json'), 'utf8'));
if (!catalog.clips.length) throw new Error('No videos were included in the deployment');
for (const file of siteFiles(root, catalog)) {
  if (file !== '.nojekyll' && file.split('/').some(part => part.startsWith('.'))) throw new Error(`Pages excludes this required asset: ${file}`);
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing deployment file: ${file}`);
}
console.log(`Verified ${catalog.clips.length} videos, ${catalog.snapshots.length} snapshots, banner, and all referenced site assets.`);

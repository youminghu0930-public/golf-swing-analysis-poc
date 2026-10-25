# Golf Swing Analysis PoC

Business overview of four connected golf motion-analysis projects. The page uses the trajectory-postprocessing template with single-view media.

## Local preview

Requires Node.js 22+ and FFmpeg (including ffprobe).

```sh
node scripts/serve.mjs
```

Open http://127.0.0.1:8005. An optional numeric argument changes the port.

## Materials

- `materials/content.json`: all page copy, sections, navigation labels, project links, and banner settings. Set `page.banner.video` to an existing catalog key such as `down-the-line-0024` (view and ID must match the source folders). Changing it regenerates the banner video, poster, and pose data on the next page refresh; invalid keys report an error.
- `materials/data/vidoes/{view}/{id}.MP4`: original footage (existing folder spelling preserved).
- `materials/data/poses/{view}/{id}.json`: one pose prediction set per clip.
- `materials/data/snapshot.json`: curated snapshots, e.g. `{"0026-2":[{"range":[130,150],"joints":["golf_club_head"]}]}`. Ranges are inclusive, zero-based; `highlight_index` optionally selects the background frame. Every selected joint receives a trail.
- `materials/data/credits.json`: original source links.
- `materials/projects/{repo}/banner.*`: independent copies of each project's optimized banner video, pose sequence, and poster. Embedded timing/preview metadata is stored in content.json. No sibling checkout is needed to run or deploy.
- `materials/data/snapshots/`: generated snapshot images, reused when current.
- `materials/data/.generated/`: disposable metadata and media caches.

The server prepares catalogs and previews automatically. Restart after changing scripts; material changes refresh on the next page request. Preview videos retain posters during loading, play only onscreen, pause in background tabs, and respect reduced-motion preferences. Each has a play/pause control.

## Validation and deployment

```sh
node --test tests/*.test.mjs
node scripts/build-site.mjs
node scripts/verify-site.mjs
```

The GitHub Pages workflow tests, builds, verifies, and deploys on pushes to main/master or manual dispatch. Set the repository's Pages source to GitHub Actions. `dist/` contains selected media and portable asset paths; generated dot-directory paths are rewritten for Pages. No local commit or push is performed by these scripts.

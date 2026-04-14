#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, basename, join } from 'path';
import { marked } from 'marked';

const [, , mdPath, outDir] = process.argv;
if (!mdPath || !outDir) {
  console.error('Usage: md-to-html.mjs <input.md> <output-dir>');
  process.exit(1);
}

const md = readFileSync(mdPath, 'utf-8');
const title = md.match(/^#\s+(.+)/m)?.[1] ?? basename(mdPath, '.md');
const html = await marked.parse(md);

const page = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  body { max-width: 52em; margin: 2em auto; padding: 0 1em; font-family: system-ui, sans-serif; line-height: 1.6; color: #1a1a1a; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; }
  th, td { border: 1px solid #ccc; padding: .4em .8em; text-align: left; }
  th { background: #f5f5f5; }
  code { background: #f0f0f0; padding: .15em .3em; border-radius: 3px; font-size: .9em; }
  blockquote { border-left: 3px solid #ccc; margin-left: 0; padding-left: 1em; color: #555; }
  h1, h2, h3 { margin-top: 1.5em; }
  hr { border: none; border-top: 1px solid #ddd; margin: 2em 0; }
</style>
</head>
<body>
${html}
</body>
</html>`;

mkdirSync(outDir, { recursive: true });
const slug = basename(mdPath, '.md').toLowerCase();
const outPath = join(outDir, `${slug}.html`);
writeFileSync(outPath, page);
console.log(`${mdPath} -> ${outPath}`);

/** Turn a Chrome .cpuprofile into a small call-tree flame-style SVG. */
import { readFile, writeFile } from 'node:fs/promises';
const path = process.argv[2] || 'bench-out/profile-after.cpuprofile';
const file = JSON.parse(await readFile(path, 'utf8'));
const nodes = new Map(file.nodes.map((node) => [node.id, node]));
const counts = new Map();
for (const node of file.nodes) counts.set(node.id, node.hitCount || 0);
for (const sample of file.samples || []) counts.set(sample, (counts.get(sample) || 0) + 1);
const root = file.nodes.find((n) => !n.parent) || file.nodes[0];
const total = (id) => {
  const node = nodes.get(id);
  if (!node) return 0;
  return (counts.get(id) || 0) + (node.children || []).reduce((n, child) => n + total(child), 0);
};
const measure = total(root.id) || 1;
const rects = [];
const render = (id, x, w, y) => {
  const node = nodes.get(id);
  if (!node || w < 1) return;
  const name = node.callFrame.functionName || '(anonymous)';
  const safe = name.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const hue = (id * 71) % 360;
  rects.push(
    `<rect x="${x.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="20" fill="hsl(${hue},60%,74%)" stroke="white" stroke-width=".5"/><title>${safe}</title><text x="${(x + 2).toFixed(1)}" y="${y + 14}" font-size="10" fill="#111">${safe.slice(0, Math.max(0, Math.floor(w / 7)))}</text>`,
  );
  const children = node.children || [];
  let cursor = x;
  for (const child of children) {
    const childWidth = (w * total(child)) / measure;
    render(child, cursor, childWidth, y + 21);
    cursor += childWidth;
  }
};
render(root.id, 0, 1280, 32);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800"><rect width="100%" height="100%" fill="#fff"/><text x="12" y="22" font-size="17">CPU sampling call-tree (from measured Chrome .cpuprofile)</text>${rects.join('')}</svg>`;
const target = path.replace(/\.cpuprofile$/, '.svg');
await writeFile(target, svg);
console.log(target);

import { cp, mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';

// Run AFTER unzipping in the existing repo's root, BEFORE npm install.
const root = process.cwd();
const patch = join(root, '.lab04_patch');
const source = join(patch, 'server', 'src', 'index.js');
const exists = async (file) =>
  stat(file).then(
    () => true,
    () => false,
  );
if (!(await exists(source)))
  throw new Error('Run this from the existing Space Arena repository root after unzipping Lab 04');
if (!(await exists(join(root, '.git'))))
  throw new Error('Missing .git — use the existing repo, not a new project');
if (await exists(join(root, 'src'))) {
  // Refuse to overwrite local user changes by moving through a dirty worktree.
  const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
    cwd: root,
    encoding: 'utf8',
  });
  const changed = status.split('\n').filter(Boolean);
  if (changed.length)
    throw new Error(
      `Uncommitted edits detected: ${changed.slice(0, 8).join(', ')}. Commit or stash changes before applying Lab 04.`,
    );
  await mkdir(join(root, 'client'), { recursive: true });
  await mkdir(join(root, 'docs'), { recursive: true });
  if (await exists(join(root, 'README.md')))
    await cp(join(root, 'README.md'), join(root, 'docs', 'lab-03-readme.md'));
  for (const name of ['src', 'public', 'tests', 'index.html']) {
    const from = join(root, name);
    if (await exists(from)) {
      const to = join(root, 'client', name);
      if (await exists(to))
        throw new Error(`Won't overwrite existing ${to}. Move it aside and try again.`);
      await rename(from, to);
      console.log(`Moved ${name} → client/${name}`);
    }
  }
} else if (!(await exists(join(root, 'client', 'src', 'main.js')))) {
  throw new Error('Could not find src/main.js nor client/src/main.js');
}
// Remove the obsolete Lab 03 fixture: Vite must now proxy /api/rooms to Node.
await rm(join(root, 'client', 'public', 'api'), { recursive: true, force: true });
async function overlay(from, to) {
  await mkdir(to, { recursive: true });
  for (const entry of await readdir(from, { withFileTypes: true })) {
    const src = join(from, entry.name);
    const dst = join(to, entry.name);
    if (entry.isDirectory()) await overlay(src, dst);
    else await cp(src, dst, { force: true });
  }
}
await overlay(patch, root);
await rm(patch, { recursive: true, force: true });
await rm(resolve(root, 'package-lock.json'), { force: true }); // npm install creates workspace lockfile
console.log(
  '\nLAB 04 files applied. Next: npm install && npm run format && npm run check && npm run dev',
);

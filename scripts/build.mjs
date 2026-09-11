import { mkdir, readdir, readFile, writeFile, cp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const source = resolve('public'), target = resolve('dist');
const files = (await readdir(source)).sort();
const hash = createHash('sha256');
for (const f of files) hash.update(await readFile(`${source}/${f}`));
const id = hash.digest('hex').slice(0, 12);
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
for (const f of ['index.html', 'sw.js']) {
  const text = await readFile(`${source}/${f}`, 'utf8');
  await writeFile(`${target}/${f}`, text.replaceAll('BUILD_ID', id));
}
console.log(`Built Clone Dash ${id}, ${files.length} assets`);

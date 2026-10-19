import {readFile, readdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

// Stamp the HTML entry points and the entire local ES module graph together.
// Pages runs this in its checkout; it does not bundle or rebuild dist.
export async function versionAssets(root, version) {
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(version || '')) throw Error('請提供有效的資源版本號。');
  const changed = [];
  function reference(value) {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value)) return value;
    const hashAt = value.indexOf('#');
    const hash = hashAt < 0 ? '' : value.slice(hashAt);
    const resource = hashAt < 0 ? value : value.slice(0, hashAt);
    const queryAt = resource.indexOf('?');
    const file = queryAt < 0 ? resource : resource.slice(0, queryAt);
    if (!/\.(?:js|css)$/i.test(file)) return value;
    const query = new URLSearchParams(queryAt < 0 ? '' : resource.slice(queryAt + 1));
    query.set('v', version);
    return `${file}?${query}${hash}`;
  }
  async function visit(directory) {
    for (const entry of await readdir(directory, {withFileTypes:true})) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) { await visit(file); continue; }
      if (!entry.isFile() || !/\.(?:html|js)$/.test(entry.name) || entry.name.endsWith('.user.js')) continue;
      const before = await readFile(file, 'utf8');
      const after = entry.name.endsWith('.html')
        ? before.replace(/(\b(?:src|href)\s*=\s*)(['"])([^'"]+)\2/g,
          (_, prefix, quote, value) => `${prefix}${quote}${reference(value)}${quote}`)
        : before.replace(/(\b(?:import|export)\s+(?:[^'";]*?\s+from\s*)?|\bimport\s*\(\s*)(['"])([^'"]+)\2/g,
          (_, prefix, quote, value) => `${prefix}${quote}${reference(value)}${quote}`);
      if (after !== before) { await writeFile(file, after, 'utf8'); changed.push(path.relative(root, file)); }
    }
  }
  await visit(root);
  return changed;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const root = fileURLToPath(new URL('../dist/', import.meta.url));
  const changed = await versionAssets(root, process.argv[2]);
  console.log(`資源版本 ${process.argv[2]}：更新 ${changed.length} 個檔案。`);
}

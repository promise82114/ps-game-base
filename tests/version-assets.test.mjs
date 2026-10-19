import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {versionAssets} from '../tools/version-assets.mjs';

test('one release versions HTML, shared scripts and transitive modules while preserving external URLs and userscripts', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'psgb-assets-'));
  await mkdir(path.join(root, 'shared'));
  await mkdir(path.join(root, 'scripts'));
  await writeFile(path.join(root, 'index.html'), '<link href="style.css"><script src="shared/auth.js"></script><script type="module" src="app.js"></script><a href="scripts/tool.user.js">Install</a><link href="https://fonts.example/font.css"><img src="cover.png">');
  await writeFile(path.join(root, 'app.js'), "import {model} from './model.js';\nimport './shared/auth.js';\nconst module = import('./lazy.js');\nexport {model} from './model.js';\nimport remote from 'https://example.com/remote.js';\n");
  await writeFile(path.join(root, 'model.js'), "import {shared} from './shared/auth.js';\n");
  await writeFile(path.join(root, 'shared/auth.js'), 'export const shared = true;');
  const userScript = '// @version 0.4.1\nconst code = "import(\'./keep.js\')";';
  await writeFile(path.join(root, 'scripts/tool.user.js'), userScript);
  await versionAssets(root, 'release-a');
  const html = await readFile(path.join(root, 'index.html'), 'utf8');
  for (const asset of ['style.css', 'shared/auth.js', 'app.js', 'scripts/tool.user.js']) assert.ok(html.includes(`${asset}?v=release-a`));
  assert.ok(html.includes('https://fonts.example/font.css"'));
  assert.ok(html.includes('cover.png"'));
  const app = await readFile(path.join(root, 'app.js'), 'utf8');
  for (const asset of ['./model.js', './shared/auth.js', './lazy.js']) assert.ok(app.includes(`${asset}?v=release-a`));
  assert.ok(app.includes('https://example.com/remote.js\''));
  assert.match(await readFile(path.join(root, 'model.js'), 'utf8'), /auth\.js\?v=release-a/);
  assert.equal(await readFile(path.join(root, 'scripts/tool.user.js'), 'utf8'), userScript);
  assert.deepEqual(await versionAssets(root, 'release-a'), []);
  await versionAssets(root, 'release-b');
  assert.ok((await readFile(path.join(root, 'app.js'), 'utf8')).includes('./model.js?v=release-b'));
  assert.ok(!(await readFile(path.join(root, 'index.html'), 'utf8')).includes('release-a'));
});

test('version replacement preserves other query parameters and URL fragments', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'psgb-assets-'));
  await writeFile(path.join(root, 'index.html'), '<script src="app.js?mode=compact&v=old#entry"></script><link href="//cdn.example/style.css"><a href="#help.js">Help</a>');
  await versionAssets(root, 'new');
  assert.equal(await readFile(path.join(root, 'index.html'), 'utf8'), '<script src="app.js?mode=compact&v=new#entry"></script><link href="//cdn.example/style.css"><a href="#help.js">Help</a>');
  await assert.rejects(versionAssets(root, '../invalid'), /有效的資源版本號/);
});

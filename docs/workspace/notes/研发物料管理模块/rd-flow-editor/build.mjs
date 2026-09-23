import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const x6 = dirname(require.resolve('@antv/x6/package.json'));
const read = (path) => readFile(path, 'utf8');
const [shell, css, app, model, sceneModel, scene, runtime, runtimeCss, license] = await Promise.all([
  read(resolve(root, 'shell.html')), read(resolve(root, 'editor.css')),
  read(resolve(root, 'editor.js')), read(resolve(root, 'model.js')),
  read(resolve(root, 'scene-model.js')), read(resolve(root, 'scene.js')),
  read(resolve(x6, 'dist/index.js')), read(resolve(x6, 'dist/index.css')), read(resolve(x6, 'LICENSE')),
]);
// Fixed source files only. Embedded user data is separately escaped at runtime.
const script = [runtime.replace(/\/\/# sourceMappingURL=.*$/gm, ''), model, sceneModel, scene, app].join('\n;\n');
if (/<\/script/i.test(script)) throw new Error('Unexpected script terminator in application bundle');
const html = shell.replace('/*__STYLES__*/', () => runtimeCss + '\n' + css)
  .replace('/*__APPLICATION__*/', () => script)
  .replace('__X6_LICENSE__', () => license.replaceAll('--', '—'));
if (/<script[^>]+src=|<link[^>]+href=|@import\s/i.test(html)) throw new Error('External asset found');
const output = resolve(root, '../研发物料流程编辑器.html');
await writeFile(output, html);
console.log(`Built offline HTML: ${output} (${Math.round(Buffer.byteLength(html) / 1024)} KiB)`);

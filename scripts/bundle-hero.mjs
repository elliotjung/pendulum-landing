import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const bundles = [
  { entry: 'assets/scene.js', output: 'assets/scene.bundle.js', format: 'esm', ceiling: 700_000 }
];

for (const bundle of bundles) {
  const outputPath = join(root, bundle.output);
  const result = await build({
    absWorkingDir: root,
    entryPoints: [bundle.entry],
    bundle: true,
    format: bundle.format,
    minify: true,
    target: ['es2022'],
    legalComments: 'eof',
    write: false
  });
  const generated = result.outputFiles?.[0]?.text;
  if (!generated) throw new Error(`esbuild did not return ${bundle.output}`);
  // Three.js shader template literals contain source trailing spaces. Strip
  // them deterministically so generated bundles satisfy git diff --check.
  const bytes = Buffer.from(
    generated
      .replace(/[ \t]+$/gm, '')
      .replace(/^ +(?=\t)/gm, '')
  );
  if (process.argv.includes('--check')) {
    const committed = await readFile(outputPath);
    if (!committed.equals(bytes)) {
      console.error(`${bundle.output} is stale; run npm run build:hero and commit it`);
      process.exit(1);
    }
    if (bytes.byteLength > bundle.ceiling) {
      console.error(`${bundle.output} is ${bytes.byteLength} bytes; ${bundle.ceiling}-byte transfer ceiling exceeded`);
      process.exit(1);
    }
    console.log(`${bundle.output} fresh (${bytes.byteLength} bytes)`);
  } else {
    await writeFile(outputPath, bytes);
    console.log(`${bundle.output} written (${bytes.byteLength} bytes)`);
  }
}

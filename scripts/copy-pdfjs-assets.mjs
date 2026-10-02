import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pdfjsDirectory = resolve(projectRoot, 'node_modules/pdfjs-dist');
const publicDirectory = resolve(projectRoot, 'public/pdfjs');

await mkdir(publicDirectory, { recursive: true });
await Promise.all([
  copyFile(resolve(pdfjsDirectory, 'build/pdf.min.mjs'), resolve(publicDirectory, 'pdf.min.mjs')),
  copyFile(resolve(pdfjsDirectory, 'build/pdf.worker.min.mjs'), resolve(publicDirectory, 'pdf.worker.min.mjs')),
  copyFile(resolve(pdfjsDirectory, 'LICENSE'), resolve(publicDirectory, 'LICENSE.txt'))
]);

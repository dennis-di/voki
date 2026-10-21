// Kopiert die Dateien der Texterkennung (Tesseract) nach public/ocr, damit sie von der eigenen Domain geladen werden.
import { mkdirSync, copyFileSync } from 'node:fs';
const out = 'public/ocr';
mkdirSync(out, { recursive: true });
const nm = 'node_modules';
for (const f of ['tesseract.js/dist/worker.min.js',
  'tesseract.js-core/tesseract-core-lstm.wasm.js',
  'tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
  'tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js']) copyFileSync(`${nm}/${f}`, `${out}/${f.split('/').pop()}`);
for (const l of ['fra', 'deu', 'eng']) copyFileSync(`${nm}/@tesseract.js-data/${l}/4.0.0_best_int/${l}.traineddata.gz`, `${out}/${l}.traineddata.gz`);
console.log('OCR-Dateien kopiert nach', out);

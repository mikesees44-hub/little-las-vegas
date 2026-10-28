/**
 * OCR engines behind one interface, so the directory pipeline does not care
 * which one runs:
 *   tesseract-cli  the system `tesseract` binary (TSV output: words with confidences, grouped into lines)
 *   none           reports "not run" (no engine available) — never invents text
 * A tesseract.js engine can be added the same way if the binary is not available.
 */
import { spawnSync } from 'node:child_process';

export interface OcrLine { text: string; conf: number; top: number; left: number }
export interface OcrResult { engine: string; lines: OcrLine[]; meanConf: number }

export interface OcrEngine {
  id: string;
  available(): boolean;
  recognize(imagePath: string, opts?: { psm?: number; lang?: string }): OcrResult;
}

export const tesseractCli: OcrEngine = {
  id: 'tesseract-cli',
  available() {
    const r = spawnSync('tesseract', ['--version'], { encoding: 'utf8' });
    return r.status === 0;
  },
  recognize(imagePath, opts = {}) {
    const r = spawnSync('tesseract', [imagePath, 'stdout', '--psm', String(opts.psm ?? 4), '-l', opts.lang ?? 'eng', 'tsv'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0) throw new Error(`tesseract failed: ${r.stderr}`);
    return parseTsv(r.stdout, 'tesseract-cli');
  },
};

export const noOcr: OcrEngine = {
  id: 'none',
  available: () => false,
  recognize: () => { throw new Error('no OCR engine available: not run'); },
};

export function pickEngine(): OcrEngine {
  return tesseractCli.available() ? tesseractCli : noOcr;
}

/** Tesseract TSV → lines (words joined by block/paragraph/line, confidence = mean of the words). */
export function parseTsv(tsv: string, engine: string): OcrResult {
  const rows = tsv.split('\n').slice(1).map((l) => l.split('\t')).filter((c) => c.length >= 12 && c[0] === '5');
  const by = new Map<string, { words: string[]; confs: number[]; top: number; left: number }>();
  for (const c of rows) {
    const key = `${c[2]}.${c[3]}.${c[4]}`;
    const word = c[11].trim();
    if (!word) continue;
    const g = by.get(key) ?? { words: [], confs: [], top: Number(c[7]), left: Number(c[6]) };
    g.words.push(word);
    g.confs.push(Number(c[10]));
    by.set(key, g);
  }
  const lines = [...by.values()].map((g) => ({ text: g.words.join(' '), conf: Math.round(g.confs.reduce((s, x) => s + x, 0) / g.confs.length), top: g.top, left: g.left }));
  lines.sort((a, b) => a.top - b.top || a.left - b.left);
  const meanConf = lines.length ? Math.round(lines.reduce((s, l) => s + l.conf, 0) / lines.length) : 0;
  return { engine, lines, meanConf };
}

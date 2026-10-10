export interface DiffLine {
  type: 'same' | 'add' | 'del';
  text: string;
  /** 1-based line number in the old text (same/del) */
  oldNo?: number;
  /** 1-based line number in the new text (same/add) */
  newNo?: number;
}

// Above this many cells the LCS table gets too big for the browser; fall back to a block replace.
const MAX_LCS_CELLS = 4_000_000;

/** Line diff of `oldText` → `newText`. Trims the shared prefix/suffix, then runs LCS on what's left. */
export function diffLines(oldText: string, newText: string): { lines: DiffLine[]; approximate: boolean } {
  const a = oldText.split(/\r?\n/);
  const b = newText.split(/\r?\n/);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const out: DiffLine[] = [];
  for (let i = 0; i < start; i++) out.push({ type: 'same', text: a[i], oldNo: i + 1, newNo: i + 1 });

  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const n = midA.length;
  const m = midB.length;
  let approximate = false;

  if ((n + 1) * (m + 1) > MAX_LCS_CELLS) {
    approximate = true;
    midA.forEach((text, i) => out.push({ type: 'del', text, oldNo: start + i + 1 }));
    midB.forEach((text, j) => out.push({ type: 'add', text, newNo: start + j + 1 }));
  } else {
    // lcs[i][j] = LCS length of midA[i..] and midB[j..]
    const w = m + 1;
    const lcs = new Uint32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        lcs[i * w + j] = midA[i] === midB[j] ? lcs[(i + 1) * w + j + 1] + 1 : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && midA[i] === midB[j]) {
        out.push({ type: 'same', text: midA[i], oldNo: start + i + 1, newNo: start + j + 1 });
        i++;
        j++;
      } else if (j < m && (i === n || lcs[i * w + j + 1] >= lcs[(i + 1) * w + j])) {
        out.push({ type: 'add', text: midB[j], newNo: start + j + 1 });
        j++;
      } else {
        out.push({ type: 'del', text: midA[i], oldNo: start + i + 1 });
        i++;
      }
    }
  }

  for (let k = 0; k < a.length - endA; k++) {
    out.push({ type: 'same', text: a[endA + k], oldNo: endA + k + 1, newNo: endB + k + 1 });
  }
  return { lines: out, approximate };
}

export type DiffRow = DiffLine | { type: 'skip'; count: number };

/** Collapses unchanged runs to `context` lines around each change. */
export function withContext(lines: DiffLine[], context = 3): DiffRow[] {
  const keep = new Array(lines.length).fill(false);
  lines.forEach((l, idx) => {
    if (l.type === 'same') return;
    for (let k = Math.max(0, idx - context); k <= Math.min(lines.length - 1, idx + context); k++) keep[k] = true;
  });
  const rows: DiffRow[] = [];
  let skipped = 0;
  lines.forEach((l, idx) => {
    if (keep[idx]) {
      if (skipped) rows.push({ type: 'skip', count: skipped });
      skipped = 0;
      rows.push(l);
    } else {
      skipped++;
    }
  });
  if (skipped) rows.push({ type: 'skip', count: skipped });
  return rows;
}

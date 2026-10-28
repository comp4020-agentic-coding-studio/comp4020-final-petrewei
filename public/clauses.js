// Clauses (ADR 0051): a tip or a definition is written as clauses and may
// break only between them. Pure text, so the page and the checks share it.
// A clause ends after . , ; : ! ? or the Japanese and Chinese 。，、；：！？, never inside one. A mark
// ends a clause only when a space or the end follows it (so 1.5% and 1,000
// stay whole) or, in Japanese and Chinese, always; "i.e." and "e.g." do not.
const ABBREVIATIONS = /\b(?:i\.e|e\.g|etc|vs)\.$/i;
export function clauses(text) {
  const out = [];
  let start = 0;
  const flush = (end) => {
    const part = text.slice(start, end).trim();
    if (part) out.push(part);
    start = end;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if ("。，、；：！？".includes(c)) flush(i + 1);
    else if (".,;:!?".includes(c) && (i === text.length - 1 || /\s/.test(text[i + 1])) && !ABBREVIATIONS.test(text.slice(0, i + 1))) flush(i + 1);
  }
  flush(text.length);
  return out;
}


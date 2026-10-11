// Admission only needs root thread-count fields. Native TextFormat parsing still
// validates all parameters; a mismatch is rejected before native allocation.
export function rootIntegerParameter(text: string, names: readonly string[]): number | undefined {
  let visible = '';
  let quote = '';
  let escaped = false;
  let comment: 'line' | 'block' | '' = '';
  for (let i = 0; i < text.length; ++i) {
    const ch = text[i], next = text[i + 1];
    if (comment === 'line') {
      if (ch === '\n') comment = '';
      visible += ch === '\n' ? ch : ' ';
    } else if (comment === 'block') {
      if (ch === '*' && next === '/') { visible += '  '; ++i; comment = ''; }
      else visible += ' ';
    } else if (quote) {
      visible += ' ';
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") { quote = ch; visible += ' '; }
    else if (ch === '#' || (ch === '/' && next === '/')) { comment = 'line'; visible += ' '; }
    else if (ch === '/' && next === '*') { comment = 'block'; visible += '  '; ++i; }
    else visible += ch;
  }
  const depths: number[] = [];
  let depth = 0;
  for (const ch of visible) {
    depths.push(depth);
    if ('{<['.includes(ch)) ++depth;
    if ('}>]'.includes(ch)) --depth;
  }
  const values: number[] = [];
  for (const match of visible.matchAll(/\b([A-Za-z_][A-Za-z_0-9]*)\s*:\s*([+-]?(?:0[xX][0-9a-fA-F]+|[0-9]+))(?=[\s,;}>]|$)/g)) {
    if (depths[match.index] !== 0 || !names.includes(match[1])) continue;
    const literal = match[2];
    const sign = literal.startsWith('-') ? -1 : 1;
    const unsigned = literal.replace(/^[+-]/, '');
    const value = sign * (/^0[0-7]+$/.test(unsigned) ? parseInt(unsigned, 8) : Number(unsigned));
    if (!Number.isInteger(value) || value < 0 || value > 0x7fffffff) {
      throw new RangeError('Backend thread count must be a nonnegative signed 32-bit integer.');
    }
    if (value > 0) values.push(value);
  }
  if (values.some(value => value !== values[0])) throw new RangeError('Conflicting backend thread counts.');
  return values[0];
}

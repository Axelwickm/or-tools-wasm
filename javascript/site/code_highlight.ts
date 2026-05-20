function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function highlightTypeScript(source: string): string {
  const tokens: string[] = [];
  const stash = (className: string, value: string) => {
    const index = tokens.push(`<span class="${className}">${escapeHtml(value)}</span>`) - 1;
    return `@@CODE_TOKEN_${index}@@`;
  };

  let html = source
    .replace(/`(?:\\.|[^`])*`|'(?:\\.|[^'])*'|"(?:\\.|[^"])*"/g, (value) => stash('str', value))
    .replace(/\/\/.*/g, (value) => stash('comment', value));

  html = escapeHtml(html)
    .replace(/\b(import|from|type|const|let|function|return|if|for|new|async|await|true|false|null|undefined)\b/g, '<span class="kw">$1</span>')
    .replace(/\b(number|string|unknown|NonNullable|Array|Grid|CpModelProto|CpSolverResponse|SatParameters|Promise)\b/g, '<span class="type">$1</span>')
    .replace(/\b([A-Za-z_$][\w$]*)(?=\()/g, '<span class="fn">$1</span>')
    .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="num">$1</span>')
    .replace(/@@CODE_TOKEN_(\d+)@@/g, (_, index: string) => tokens[Number(index)] ?? '');

  return html;
}

export function highlightCodeBlocks(root: ParentNode = document): void {
  for (const code of root.querySelectorAll<HTMLElement>('code[data-highlight="ts"]')) {
    if (code.dataset.highlighted === 'true') continue;
    code.innerHTML = highlightTypeScript(code.textContent ?? '');
    code.dataset.highlighted = 'true';
  }
}

highlightCodeBlocks();

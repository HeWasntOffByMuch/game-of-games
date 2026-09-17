/** Everything rendered goes through here, so no player name can inject markup. */
export function escape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): string {
  return strings.reduce((out, part, index) => {
    const value = values[index - 1];
    const rendered = Array.isArray(value) ? value.join('') : String(value ?? '');
    return out + rendered + part;
  });
}

export function classes(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ');
}

/** "Ada", "Ada and Bo", "Ada, Bo and Cy". */
export function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1] as string}`;
}

export function seconds(ms: number): string {
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  return minutes > 0 ? `${minutes}m ${String(total % 60).padStart(2, '0')}s` : `${total}s`;
}

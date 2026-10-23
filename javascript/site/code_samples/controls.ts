export function value(id: string, fallback = ''): string {
  return (document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null)?.value ?? fallback;
}
export function checked(id: string): boolean {
  return Boolean((document.getElementById(id) as HTMLInputElement | null)?.checked);
}
export function numberValue(id: string, fallback: number): number {
  const number = Number(value(id, String(fallback)));
  return Number.isFinite(number) ? number : fallback;
}
export function executor(): string {
  const selected = value('solver-executor', value('cp-sat-executor', 'worker'));
  if (selected !== 'server') return quote(selected);
  const endpoint = document.querySelector<HTMLInputElement>('.server-endpoint-input')?.value ?? '';
  const token = document.querySelector<HTMLInputElement>('.server-auth-input')?.value;
  return `{ type: 'server', url: ${quote(endpoint)}${token ? ", authToken: '<your server token>'" : ''} }`;
}
export const quote = (text: string): string => JSON.stringify(text);

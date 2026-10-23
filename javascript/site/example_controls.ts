/** Hide unavailable controls as well as excluding them from the submitted settings. */
export function setControlAvailable(control: HTMLInputElement | HTMLSelectElement | null, available: boolean): void {
  if (!control) return;
  const label = control.closest('label');
  if (label) label.hidden = !available;
  control.disabled = !available;
  if (!available && control instanceof HTMLInputElement && control.type === 'checkbox') control.checked = false;
}

// A failure must remain visible even when the user has not opened the log.
const log = document.querySelector<HTMLDetailsElement>('.solve-log');
const messages = log?.querySelector('#status');
if (log && messages) {
  new MutationObserver(() => {
    if (/\bfailed\b|\berror:|no solution/i.test(messages.textContent ?? '')) log.open = true;
  }).observe(messages, { childList: true, characterData: true, subtree: true });
}

if (location.hash === '#advanced-settings') {
  const settings = document.querySelector<HTMLDetailsElement>('#advanced-settings');
  if (settings) settings.open = true;
}

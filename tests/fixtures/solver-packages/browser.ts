import { runCases } from './cases.ts';
const status = document.querySelector('#status')!;
const solver = new URL(location.href).searchParams.get('solver') ?? 'cp-sat';
runCases(solver).then(results => {
  status.textContent = JSON.stringify({ ok: true, results });
}, error => {
  status.textContent = JSON.stringify({ ok: false, error: String(error?.stack ?? error) });
});

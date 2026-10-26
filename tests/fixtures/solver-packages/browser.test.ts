import { expect, test } from '@playwright/test';
for (const flavor of ['jspi', 'asyncify']) {
  for (const solver of ['cp-sat', 'routing']) {
    test(`${solver} ${flavor}`, async ({ page }) => {
      const disableJspi = 'Object.defineProperty(WebAssembly,"promising",{value:undefined,configurable:true});';
      if (flavor === 'asyncify') {
        await page.addInitScript(disableJspi);
        await page.route(/\/worker-[^/]+\.js$/, async route => {
          const response = await route.fetch();
          await route.fulfill({ response, body: disableJspi + await response.text() });
        });
      }
      const wasm: string[] = [];
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => { if (request.url().endsWith('.wasm')) wasm.push(request.url()); });
      await page.goto(`/?solver=${solver}`);
      await expect(page.locator('#status')).not.toHaveText('pending', { timeout: 290_000 });
      const result = JSON.parse(await page.locator('#status').innerText());
      expect(result, JSON.stringify(result)).toHaveProperty('ok', true);
      expect(errors).toEqual([]);
      expect(wasm.length).toBeGreaterThan(0);
      for (const url of wasm) {
        expect(url).toContain(`${solver === 'cp-sat' ? 'cp_sat' : 'routing'}_runtime`);
        expect(url.includes('_asyncify')).toBe(flavor === 'asyncify');
      }
    });
  }
}

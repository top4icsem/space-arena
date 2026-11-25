declare global {
  interface Window {
    __spaceArenaDebug: { getNetwork(): { remoteShips: { id: number; x: number; y: number }[] } };
  }
}
import { test, expect } from '@playwright/test';

test('Two browser contexts: remote flight moves and chat crosses room', async ({ browser }) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  try {
    const a = await first.newPage(),
      b = await second.newPage();
    const join = async (page: typeof a, name: string) => {
      await page.goto('/');
      await expect(page.locator('#join-game')).toBeEnabled();
      await page.locator('#pilot-name').fill(name);
      await page.locator('.room-card').first().click();
      await page.locator('#join-game').click();
      await expect(page.locator('#lobby-overlay')).toBeHidden();
      await expect(page.locator('#network-status')).toContainText(/CONNECTED|ONLINE/i);
    };
    await join(a, 'PilotA');
    await join(b, 'PilotB');
    await expect(a.locator('#network-roster')).toContainText('PilotB');
    await expect(b.locator('#network-roster')).toContainText('PilotA');
    await b.locator('#chat-input').fill('Hello from pilot B');
    await b.locator('#chat-form button').click();
    await expect(a.locator('#chat-messages')).toContainText('Hello from pilot B');
    // World contains a remote ship; after thrust the remote coordinate changes.
    await expect
      .poll(async () => b.evaluate(() => window.__spaceArenaDebug.getNetwork().remoteShips.length))
      .toBeGreaterThan(0);
    const playerAId = await a.evaluate(() => window.__spaceArenaDebug.getNetwork().netId);

    const before = await b.evaluate(
      (id) => window.__spaceArenaDebug.getNetwork().remoteShips.find((p) => p.id === id),
      playerAId,
    );
    expect(before).toBeTruthy();
    await a.locator('#arena').focus();
    await a.keyboard.down('KeyW');
    await a.waitForTimeout(1500);
    await a.keyboard.up('KeyW');
    await expect
      .poll(
        async () =>
          await b.evaluate((before) => {
            const remote = window.__spaceArenaDebug
              .getNetwork()
              .remoteShips.find((p) => p.id === before.id);

            if (!remote) return 0;

            return Math.hypot(remote.x - before.x, remote.y - before.y);
          }, before),
      )
      .toBeGreaterThan(3);
    await expect(a.locator('#net-age')).not.toHaveText('—');
    await expect(b.locator('#net-age')).not.toHaveText('—');
  } finally {
    await first.close();
    await second.close();
  }
});

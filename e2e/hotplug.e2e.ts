import { expect, test } from "@playwright/test";

import { ARCTIS, MAXWELL2_XBOX, boot, plug } from "./support";

// Plugging a headset in or out updates the UI by itself — no restart, no button
// (PROJECT.md §3.1). The events come from the mock; in the app they come from
// the udev watcher (#10).
test.describe("hotplug", () => {
  test("picks up a headset plugged in while the app is running", async ({ page }) => {
    await boot(page, { devices: [] });
    await expect(page.getByText("No headset connected")).toBeVisible();

    await plug(page, [MAXWELL2_XBOX]);

    await expect(page.getByRole("heading", { name: MAXWELL2_XBOX.name })).toBeVisible();
  });

  test("dims the device when it is unplugged and returns when it is back", async ({ page }) => {
    await boot(page);
    await expect(page.getByRole("heading", { name: MAXWELL2_XBOX.name })).toBeVisible();

    await plug(page, []);
    await expect(page.getByText("Connection lost")).toBeVisible();

    await plug(page, [MAXWELL2_XBOX]);

    await expect(page.getByText("Connection lost")).toBeHidden();
    await expect(page.locator("[data-capability]").first()).toBeVisible();
  });

  test("does not jump to another headset when ours disappears", async ({ page }) => {
    await boot(page);

    // Ours is gone and a different one is connected: the screen keeps showing
    // ours, dimmed, rather than silently switching to a headset the user never
    // asked for.
    await plug(page, [ARCTIS]);
    await expect(page.getByText("Connection lost")).toBeVisible();
    await expect(page.getByRole("heading", { name: MAXWELL2_XBOX.name })).toBeVisible();

    // Only once ours stays away does the app admit there is nothing to show
    // (choosing between several devices is the picker's job, not the machine's).
    await plug(page, [ARCTIS]);
    await expect(page.getByText("No headset connected")).toBeVisible();
  });

  test("renders only the rows a different headset reports", async ({ page }) => {
    await boot(page, { devices: [ARCTIS] });

    await expect(page.getByRole("heading", { name: ARCTIS.name })).toBeVisible();
    await expect(page.locator("[data-capability='CAP_SIDETONE']")).toBeVisible();
    await expect(page.locator("[data-capability='CAP_LIGHTS']")).toBeVisible();
    await expect(page.locator("[data-capability='CAP_EQUALIZER_PRESET']")).toBeHidden();
  });
});

import { expect, test } from "@playwright/test";

import { MAXWELL2_XBOX, boot, refuseWrites, writes } from "./support";

const SIDETONE = "[data-capability='CAP_SIDETONE']";

// Writes are optimistic: the value applies at once, and only a refusal from the
// device undoes it (PROJECT.md §3.3, ADR 0012).
test.describe("writing a parameter", () => {
  test("applies what the user picked and sends it to the device", async ({ page }) => {
    await boot(page);

    await page.locator(`${SIDETONE} input`).fill("64");

    await expect(page.locator(`${SIDETONE} [data-part='level']`)).toHaveText("64");
    expect(await writes(page)).toEqual([
      { deviceId: MAXWELL2_XBOX.id, param: "CAP_SIDETONE", value: { kind: "int", value: 64 } },
    ]);
  });

  test("rolls the value back and says so when the device refuses", async ({ page }) => {
    await boot(page);
    await page.locator(`${SIDETONE} input`).fill("64");
    await expect(page.locator(`${SIDETONE} [data-part='level']`)).toHaveText("64");

    await refuseWrites(page, "device is asleep");
    await page.locator(`${SIDETONE} input`).fill("120");

    const toast = page.locator("[data-part='toast']");
    await expect(toast).toContainText("CAP_SIDETONE");
    // The rejected value is gone from the screen, not left there looking applied.
    await expect(page.locator(`${SIDETONE} [data-part='level']`)).toHaveText("64");

    await toast.locator("[data-part='dismiss']").click();
    await expect(toast).toBeHidden();
  });

  test("writes an option row as a flag, not a number", async ({ page }) => {
    await boot(page);

    await page.locator("[data-capability='CAP_VOICE_PROMPTS']").getByRole("radio").first().click();

    expect(await writes(page)).toEqual([
      {
        deviceId: MAXWELL2_XBOX.id,
        param: "CAP_VOICE_PROMPTS",
        value: { kind: "bool", value: true },
      },
    ]);
  });
});

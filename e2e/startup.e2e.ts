import { expect, test } from "@playwright/test";

import { MAXWELL2_XBOX, boot } from "./support";

// The startup flow, end to end on a real build: what the backend answers decides
// which screen the user lands on (PROJECT.md §3.3).
test.describe("startup", () => {
  test("shows the connected headset and its capability rows", async ({ page }) => {
    await boot(page);

    await expect(page.getByRole("heading", { name: MAXWELL2_XBOX.name })).toBeVisible();
    await expect(page.locator("[data-part='battery']")).toHaveText("92%");
    // Every capability the device reports but the battery, which is a header.
    await expect(page.locator("[data-capability]")).toHaveCount(
      MAXWELL2_XBOX.capabilities.length - 1,
    );
  });

  test("says so when nothing is connected", async ({ page }) => {
    await boot(page, { devices: [] });

    await expect(page.getByText("No headset connected")).toBeVisible();
  });

  test("teaches the user how to install a missing binary, and recovers on retry", async ({
    page,
  }) => {
    await boot(page, { detection: { kind: "missing_binary" } });

    await expect(page.getByText("headsetcontrol not found")).toBeVisible();
    await expect(page.locator("[data-part='install-instructions']")).toContainText(
      "sudo apt install",
    );

    // The user installed it; the retry button re-runs the whole probe.
    await page.evaluate(() => {
      const mock = (
        window as unknown as Record<string, { scenario: { detection: unknown } } | undefined>
      ).__headsetDeckMock;
      if (!mock) {
        throw new Error("the mock backend is not on the page");
      }
      mock.scenario.detection = { kind: "ready" };
    });
    await page.getByRole("button", { name: "Check again" }).click();

    await expect(page.getByRole("heading", { name: MAXWELL2_XBOX.name })).toBeVisible();
  });

  test("names both versions when the binary is too old", async ({ page }) => {
    await boot(page, {
      detection: { kind: "bad_version", found: "3.1.0", required: "4.1.0" },
    });

    const screen = page.locator("[data-part='body']");
    await expect(screen).toContainText("3.1.0");
    await expect(screen).toContainText("4.1.0");
  });

  test("shows the udev rules when the headset cannot be opened", async ({ page }) => {
    await boot(page, { detection: { kind: "no_permissions" } });

    await expect(page.locator("[data-part='udev-rule']")).toContainText(
      "sudo tee /etc/udev/rules.d/70-headsets.rules",
    );
  });
});

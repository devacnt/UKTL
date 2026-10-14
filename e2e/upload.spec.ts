import { test, expect } from "./fixtures";

// Uploading needs a signed-in candidate (Supabase) and Cloudflare bindings, so the
// full flow runs only against a configured staging environment.
test.describe("CV upload", () => {
  test("signed-out visitors cannot reach the upload page", async ({ page }) => {
    await page.goto("/app/upload");
    await expect(page).toHaveURL(/\/auth\/login\?redirect=/);
    await expect(page.getByText(/drag a cv here/i)).toHaveCount(0);
  });

  test("the landing page sends new candidates to create an account", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("navigation").first().getByRole("link", { name: /register free/i }).click();
    await expect(page).toHaveURL(/\/auth\/register/);
  });
});

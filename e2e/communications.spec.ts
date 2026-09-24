import { test, expect } from "./fixtures";

test("communications pages enforce candidate and staff authentication", async ({ page }) => {
  await page.goto("/app/messages");
  await expect(page).toHaveURL(/\/auth\/login/);
  for (const path of ["/admin/campaigns", "/admin/calendar"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/admin\/login/);
  }
});
test("communications worker rejects unauthenticated requests", async ({ request }) => {
  const response = await request.post("/api/communications");
  expect([401, 503]).toContain(response.status()); // Unconfigured development fails closed.
  expect(await response.text()).not.toMatch(/refresh_token|to_email|recipient_user_id/);
});

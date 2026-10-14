import { test, expect } from "./fixtures";

test("signed-out footer offers one sign-up link and real destinations", async ({ page }) => {
  await page.goto("/");
  const footer = page.locator("footer");
  await expect(footer.getByRole("link", { name: "Register free" })).toHaveCount(1);
  await expect(footer.getByRole("link", { name: /create an account|sign up free/i })).toHaveCount(0);
  for (const href of await footer.locator("a[href^='/']").evaluateAll((as) => as.map((a) => a.getAttribute("href")!))) {
    const res = await page.request.get(href.split("#")[0]);
    expect(res.status(), href).toBeLessThan(400);
  }
});

for (const [path, title] of [["/privacy", "Your information"], ["/terms", "Using Talent Compass"]] as const) {
  test(`${path} has a clear header and contents list`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    const nav = page.getByRole("navigation", { name: "On this page" });
    await expect(nav.getByRole("link").first()).toBeVisible();
    const box = await page.getByRole("heading", { level: 1 }).boundingBox();
    expect(box!.y).toBeGreaterThan(80); // clear of the fixed site header
  });
}

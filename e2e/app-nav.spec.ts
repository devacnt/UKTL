import { test, expect } from "./fixtures";

test.describe("Public site and header", () => {
  test("landing page renders with the shared header", async ({ page }) => {
    await page.goto("/");
    await expect(page).not.toHaveTitle(/not found/i);
    const nav = page.getByRole("navigation").first();
    await expect(nav.getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(nav.getByRole("link", { name: /register free/i })).toBeVisible();
  });

  for (const path of ["/approach", "/services", "/sectors", "/reach", "/contact"]) {
    test(`${path} renders with the shared header`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("navigation").first().getByRole("link", { name: "Sign in" })).toBeVisible();
    });
  }

  test("sign-in pages use the same header", async ({ page }) => {
    await page.goto("/auth/login");
    const nav = page.getByRole("navigation").first();
    await expect(nav.getByRole("link", { name: "How it works" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });
});

test.describe("Candidate area requires sign-in", () => {
  for (const path of ["/app", "/app/upload", "/app/discover", "/app/profile", "/app/jobs", "/app/hr"]) {
    test(`${path} redirects signed-out visitors to sign in`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/auth\/login/);
      expect(new URL(page.url()).searchParams.get("redirect")).toContain(path);
    });
  }
});

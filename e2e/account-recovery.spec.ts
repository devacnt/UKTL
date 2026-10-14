import { test, expect } from "./fixtures";
import { MIN_PASSWORD_LENGTH } from "../src/lib/password-policy";
test("recovery offers password reset rather than sign-in only", async ({ page }) => {
  await page.goto("/auth/forgot");
  await expect(page.getByRole("heading", { name: "Reset password" })).toBeVisible();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByRole("button", { name: /send.*link/i })).toBeVisible();
});
test("reset cannot set a password without a verified session", async ({ page }) => {
  await page.goto("/auth/reset");
  await expect(page.getByRole("heading", { name: "Request a recovery link" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Update password" })).toHaveCount(0);
});
test("anonymous user cannot enroll a staff authenticator", async ({ page }) => {
  await page.goto("/auth/security");
  await expect(page).toHaveURL(/\/admin\/login/);
});
test("incomplete callback clears sensitive fragment and rejects link", async ({ page }) => {
  await page.goto("/auth/callback#access_token=invalid");
  await expect(page.getByRole("heading", { name: "That link didn't work" })).toBeVisible();
  await expect(page).not.toHaveURL(/access_token/);
});
test("sign-up form enforces the configured minimum password length", async ({ page }) => {
  await page.goto("/auth/register");
  const password = page.locator("#register-password");
  await expect(password).toHaveAttribute("minlength", String(MIN_PASSWORD_LENGTH));
  await expect(page.getByText(`(min ${MIN_PASSWORD_LENGTH} chars)`)).toBeVisible();
  await password.fill("Ab1".padEnd(MIN_PASSWORD_LENGTH, "x"));
  expect(await password.evaluate((el: HTMLInputElement) => el.validity.tooShort)).toBe(false);
});
test("Apple and Google sign-in always show, and a forged callback code signs nobody in", async ({ page }) => {
  for (const path of ["/auth/login", "/auth/register"]) {
    await page.goto(path);
    await expect(page.getByRole("button", { name: "Continue with Apple" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  }
  // Development has no Supabase Auth settings, so the button explains rather than failing.
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page.getByRole("status").filter({ hasText: /use your email/i })).toBeVisible();
  await page.goto("/auth/callback?code=forged-code-123456");
  await expect(page.getByText(/expired or was started in another browser|could not be completed|temporarily/i)).toBeVisible();
  await page.goto("/app");
  await expect(page).toHaveURL(/\/auth\/login/);
});

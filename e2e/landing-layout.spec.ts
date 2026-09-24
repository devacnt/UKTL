import { test, expect } from "./fixtures";

for (const width of [320, 390, 768, 1440]) {
  test(`landing headings remain readable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    for (const heading of await page.locator("main h1, main h2, main p").all()) {
      await heading.scrollIntoViewIfNeeded();
      await expect(heading).toBeVisible();
      const metrics = await heading.evaluate(el => {
        const rect = el.getBoundingClientRect();
        let visible = true;
        for (let node: Element | null = el; node; node = node.parentElement) {
          if (getComputedStyle(node).opacity === "0") visible = false;
        }
        return { left: rect.left, right: rect.right, width: window.innerWidth, visible, overflow: el.scrollWidth > el.clientWidth + 1 };
      });
      expect(metrics.visible).toBe(true);
      expect(metrics.left).toBeGreaterThanOrEqual(0);
      expect(metrics.right).toBeLessThanOrEqual(metrics.width);
      expect(metrics.overflow).toBe(false);
    }
  });
}

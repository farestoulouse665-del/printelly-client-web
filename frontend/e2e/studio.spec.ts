import { expect, test } from "@playwright/test";

const guest = {
  id: "guest-e2e",
  token: "guest-e2e.secret-e2e",
  expires_at: "2030-01-01T00:00:00Z",
  retention_days: 7,
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/sessions/guest")) {
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(guest) });
      return;
    }
    if (url.pathname.endsWith("/assets")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], total: 0 }),
      });
      return;
    }
    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "E2E stub" }) });
  });
});

test("the standalone studio exposes one complete background-removal facade", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Votre design mérite/i }),
  ).toBeVisible();
  await expect(page.getByText("TOUT DANS UNE SEULE FAÇADE", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Parcourir/i })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Images de cette session" })).toBeVisible();
  await expect(page.getByText(/Aucune inscription nécessaire/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /Se connecter/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Administration/i })).toHaveCount(0);
});

test("the legendary layout keeps readable desktop and mobile invariants", async ({ page }, testInfo) => {
  await page.goto("/");
  const hero = page.getByRole("heading", { name: /Votre design mérite/i });
  const box = await hero.boundingBox();
  const style = await hero.evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      fontSize: Number.parseFloat(computed.fontSize),
      lineHeight: Number.parseFloat(computed.lineHeight),
      color: computed.color,
    };
  });
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(250);
  expect(style.fontSize).toBeGreaterThan(testInfo.project.name.startsWith("mobile") ? 42 : 54);
  expect(style.lineHeight).toBeGreaterThan(style.fontSize * 0.85);
  expect(style.color).not.toBe("rgba(0, 0, 0, 0)");
  await testInfo.attach("transferlab-one-page", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});

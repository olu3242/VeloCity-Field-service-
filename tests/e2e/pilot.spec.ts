import { expect, test, type Page } from "@playwright/test";

const password = process.env.PILOT_PASSWORD;

const accounts = {
  customer: process.env.PILOT_CUSTOMER_EMAIL ?? "customer@velocity.test",
  provider: process.env.PILOT_PROVIDER_EMAIL ?? "provider@velocity.test",
  admin: process.env.PILOT_ADMIN_EMAIL ?? "tenantadmin@velocity.test",
} as const;

async function signIn(page: Page, email: string) {
  if (!password) throw new Error("PILOT_PASSWORD is required for pilot E2E tests.");
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test.describe("controlled pilot sequence", () => {
  test("anonymous users cannot enter protected portals", async ({ page }) => {
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test("customer books a service and receives an outcome", async ({ page }) => {
    await signIn(page, accounts.customer);
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto("/book?category=plumbing");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Job title").fill(`Pilot faucet ${Date.now()}`);
    await page.getByLabel("Description").fill("Controlled pilot booking used to certify the complete customer workflow.");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Street address").fill("123 Main St");
    await page.getByLabel("City").fill("Austin");
    await page.getByLabel("State").fill("TX");
    await page.getByLabel("ZIP code").fill("78701");
    await page.getByRole("button", { name: "Request Service" }).click();

    await expect(page).toHaveURL(/\/dashboard\/jobs\/[0-9a-f-]+\?booked=1/);
    await expect(page.getByRole("heading", { name: "Verified Service Outcome" })).toBeVisible();
  });

  test("provider reaches only the provider portal", async ({ page }) => {
    await signIn(page, accounts.provider);
    await expect(page).toHaveURL(/\/provider\/dashboard/);
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("tenant admin reaches operations and launch readiness", async ({ page }) => {
    await signIn(page, accounts.admin);
    await expect(page).toHaveURL(/\/admin\/dashboard/);
    await page.goto("/admin/launch-readiness");
    await expect(page.getByRole("heading", { name: /launch readiness/i })).toBeVisible();
  });
});

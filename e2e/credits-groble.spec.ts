import { expect, test } from "./fixtures/test";
import { createMeResponse } from "./fixtures/account";

test("그로블 결제창 왕복 후 서명 웹훅이 반영한 크레딧을 확인한다", async ({ page }) => {
  let balance = 0;
  let prepareBody: unknown = null;

  await page.route("**/api/credits/signup-bonus", (route) => route.fulfill({ status: 401, body: "{}" }));
  await page.route("**/api/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(createMeResponse([], balance)),
  }));
  await page.route("**/api/billing/checkout/prepare", async (route) => {
    prepareBody = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        paymentId: "90df4ea9-dd9f-4f5a-91cc-b4c09344f96a",
        checkoutUrl: "https://www.groble.im/payment/ptjv39?ref=90df4ea9-dd9f-4f5a-91cc-b4c09344f96a",
        amount: 5000,
        credits: 2,
      }),
    });
  });
  await page.route("https://www.groble.im/**", (route) => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: "<title>Groble test checkout</title>",
  }));

  await page.goto("/credits");
  await expect(page.getByText("결제 후 크레딧이 자동으로 반영됩니다. 결제는 그로블 결제창에서 진행됩니다.")).toBeVisible();
  await expect(page.getByLabel("결제 요청 휴대폰번호")).toHaveCount(0);
  await page.getByRole("button", { name: "5,000원 결제하기" }).click();

  await expect(page).toHaveURL(/groble\.im\/payment\/ptjv39\?ref=/);
  expect(prepareBody).toEqual({ productId: "credit-2" });
  await page.goBack();
  await expect(page).toHaveURL(/\/credits$/);
  await expect(page.getByRole("button", { name: "5,000원 결제하기" })).toBeEnabled();
  await expect(page.getByText("결제창에서 돌아왔습니다. 결제하지 않았다면 다시 시도해 주세요.")).toBeVisible();

  await page.route("**/api/billing/payments/status**", async (route) => {
    balance = 2;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        payment: {
          id: "90df4ea9-dd9f-4f5a-91cc-b4c09344f96a",
          status: "paid",
          refund_status: "none",
          amount: 5000,
          credits: 2,
          analytics_transaction_id: "groble-e2e-transaction",
        },
      }),
    });
  });

  await page.goto("/credits?billing=groble-return");
  await expect(page.getByText("크레딧 2개가 충전되었습니다.")).toBeVisible();
  await expect(page.getByText("2", { exact: true }).first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("talktheme:billing:groble:v1"))).toBeNull();
});

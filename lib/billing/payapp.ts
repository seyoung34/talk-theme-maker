import type { CreditProduct } from "@/lib/billing/products";
import type { BillingReturnTo } from "@/lib/billing/returnTo";
import { getSiteUrl, requirePayappServerConfig } from "@/lib/supabase/config";

const payappApiUrl = "https://api.payapp.kr/oapi/apiLoad.html";
const shopName = "KakaoTalk Theme Maker";

export type PayappRequestResult = {
  raw: Record<string, string>;
  providerPaymentId: string | null;
  checkoutUrl: string | null;
  receiptUrl: string | null;
};

export function normalizeKoreanPhone(value: string) {
  return value.replace(/[^\d]/g, "");
}

export function isValidKoreanPhone(value: string) {
  const normalized = normalizeKoreanPhone(value);
  return /^01\d{8,9}$/.test(normalized);
}

export async function createPayappCreditCheckout({
  paymentId,
  orderId,
  phone,
  product,
  returnTo,
}: {
  paymentId: string;
  orderId: string;
  phone: string;
  product: CreditProduct;
  returnTo?: BillingReturnTo;
}): Promise<PayappRequestResult> {
  const { payappUserId } = requirePayappServerConfig();
  const siteUrl = getSiteUrl();
  const returnUrl = new URL("/credits", siteUrl);
  returnUrl.searchParams.set("billing", "payapp-return");
  returnUrl.searchParams.set("paymentId", paymentId);
  if (returnTo) returnUrl.searchParams.set("returnTo", returnTo);
  const params = new URLSearchParams({
    cmd: "payrequest",
    userid: payappUserId, //페이앱 아이디
    shopname: shopName, //상점명
    goodname: product.name,  //상품명
    price: String(product.amount), //결제요청 금액
    recvphone: normalizeKoreanPhone(phone), //수신 휴대전화번호
    memo: `${product.credits} credits`,  //결제요청 메모
    reqaddr: "0", //주소요청
    feedbackurl: `${siteUrl}/api/billing/payapp/feedback`,  //결제요청 성공 URL방향
    returnurl: returnUrl.toString(), //결제완료 이동 URL
    var1: paymentId,  //임의 사용 변수 1
    var2: orderId,  //임의 사용 변수 2
    smsuse: "n",  //결제요청 문자 발송여부
    checkretry: "y",  //feedbackurl 재시도
    charset: "utf-8", //캐릭터셋(utf-8 이런..)
    redirectpay: "1", //결제창으로 리다이렉션
    skip_cstpage: "y",  //매출전표 페이지 이동
  });

  const response = await fetch(payappApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body: params.toString(),
  });
  const body = await response.text();
  const raw = parsePayappQueryResponse(body);

  if (!response.ok || raw.state !== "1") {
    const message = raw.errorMessage || raw.errormsg || raw.message || "PayApp payment request failed.";
    throw Object.assign(new Error(message), { raw });
  }

  const checkoutUrl = raw.payurl || raw.redirecturl || raw.url || null;
  if (!checkoutUrl) {
    throw Object.assign(new Error("PayApp checkout URL was not returned."), { raw });
  }

  return {
    raw,
    providerPaymentId: raw.mul_no || null,
    checkoutUrl,
    receiptUrl: raw.csturl || null,
  };
}

export function parsePayappQueryResponse(value: string) {
  const params = new URLSearchParams(value);
  const output: Record<string, string> = {};
  params.forEach((entryValue, key) => {
    output[key] = entryValue;
  });
  return output;
}

export function payappFormDataToRecord(formData: FormData) {
  const output: Record<string, string> = {};
  formData.forEach((value, key) => {
    output[key] = typeof value === "string" ? value : value.name;
  });
  return output;
}

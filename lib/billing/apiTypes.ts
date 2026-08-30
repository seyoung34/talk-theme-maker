export type AccountExportDto = {
  id: string;
  platform: string;
  export_mode: string;
  export_backend?: string;
  status: string;
  stage?: string;
  credit_cost: number;
  file_name?: string | null;
  export_number?: number | null;
  application_id?: string | null;
  theme_identifier?: string | null;
  export_name?: string | null;
  error?: string | null;
  error_code?: string | null;
  duration_ms?: number | null;
  created_at: string;
  /** 결과 파일 보관 기간(만료)을 계산하는 기준. `/api/me`가 이미 조회하고 있다. */
  completed_at?: string | null;
};

export type SignupBonusDto = {
  campaignKey: string;
  creditsGranted: number;
  claimedAt: string;
};

export type SignupBonusClaimResponse = {
  campaignKey?: string;
  creditsGranted?: number;
  balance?: number;
  alreadyClaimed?: boolean;
  granted?: boolean;
  reason?: string;
  error?: string;
};

export type SignupBonusCampaignDto = {
  campaignKey: string;
  name: string;
  credits: number;
  status: "active" | "inactive";
  startsAt: string;
  expiresAt: string | null;
  maxGrants: number | null;
  grantCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ExportDownloadLinkResponse = {
  downloadUrl?: string;
  fileName?: string;
  error?: string;
  reason?: string;
};

/** `credit_ledger.type`의 DB CHECK 제약과 같은 값이어야 한다. */
export type CreditLedgerType = "purchase" | "export" | "promotion" | "refund";

export type CreditLedgerEntryDto = {
  id: string;
  /** 양수는 지급, 음수는 차감. 화면 라벨은 `type`과 이 부호로 정한다. */
  amount: number;
  type: CreditLedgerType;
  created_at: string;
};

export type AccountMeResponse = {
  user: { id: string; email?: string } | null;
  profile?: { email?: string; display_name?: string | null; avatar_url?: string | null; provider?: string | null } | null;
  credits: number;
  billingHold?: boolean;
  signupBonus?: SignupBonusDto | null;
  isAdmin?: boolean;
  exports?: AccountExportDto[];
  /** 최근 크레딧 내역. 최신순이며 `creditLedgerFetchLimit`까지만 담는다. */
  ledger?: CreditLedgerEntryDto[];
  error?: string;
};

export type SessionResponse = {
  user: { email: string | null; displayName: string | null } | null;
  isAdmin: boolean;
  error?: string;
};

export type PaymentStatus = "pending" | "paid" | "failed" | "canceled";

export type BillingPrepareResponse = {
  paymentId?: string;
  checkoutUrl?: string;
  amount?: number;
  credits?: number;
  error?: string;
  reason?: string;
};

export type BillingPaymentStatusResponse = {
  payment?: {
    id: string;
    status: PaymentStatus;
    amount: number;
    credits: number;
    refund_status?: "none" | "requested" | "refunded" | "review_required";
    analytics_transaction_id?: string;
  };
  error?: string;
  reason?: string;
};

export type PayappPrepareResponse = {
  checkoutUrl?: string;
  error?: string;
  reason?: string;
};

export type PayappStatusResponse = {
  payment?: { id: string; status: PaymentStatus; amount: number; credits: number; analytics_transaction_id?: string };
  error?: string;
};

export type CreditCodeRedeemResponse = {
  creditsGranted?: number;
  balance?: number;
  error?: string;
};

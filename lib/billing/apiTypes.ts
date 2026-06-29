export type AccountExportDto = {
  id: string;
  platform: string;
  export_mode: string;
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
};

export type AccountMeResponse = {
  user: { id: string; email?: string } | null;
  profile?: { email?: string; display_name?: string | null; avatar_url?: string | null; provider?: string | null } | null;
  credits: number;
  isAdmin?: boolean;
  exports?: AccountExportDto[];
  error?: string;
};

export type SessionResponse = {
  user: { email: string | null; displayName: string | null } | null;
  isAdmin: boolean;
  error?: string;
};

export type PaymentStatus = "pending" | "paid" | "failed" | "canceled";

export type PayappPrepareResponse = {
  checkoutUrl?: string;
  error?: string;
  reason?: string;
};

export type PayappStatusResponse = {
  payment?: { id: string; status: PaymentStatus; amount: number; credits: number };
  error?: string;
};

export type CreditCodeRedeemResponse = {
  creditsGranted?: number;
  balance?: number;
  error?: string;
};

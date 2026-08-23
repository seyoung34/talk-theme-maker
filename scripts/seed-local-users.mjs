// 로컬 Supabase 스택에 QA용 계정을 만든다.
//
// `supabase db reset` 은 스키마만 되돌리므로 사용자는 매번 다시 만들어야 한다. 관리자 화면의
// API 라우트는 ADMIN_QA_BYPASS 를 거치지 않고 getCurrentAdmin() 으로 실제 admin_profiles 를
// 확인하므로, 우회 플래그만으로는 관리자 기능을 QA 할 수 없다.
//
//   node scripts/seed-local-users.mjs
//
// 로컬(127.0.0.1:54321) 외의 주소로는 동작하지 않는다. 운영 DB에 계정을 만드는 사고를 막는다.

const API = process.env.SUPABASE_LOCAL_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.SUPABASE_LOCAL_SERVICE_KEY
  ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(API)) {
  console.error(`로컬 주소가 아닙니다: ${API}`);
  process.exit(1);
}

const dbContainer = process.env.SUPABASE_LOCAL_DB_CONTAINER ?? "supabase_db_kakaotalk-theme-maker";
const password = "password123!";
const accounts = [
  { email: "admin@local.test", admin: true },
  { email: "user@local.test", admin: false },
];

const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };

/**
 * QA 계정에 얹어 두는 크레딧.
 *
 * 크레딧이 0이면 내보내기 창이 "크레딧 구매" 상태로 뜬다. 그 화면으로는 내보내기를 QA 할 수도,
 * 가이드 영상에 담을 수도 없다 — 스텝 7이 가르쳐야 할 것은 결제가 아니라 "이름 확인하고 만들면
 * 서버가 만들어 준다"이기 때문이다.
 *
 * 넉넉히 두는 이유는 촬영과 QA가 같은 계정을 반복해서 쓰기 때문이다. 로컬 전용이고 위 주소
 * 검사를 통과해야만 여기까지 온다.
 */
const seedCredits = 50;

async function grantCredits(userId, email) {
  const { execFileSync } = await import("node:child_process");
  // 잔액과 원장을 함께 넣는다. 잔액만 올리면 마이페이지 내역이 비어 실제와 다른 화면이 된다.
  // `type`은 `credit_ledger_type_check`가 purchase·export·promotion만 허용한다. 지급이므로 promotion이다.
  execFileSync("docker", [
    "exec", dbContainer, "psql", "-U", "postgres", "-d", "postgres", "-c",
    `insert into public.credit_balances (user_id, balance) values ('${userId}', ${seedCredits}) ` +
      `on conflict (user_id) do update set balance = greatest(public.credit_balances.balance, ${seedCredits}), updated_at = now();` +
      `insert into public.credit_ledger (user_id, amount, type, reason) ` +
      `select '${userId}', ${seedCredits}, 'promotion', '로컬 QA seed (${email})' ` +
      `where not exists (select 1 from public.credit_ledger where user_id = '${userId}' and reason like '로컬 QA seed%');`,
  ], { stdio: "pipe" });
}

async function findUser(email) {
  const res = await fetch(`${API}/auth/v1/admin/users?per_page=200`, { headers });
  if (!res.ok) throw new Error(`사용자 조회 실패: ${res.status} ${await res.text()}`);
  const payload = await res.json();
  return (payload.users ?? []).find((user) => user.email === email) ?? null;
}

for (const account of accounts) {
  let user = await findUser(account.email);
  if (!user) {
    const res = await fetch(`${API}/auth/v1/admin/users`, {
      method: "POST",
      headers,
      body: JSON.stringify({ email: account.email, password, email_confirm: true }),
    });
    if (!res.ok) throw new Error(`${account.email} 생성 실패: ${res.status} ${await res.text()}`);
    user = await res.json();
  }

  if (account.admin) {
    // psql 로 직접 넣는다. service_role 에는 admin_profiles INSERT 권한이 없고, 앱이 쓰지
    // 않는 권한을 QA 편의로 마이그레이션에 넣으면 운영에서도 관리자 등록이 열린다.
    const { execFileSync } = await import("node:child_process");
    execFileSync("docker", [
      "exec", dbContainer, "psql", "-U", "postgres", "-d", "postgres", "-c",
      `insert into public.admin_profiles (user_id, email, role) values ('${user.id}', '${account.email}', 'admin') on conflict (user_id) do nothing;`,
    ], { stdio: "pipe" });
  }

  await grantCredits(user.id, account.email);
  console.log(`${account.admin ? "관리자" : "일반"}  ${account.email}  ${user.id}  크레딧 ${seedCredits}`);
}

console.log(`\n비밀번호: ${password}`);

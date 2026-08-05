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

  console.log(`${account.admin ? "관리자" : "일반"}  ${account.email}  ${user.id}`);
}

console.log(`\n비밀번호: ${password}`);

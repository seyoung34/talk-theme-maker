-- 3트랙 에셋 저장소 §8.1 — 템플릿 preview의 R2 키를 서버에서 기록할 수 있게 한다.
--
-- `system_template_variants`는 지금까지 **관리자 브라우저가 자기 세션으로** 써 왔다. RLS의
-- `is_admin()`이 인가를 담당하고 grant는 `authenticated`에만 있어서, `service_role`은 이 표를 쓸
-- 일이 없었다(`202606180001` 106·109행).
--
-- 이제 preview 파생물의 R2 객체 키를 `preview_metadata.r2`에 기록해야 하는데, 그 일은 서버가 한다.
-- R2 쓰기는 Worker 바인딩으로만 가능하고 바인딩은 브라우저에 없기 때문이다. `createAdminClient()`로
-- 접근하면 grant 단계에서 `42501`로 막힌다 — RLS를 보기도 전이다.
--
-- **UPDATE만 준다.** INSERT/DELETE는 여전히 관리자 세션의 일이고, 서버가 variant를 새로 만들거나
-- 지울 이유가 없다. 권한은 실제로 필요한 동작에만 맞춘다.
--
-- SELECT도 함께 준다. 운영에서는 이미 통과하지만(실측 HTTP 200) 빈 DB를 `db reset`으로 복원하면
-- `service_role`에 SELECT가 없다 — 즉 마이그레이션 체인이 운영 상태를 재현하지 못하는 드리프트가
-- 있었다. 여기서 명시해 로컬과 운영이 같은 권한으로 수렴하게 한다.

grant select, update on public.system_template_variants to service_role;

comment on column public.system_template_variants.preview_metadata is
  'Card/screen preview refs. Legacy theme-public paths plus optional r2 object keys written server-side.';

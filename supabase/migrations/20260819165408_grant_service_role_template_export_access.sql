-- export Worker는 시스템 템플릿 upload_refs와 부모 bundle의 공개/소유권 상태를
-- service-role로 함께 확인한다. 브라우저 역할에는 권한을 추가하지 않는다.
grant select on public.system_template_bundles to service_role;

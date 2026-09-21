-- The inquiry write RPCs are also an authenticated public API. Keep the operational outbox write
-- inside those transactions so PostgREST clients that call the RPCs directly cannot bypass the
-- operator alert. The route-level schedule remains as a best-effort immediate drain; the
-- deterministic event id makes that second enqueue a harmless duplicate.

create or replace function public.create_inquiry(
  p_category text,
  p_title text,
  p_body text,
  p_export_job_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  actor uuid := auth.uid();
  recent_count integer;
  new_inquiry_id uuid;
begin
  if actor is null then raise exception 'unauthenticated'; end if;

  perform private.lock_account_writes(actor);

  if exists (select 1 from private.account_deletion_jobs where user_id = actor) then
    raise exception 'deletion_pending';
  end if;

  select count(*) into recent_count
  from public.inquiries
  where user_id = actor and created_at >= now() - interval '1 hour';
  if recent_count >= 10 then raise exception 'rate_limited'; end if;

  if p_export_job_id is not null and not exists (
    select 1 from public.export_jobs where id = p_export_job_id and user_id = actor
  ) then
    raise exception 'export_job_not_owned';
  end if;

  insert into public.inquiries (user_id, category, title, export_job_id)
  values (actor, p_category, p_title, p_export_job_id)
  returning id into new_inquiry_id;

  insert into public.inquiry_messages (inquiry_id, author, body)
  values (new_inquiry_id, 'user', p_body);

  perform public.enqueue_ops_event(
    format('inquiry.created:%s', new_inquiry_id),
    'inquiry.created',
    'P2',
    'admin',
    'inquiry',
    new_inquiry_id::text,
    jsonb_build_object(
      'summary', '새 문의가 접수되었습니다.',
      'details', jsonb_build_object(
        'inquiryId', new_inquiry_id::text,
        'category', p_category
      ),
      'adminPath', '/admin/inquiries/' || new_inquiry_id::text
    ),
    format('inquiry:created:%s', new_inquiry_id),
    now()
  );

  return new_inquiry_id;
end;
$$;

create or replace function public.add_inquiry_message(p_inquiry_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  actor uuid := auth.uid();
  target public.inquiries%rowtype;
  recent_count integer;
  new_message_id uuid;
begin
  if actor is null then raise exception 'unauthenticated'; end if;

  perform private.lock_account_writes(actor);

  if exists (select 1 from private.account_deletion_jobs where user_id = actor) then
    raise exception 'deletion_pending';
  end if;

  select * into target from public.inquiries where id = p_inquiry_id and user_id = actor;
  if not found then raise exception 'inquiry_not_found'; end if;
  if target.status = 'closed' then raise exception 'inquiry_closed'; end if;

  select count(*) into recent_count
  from public.inquiry_messages
  where inquiry_id = p_inquiry_id and author = 'user' and created_at >= now() - interval '1 minute';
  if recent_count >= 10 then raise exception 'rate_limited'; end if;

  insert into public.inquiry_messages (inquiry_id, author, body)
  values (p_inquiry_id, 'user', p_body)
  returning id into new_message_id;

  perform public.enqueue_ops_event(
    format('inquiry.user_replied:%s', new_message_id),
    'inquiry.user_replied',
    'P2',
    'admin',
    'inquiry',
    p_inquiry_id::text,
    jsonb_build_object(
      'summary', '문의에 사용자 답변이 추가되었습니다.',
      'details', jsonb_build_object(
        'inquiryId', p_inquiry_id::text,
        'messageId', new_message_id::text
      ),
      'adminPath', '/admin/inquiries/' || p_inquiry_id::text
    ),
    format('inquiry:user-replied:%s', new_message_id),
    now()
  );

  return new_message_id;
end;
$$;

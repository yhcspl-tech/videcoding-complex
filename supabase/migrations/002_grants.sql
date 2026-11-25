-- 새 Supabase 프로젝트는 테이블 권한이 자동으로 부여되지 않으므로 명시적으로 부여한다.
-- 브라우저(anon/authenticated)는 "읽기"만 가능, 어떤 행을 읽을지는 RLS 정책이 결정.
-- 쓰기는 create_order / mark_order_failed 함수와 Edge Function(service_role)만 한다.
grant usage on schema public to anon, authenticated, service_role;

grant select on public.products to anon, authenticated;
grant select on public.orders, public.order_items to authenticated;

grant all on public.products, public.orders, public.order_items to service_role;
grant usage, select on all sequences in schema public to service_role;

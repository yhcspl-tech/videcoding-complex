-- =========================================================
-- 굿즈샵 초기 스키마
-- products / orders / order_items + RLS + 주문 생성 함수
-- =========================================================

-- 관리자 여부: JWT의 app_metadata.role 이 'admin' 인지 확인
-- (app_metadata 는 서버/SQL 에서만 바꿀 수 있어 사용자가 위조 불가)
create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

-- ---------- 상품 ----------
create table public.products (
  id          bigint generated always as identity primary key,
  name        text    not null,
  description text    not null default '',
  price       integer not null check (price > 0),
  image_url   text    not null default '',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.products enable row level security;

create policy "누구나 판매중 상품 조회"
  on public.products for select
  to anon, authenticated
  using (is_active);

-- ---------- 주문 ----------
create table public.orders (
  id            uuid primary key default gen_random_uuid(),
  toss_order_id text not null unique,
  user_id       uuid not null references auth.users(id) on delete cascade,
  user_email    text not null,
  order_name    text not null,
  amount        integer not null check (amount > 0),
  status        text not null default 'PENDING'
                check (status in ('PENDING', 'PAID', 'FAILED')),
  payment_key   text,
  method        text,
  approved_at   timestamptz,
  fail_reason   text,
  created_at    timestamptz not null default now()
);

create index orders_user_id_idx    on public.orders (user_id);
create index orders_created_at_idx on public.orders (created_at desc);

alter table public.orders enable row level security;

create policy "본인 주문 또는 관리자 전체 조회"
  on public.orders for select
  to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()));

-- ---------- 주문 상품 ----------
create table public.order_items (
  id           bigint generated always as identity primary key,
  order_id     uuid    not null references public.orders(id) on delete cascade,
  product_id   bigint  references public.products(id) on delete set null,
  product_name text    not null,
  unit_price   integer not null,
  quantity     integer not null check (quantity > 0)
);

create index order_items_order_id_idx   on public.order_items (order_id);
create index order_items_product_id_idx on public.order_items (product_id);

alter table public.order_items enable row level security;

create policy "본인 주문상품 또는 관리자 전체 조회"
  on public.order_items for select
  to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and (o.user_id = (select auth.uid()) or (select public.is_admin()))
    )
  );

-- INSERT/UPDATE/DELETE 정책은 만들지 않는다 → 브라우저에서 직접 수정 불가.
-- 주문 생성은 create_order 함수, 결제 승인은 Edge Function(service role)만 가능.

-- ---------- 주문 생성 함수 ----------
-- items: [{"product_id": 1, "quantity": 2}, ...]
-- 금액은 DB 의 상품 가격으로 계산 (브라우저가 보낸 가격은 쓰지 않음)
create or replace function public.create_order(items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id    uuid := auth.uid();
  v_email      text := auth.jwt() ->> 'email';
  v_order_id   uuid;
  v_toss_id    text;
  v_total      integer := 0;
  v_count      integer := 0;
  v_first_name text;
  v_item       jsonb;
  v_qty        integer;
  v_product    public.products%rowtype;
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다';
  end if;

  if items is null or jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 then
    raise exception '장바구니가 비어 있습니다';
  end if;

  if jsonb_array_length(items) > 50 then
    raise exception '한 번에 주문할 수 있는 상품 종류는 50개까지입니다';
  end if;

  v_toss_id := 'ORD-' || to_char(now() at time zone 'Asia/Seoul', 'YYYYMMDDHH24MISS')
               || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);

  insert into public.orders (toss_order_id, user_id, user_email, order_name, amount)
  values (v_toss_id, v_user_id, coalesce(v_email, ''), '임시', 1)
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(items) loop
    v_qty := (v_item ->> 'quantity')::integer;
    if v_qty is null or v_qty < 1 or v_qty > 99 then
      raise exception '수량은 1~99 사이여야 합니다';
    end if;

    select * into v_product
    from public.products
    where id = (v_item ->> 'product_id')::bigint and is_active;

    if not found then
      raise exception '판매하지 않는 상품이 포함되어 있습니다 (id: %)', v_item ->> 'product_id';
    end if;

    insert into public.order_items (order_id, product_id, product_name, unit_price, quantity)
    values (v_order_id, v_product.id, v_product.name, v_product.price, v_qty);

    v_total := v_total + v_product.price * v_qty;
    v_count := v_count + 1;
    if v_first_name is null then
      v_first_name := v_product.name;
    end if;
  end loop;

  update public.orders
  set amount = v_total,
      order_name = case when v_count > 1
                        then v_first_name || ' 외 ' || (v_count - 1) || '건'
                        else v_first_name end
  where id = v_order_id;

  return jsonb_build_object(
    'order_id',      v_order_id,
    'toss_order_id', v_toss_id,
    'amount',        v_total,
    'order_name',    case when v_count > 1
                          then v_first_name || ' 외 ' || (v_count - 1) || '건'
                          else v_first_name end
  );
end;
$$;

-- ---------- 결제 실패/취소 표시 함수 ----------
-- 본인의 PENDING 주문만 FAILED 로 바꿀 수 있다
create or replace function public.mark_order_failed(p_toss_order_id text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.orders
  set status = 'FAILED',
      fail_reason = left(coalesce(p_reason, ''), 300)
  where toss_order_id = p_toss_order_id
    and user_id = auth.uid()
    and status = 'PENDING';
end;
$$;

-- 함수 실행 권한: 로그인 사용자만
revoke all on function public.create_order(jsonb) from public, anon;
revoke all on function public.mark_order_failed(text, text) from public, anon;
grant execute on function public.create_order(jsonb) to authenticated;
grant execute on function public.mark_order_failed(text, text) to authenticated;

-- ---------- 상품 시드 데이터 ----------
insert into public.products (name, description, price, image_url) values
  ('로고 스티커 팩',   '방수 비닐 스티커 6종 세트. 노트북, 텀블러 어디든 붙여보세요.', 4500,  'assets/products/sticker.svg'),
  ('머그컵',           '350ml 세라믹 머그컵. 전자레인지·식기세척기 사용 가능.',         12000, 'assets/products/mug.svg'),
  ('반팔 티셔츠',      '코튼 100% 오버핏 반팔 티셔츠. 프리사이즈.',                     25000, 'assets/products/tshirt.svg'),
  ('에코백',           '두꺼운 캔버스 원단 에코백. A4 서류와 노트북이 쏙.',             15000, 'assets/products/ecobag.svg'),
  ('아크릴 키링',      '양면 인쇄 아크릴 키링. 가방이나 열쇠에 달기 좋아요.',           6000,  'assets/products/keyring.svg'),
  ('스프링 노트',      'A5 도트 노트 100매. 두꺼운 종이라 뒷비침이 적어요.',            7000,  'assets/products/notebook.svg'),
  ('볼캡',             '자수 로고 볼캡. 뒷면 끈으로 사이즈 조절.',                       22000, 'assets/products/cap.svg'),
  ('핀 뱃지',          '금속 에나멜 핀 뱃지. 옷이나 가방에 포인트로.',                   5000,  'assets/products/pin.svg');

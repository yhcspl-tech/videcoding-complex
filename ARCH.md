# ARCH — 굿즈샵 세부 구조

프로젝트 개요와 작업 규칙은 [CLAUDE.md](CLAUDE.md) 참고.

## 1. 전체 구성

```
[브라우저: GitHub Pages 정적 파일]
   │  supabase-js (publishable key + 로그인 JWT)
   ├──────────────► Supabase Auth        회원가입/로그인 (이메일 인증 없음)
   ├──────────────► Supabase REST (PostgREST)
   │                 - products  읽기
   │                 - orders / order_items 읽기 (RLS)
   │                 - rpc/create_order, rpc/mark_order_failed
   ├──────────────► Edge Function confirm-payment ──► 토스 승인 API (시크릿 키)
   └──────────────► 토스페이먼츠 결제위젯 SDK (클라이언트 키)
```

## 2. 파일 구조

```
index.html  cart.html  login.html  checkout.html
success.html  fail.html  orders.html  admin.html
css/style.css                 전체 스타일 (모바일 760px 이하 대응)
js/config.js                  공개 설정값 (Supabase URL/키, 토스 클라이언트 키)
js/supabase.js                window.sb = Supabase 클라이언트
js/cart.js                    window.Cart = 장바구니(localStorage)
js/auth.js                    window.App = 로그인 상태, 헤더, 접근 제한, 표시 도우미
js/pages/<페이지>.js          각 페이지 전용 로직 (즉시실행 async 함수)
assets/products/*.svg         상품 이미지
supabase/migrations/*.sql     DB 스키마 (적용 순서대로 번호)
supabase/functions/confirm-payment/index.ts   결제 승인 Edge Function
```

### 스크립트 로드 순서 (모든 페이지 공통)
`supabase-js CDN → config.js → supabase.js → cart.js → auth.js → pages/<page>.js`
(checkout.html 은 맨 앞에 토스 SDK 추가). 앞의 파일이 만든 전역(`sb`, `Cart`, `App`)을 뒤에서 사용한다.

### 공통 모듈 API
- `App.getUser()` → 로그인 사용자 또는 null
- `App.isAdmin(user)` → `user.app_metadata.role === 'admin'`
- `App.requireLogin()` → 비로그인 시 `login.html?next=<현재페이지>` 로 이동
- `App.requireAdmin()` → 관리자 아니면 "접근 권한 없음" 표시
- `App.won(n)`, `App.formatDate(iso)`, `App.escapeHtml(s)`, `App.statusBadge(status)`, `App.toast(msg)`
- `Cart.read/add/setQuantity/remove/clear/sync/count/total` — 변경 시 `cart:changed` 이벤트 발생 → 헤더 배지 갱신

## 3. 데이터베이스

### products
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | bigint identity PK | |
| name, description | text | |
| price | integer (>0) | 원 단위 |
| image_url | text | 상대경로 (`assets/products/...`) |
| is_active | boolean | false 면 목록/주문에서 제외 |

### orders
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid PK | 내부 ID |
| toss_order_id | text unique | 토스에 넘기는 orderId (`ORD-YYYYMMDDHHMMSS-xxxxxxxxxx`) |
| user_id | uuid → auth.users | |
| user_email | text | 관리자 화면 표시용 |
| order_name | text | "머그컵 외 1건" |
| amount | integer | 서버 계산 금액 |
| status | `PENDING` / `PAID` / `FAILED` | |
| payment_key, method, approved_at | | 승인 성공 시 채움 |
| fail_reason | text | 실패 사유 |

### order_items
`order_id → orders.id`, `product_id → products.id (set null)`, 주문 시점의 `product_name`, `unit_price`, `quantity` 를 복사 저장 (상품 가격이 바뀌어도 내역 유지).

### 권한 (RLS + GRANT)
| 대상 | anon | authenticated (일반) | authenticated (관리자) | service_role |
|---|---|---|---|---|
| products | 판매중 SELECT | 판매중 SELECT | 판매중 SELECT | 전체 |
| orders | ✕ | 본인 것 SELECT | 전체 SELECT | 전체 |
| order_items | ✕ | 본인 주문 것 SELECT | 전체 SELECT | 전체 |
| INSERT/UPDATE/DELETE | ✕ | ✕ (함수로만) | ✕ (함수로만) | ✓ |

- 관리자 판별: `public.is_admin()` = `auth.jwt()->'app_metadata'->>'role' = 'admin'`

### DB 함수 (RPC, SECURITY DEFINER, authenticated 만 실행 가능)
- `create_order(items jsonb)` — `[{product_id, quantity}]` 받아서 검증(수량 1~99, 판매중 상품, 최대 50종) → orders(PENDING) + order_items 생성 → `{order_id, toss_order_id, amount, order_name}` 반환
- `mark_order_failed(p_toss_order_id, p_reason)` — 본인의 PENDING 주문만 FAILED 로

## 4. 결제 흐름

```
cart.html
  └ [주문하기] → rpc create_order → toss_order_id 받음
checkout.html?orderId=ORD-...
  ├ DB에서 주문 조회 (본인 + PENDING 확인, 금액은 DB 값)
  ├ TossPayments(clientKey).widgets({customerKey: user.id})
  ├ setAmount → renderPaymentMethods(#payment-method) + renderAgreement(#agreement)
  └ [결제하기] → widgets.requestPayment({orderId, orderName, successUrl, failUrl, customerEmail})
        │
        ├ 성공 → success.html?paymentKey&orderId&amount
        │     └ sb.functions.invoke('confirm-payment', {paymentKey, orderId, amount})
        │           Edge Function:
        │           1. Authorization JWT → auth.getUser() 로 사용자 확인
        │           2. orders 조회: 본인 주문? PENDING? amount 일치? (불일치면 FAILED)
        │           3. POST https://api.tosspayments.com/v1/payments/confirm
        │              (Basic base64(TOSS_SECRET_KEY + ':'), Idempotency-Key = orderId)
        │           4. 성공 → PAID + payment_key/method/approved_at, 실패 → FAILED + 사유
        │     └ 성공 시 장바구니 비우고 주소창에서 paymentKey 제거
        │
        └ 실패/취소 → fail.html?code&message&orderId
              └ rpc mark_order_failed (장바구니는 유지 → 다시 주문 가능)
```
- 결제창을 그냥 닫으면(USER_CANCEL) 페이지 이동 없이 토스트만 표시, 주문은 PENDING 유지 → 같은 주문으로 다시 결제 가능.
- successUrl/failUrl 은 `new URL('success.html', location.href)` 로 만들어 로컬·배포 어디서든 동작.

## 5. Supabase 설정 값
- Auth: `mailer_autoconfirm = true` (이메일 인증 끔), 비밀번호 최소 6자
- Site URL: `https://yhcspl-tech.github.io/videcoding-complex/`
- Redirect 허용: `https://yhcspl-tech.github.io/videcoding-complex/**`, `http://localhost:8000/**`
- Edge Function `confirm-payment`: verify_jwt = false (프로젝트가 비대칭 JWT 서명키를 쓰므로 함수 안에서 `auth.getUser(token)` 으로 직접 검증)
- Edge Function secret: `TOSS_SECRET_KEY`

## 6. 마이그레이션 목록
| 파일 | 내용 |
|---|---|
| `001_init.sql` | is_admin, products/orders/order_items, RLS 정책, create_order, mark_order_failed, 상품 8종 시드 |
| `002_grants.sql` | anon/authenticated 읽기 권한, service_role 전체 권한 |

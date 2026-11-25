# 굿즈샵 (videcoding-complex)

굿즈를 판매하는 작은 쇼핑몰. 회원가입/로그인 → 상품 장바구니 → 토스페이먼츠(테스트 모드) 결제 → 결제내역 확인, 관리자는 전체 결제내역 조회.
세부 구조(파일, DB 스키마, 결제 흐름)는 [ARCH.md](ARCH.md) 참고.

## 주소
- 사이트: https://yhcspl-tech.github.io/videcoding-complex/
- GitHub: https://github.com/yhcspl-tech/videcoding-complex (public, `main` 브랜치 루트가 그대로 Pages로 배포)
- Supabase 프로젝트 ref: `onuagtqsyjxekwhhjcub` (https://onuagtqsyjxekwhhjcub.supabase.co)

## 기술 스택
- 프론트: 순수 HTML / CSS / JavaScript (빌드 도구 없음, 프레임워크 없음). `<script>` 태그로 순서대로 로드.
- 백엔드: Supabase (Auth + Postgres + RLS + Edge Function 1개)
- 결제: 토스페이먼츠 결제위젯 v2, **테스트 모드** (`https://js.tosspayments.com/v2/standard`)
- 라이브러리: supabase-js v2 (jsDelivr CDN)

## 페이지
| 파일 | 역할 | 접근 |
|---|---|---|
| `index.html` | 상품 목록, 장바구니 담기 | 누구나 |
| `cart.html` | 장바구니 수정, 주문 생성 | 누구나 (주문은 로그인 필요) |
| `login.html` | 로그인 / 회원가입 탭 | 누구나 |
| `checkout.html` | 토스 결제위젯 | 로그인 |
| `success.html` / `fail.html` | 토스 결제 결과 처리 | 로그인 |
| `orders.html` | 내 결제내역 | 로그인 |
| `admin.html` | 전체 회원 결제내역 + 통계 | 관리자 |

## 계정
- 관리자: `admin@admin.com` / `superadmin` — `auth.users.raw_app_meta_data.role = 'admin'` 으로 지정됨.
  관리자를 추가하려면 SQL: `update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}' where email = '...';` (해당 사용자는 다시 로그인해야 반영)
- 회원가입 시 **이메일 인증 없음** (Supabase Auth 설정 `mailer_autoconfirm = true`).

## 키 위치
- 공개 키(브라우저용): `js/config.js` — Supabase URL, publishable key, 토스 클라이언트 키
- 비밀 키: 토스 시크릿 키는 Supabase Edge Function secret `TOSS_SECRET_KEY` 에만 저장. **코드/깃에 절대 넣지 않는다.**
- 현재 토스 키는 공식 문서용 공개 테스트 키(`test_gck_docs_...` / `test_gsk_docs_...`). 본인 키로 바꿀 때는 두 곳(`js/config.js`, Edge Function secret)을 같이 바꾼다.

## 핵심 규칙 (수정 시 지킬 것)
1. **결제 금액은 서버가 결정한다.** 주문 금액은 `create_order` DB 함수가 `products.price` 로 계산하고, `confirm-payment` Edge Function 이 토스 승인 전에 DB 금액과 대조한다. 브라우저에서 받은 가격을 믿지 않는다.
2. **브라우저는 DB를 읽기만 한다.** orders/order_items 에 INSERT/UPDATE 정책이 없음. 쓰기는 `create_order`, `mark_order_failed` 함수와 Edge Function(service role)만.
3. **보안은 RLS가 담당한다.** 화면의 `requireAdmin()` 은 편의용. 관리자 판별은 JWT `app_metadata.role` (사용자가 못 바꿈).
4. 새 테이블을 만들면 RLS 활성화 + 필요한 `grant` 를 명시한다 (이 프로젝트는 테이블 권한이 자동 부여되지 않음).
5. 모든 링크/리소스는 상대경로(`css/...`, `js/...`) — Pages가 `/videcoding-complex/` 하위 경로이기 때문.
6. 사용자 입력/DB 값을 HTML에 넣을 땐 `App.escapeHtml()` 사용.

## 배포 / 작업 방법
- 프론트 배포: `main` 브랜치에 push 하면 GitHub Pages 가 1~2분 내 자동 반영.
- DB 변경: `supabase/migrations/` 에 SQL 파일 추가 후 Supabase MCP `apply_migration` 으로 적용.
- Edge Function 변경: `supabase/functions/confirm-payment/index.ts` 수정 후 MCP `deploy_edge_function` (verify_jwt=false, 함수 안에서 직접 로그인 검증).
- 로컬 확인: 아무 정적 서버로 루트 폴더를 열면 됨 (예: `http://localhost:8000/`). Auth Redirect 허용 목록에 `http://localhost:8000/**` 등록되어 있음.

## 테스트 결제
- 토스 테스트 모드라 실제 돈이 나가지 않음. 결제창에서 카드사/간편결제의 테스트 화면이 뜨며 일부는 휴대폰 인증 화면을 거친다.
- 결과는 `orders.status` (`PENDING` → `PAID` / `FAILED`) 로 확인.

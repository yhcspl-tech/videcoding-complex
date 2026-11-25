// 사이트 설정값을 한 곳에 모아둔 파일
// - 여기 있는 키는 모두 "공개해도 되는" 키입니다 (브라우저에 노출되는 용도).
// - 토스 시크릿 키는 절대 여기에 넣지 않습니다 → Supabase Edge Function secret(TOSS_SECRET_KEY)에 있음.
window.APP_CONFIG = {
  SUPABASE_URL: "https://onuagtqsyjxekwhhjcub.supabase.co",
  SUPABASE_KEY: "sb_publishable_MRNQgmv28VXA-o32fmIexQ_4exzsRzR",

  // 토스페이먼츠 결제위젯 테스트 클라이언트 키 (공식 문서 공개 키)
  // 본인 키로 바꾸려면: 토스 개발자센터 > API 키 > 결제위젯 연동 키 > 클라이언트 키
  TOSS_CLIENT_KEY: "test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm",

  SHOP_NAME: "굿즈샵",
};

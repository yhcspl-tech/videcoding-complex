// Supabase 클라이언트 생성 (supabase-js 는 HTML 에서 CDN 으로 먼저 불러옴)
window.sb = window.supabase.createClient(
  window.APP_CONFIG.SUPABASE_URL,
  window.APP_CONFIG.SUPABASE_KEY
);

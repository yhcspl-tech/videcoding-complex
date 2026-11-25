// 토스페이먼츠 결제 승인 Edge Function
// 브라우저(success.html)가 { paymentKey, orderId, amount } 를 보내면
// 1) 로그인 사용자 확인  2) DB 주문과 금액·소유자·상태 대조
// 3) 토스 승인 API 호출  4) 주문 상태 PAID / FAILED 로 갱신
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, message: "POST만 허용됩니다" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const tossSecret = Deno.env.get("TOSS_SECRET_KEY");
  if (!tossSecret) return json({ ok: false, message: "서버 설정 오류: TOSS_SECRET_KEY 없음" }, 500);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // 1) 로그인 사용자 확인 (JWT 를 Supabase Auth 로 검증)
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData?.user) return json({ ok: false, message: "로그인이 필요합니다" }, 401);
  const user = userData.user;

  // 2) 입력값 확인
  let body: { paymentKey?: string; orderId?: string; amount?: number | string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, message: "잘못된 요청입니다" }, 400);
  }
  const paymentKey = String(body.paymentKey ?? "");
  const orderId = String(body.orderId ?? "");
  const amount = Number(body.amount);
  if (!paymentKey || !orderId || !Number.isInteger(amount)) {
    return json({ ok: false, message: "결제 정보가 올바르지 않습니다" }, 400);
  }

  // 3) 주문 대조
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, user_id, amount, status, order_name")
    .eq("toss_order_id", orderId)
    .maybeSingle();

  if (orderError) return json({ ok: false, message: "주문 조회 실패" }, 500);
  if (!order || order.user_id !== user.id) return json({ ok: false, message: "주문을 찾을 수 없습니다" }, 404);
  if (order.status === "PAID") return json({ ok: true, alreadyPaid: true, orderName: order.order_name, amount: order.amount });
  if (order.status !== "PENDING") return json({ ok: false, message: "이미 실패 처리된 주문입니다" }, 409);
  if (order.amount !== amount) {
    // 금액이 다르면 위변조로 보고 승인하지 않는다
    await admin.from("orders").update({ status: "FAILED", fail_reason: "결제 금액 불일치" }).eq("id", order.id);
    return json({ ok: false, message: "결제 금액이 주문 금액과 다릅니다" }, 400);
  }

  // 4) 토스 승인 API 호출
  const tossRes = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(tossSecret + ":"),
      "Content-Type": "application/json",
      "Idempotency-Key": orderId, // 같은 주문을 두 번 승인하지 않도록
    },
    body: JSON.stringify({ paymentKey, orderId, amount }),
  });
  const toss = await tossRes.json().catch(() => ({}));

  if (!tossRes.ok) {
    await admin
      .from("orders")
      .update({ status: "FAILED", fail_reason: `${toss.code ?? "ERROR"}: ${toss.message ?? ""}`.slice(0, 300) })
      .eq("id", order.id)
      .eq("status", "PENDING");
    return json({ ok: false, code: toss.code, message: toss.message ?? "결제 승인 실패" }, 400);
  }

  await admin
    .from("orders")
    .update({
      status: "PAID",
      payment_key: toss.paymentKey ?? paymentKey,
      method: toss.method ?? null,
      approved_at: toss.approvedAt ?? new Date().toISOString(),
    })
    .eq("id", order.id);

  return json({
    ok: true,
    orderName: order.order_name,
    amount: order.amount,
    method: toss.method ?? null,
    approvedAt: toss.approvedAt ?? null,
  });
});

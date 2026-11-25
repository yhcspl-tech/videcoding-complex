// 결제 실패/취소 페이지: 토스가 code, message, orderId 를 붙여서 보내줌
(async function () {
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  const message = params.get("message");
  const orderId = params.get("orderId");

  if (message) document.getElementById("fail-message").textContent = message;
  if (code) document.getElementById("fail-code").textContent = "오류 코드: " + code;

  // 주문을 '결제실패'로 표시 (본인 결제대기 주문만 바뀜). 장바구니는 그대로 둔다.
  const user = await App.getUser();
  if (user && orderId) {
    await sb.rpc("mark_order_failed", {
      p_toss_order_id: orderId,
      p_reason: [code, message].filter(Boolean).join(": "),
    });
  }
})();

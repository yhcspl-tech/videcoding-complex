// 결제 성공 페이지: 토스가 보낸 paymentKey/orderId/amount 로 서버(Edge Function)에 최종 승인 요청
(async function () {
  await App.requireLogin();
  const box = document.getElementById("result");
  const params = new URLSearchParams(location.search);
  const paymentKey = params.get("paymentKey");
  const orderId = params.get("orderId");
  const amount = Number(params.get("amount"));

  function fail(message) {
    box.innerHTML = `
      <div class="result-icon">⚠️</div>
      <h1>결제 승인에 실패했어요</h1>
      <p class="sub">${App.escapeHtml(message)}</p>
      <div class="result-actions">
        <a class="btn" href="cart.html">장바구니로</a>
        <a class="btn btn-outline" href="orders.html">결제내역 보기</a>
      </div>`;
  }

  if (!paymentKey || !orderId || !amount) return fail("결제 정보가 올바르지 않습니다.");

  const { data, error } = await sb.functions.invoke("confirm-payment", {
    body: { paymentKey, orderId, amount },
  });

  if (error) {
    // Edge Function 이 보낸 에러 메시지 꺼내기
    let message = error.message;
    try {
      const body = await error.context.json();
      if (body && body.message) message = body.message;
    } catch {}
    return fail(message);
  }
  if (!data || !data.ok) return fail((data && data.message) || "알 수 없는 오류");

  // 결제 완료 → 장바구니 비우기, 주소창에서 결제키 제거 (새로고침 시 재승인 방지)
  Cart.clear();
  history.replaceState(null, "", "success.html?orderId=" + encodeURIComponent(orderId));

  box.innerHTML = `
    <div class="result-icon">🎉</div>
    <h1>결제가 완료되었어요</h1>
    <p class="sub">주문해 주셔서 감사합니다.</p>
    <table class="result-table">
      <tr><th>주문명</th><td>${App.escapeHtml(data.orderName)}</td></tr>
      <tr><th>주문번호</th><td>${App.escapeHtml(orderId)}</td></tr>
      <tr><th>결제금액</th><td><b>${App.won(data.amount)}</b></td></tr>
      <tr><th>결제수단</th><td>${App.escapeHtml(data.method || "-")}</td></tr>
      <tr><th>승인시각</th><td>${App.formatDate(data.approvedAt)}</td></tr>
    </table>
    <div class="result-actions">
      <a class="btn" href="orders.html">내 결제내역 보기</a>
      <a class="btn btn-outline" href="index.html">쇼핑 계속하기</a>
    </div>`;
})();

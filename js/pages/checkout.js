// 결제 페이지: 토스페이먼츠 결제위젯 v2
(async function () {
  const user = await App.requireLogin();

  const loadingEl = document.getElementById("checkout-loading");
  const errorEl = document.getElementById("checkout-error");
  const contentEl = document.getElementById("checkout-content");
  const payBtn = document.getElementById("pay-btn");

  function showError(message) {
    loadingEl.classList.add("hidden");
    errorEl.innerHTML = message + ' <a href="cart.html">장바구니로 돌아가기</a>';
    errorEl.classList.remove("hidden");
  }

  // 1) 주문 정보는 주소창이 아니라 DB 에서 가져온다 (금액 위조 방지)
  const orderId = new URLSearchParams(location.search).get("orderId");
  if (!orderId) return showError("주문 정보가 없습니다.");

  const { data: order, error } = await sb
    .from("orders")
    .select("toss_order_id, order_name, amount, status")
    .eq("toss_order_id", orderId)
    .maybeSingle();

  if (error || !order) return showError("주문을 찾을 수 없습니다.");
  if (order.status === "PAID") return showError("이미 결제가 완료된 주문입니다.");
  if (order.status !== "PENDING") return showError("결제할 수 없는 주문입니다. 다시 주문해 주세요.");

  document.getElementById("order-name").textContent = order.order_name;
  document.getElementById("order-id").textContent = "주문번호 " + order.toss_order_id;
  document.getElementById("order-amount").textContent = App.won(order.amount);

  loadingEl.classList.add("hidden");
  contentEl.classList.remove("hidden");

  // 2) 결제위젯 그리기
  try {
    const tossPayments = TossPayments(APP_CONFIG.TOSS_CLIENT_KEY);
    const widgets = tossPayments.widgets({ customerKey: user.id });

    await widgets.setAmount({ currency: "KRW", value: order.amount });
    await Promise.all([
      widgets.renderPaymentMethods({ selector: "#payment-method", variantKey: "DEFAULT" }),
      widgets.renderAgreement({ selector: "#agreement", variantKey: "AGREEMENT" }),
    ]);
    payBtn.disabled = false;

    // 3) 결제 요청 → 성공하면 success.html, 실패/취소하면 fail.html 로 이동
    payBtn.addEventListener("click", async () => {
      try {
        await widgets.requestPayment({
          orderId: order.toss_order_id,
          orderName: order.order_name,
          successUrl: new URL("success.html", location.href).href,
          failUrl: new URL("fail.html", location.href).href,
          customerEmail: user.email,
        });
      } catch (err) {
        // 결제창을 사용자가 닫은 경우 등 (페이지 이동 없이 에러로 옴)
        if (err && err.code === "USER_CANCEL") {
          App.toast("결제를 취소했어요");
        } else {
          App.toast((err && err.message) || "결제 요청 중 오류가 발생했어요");
        }
      }
    });
  } catch (err) {
    contentEl.classList.add("hidden");
    showError("결제위젯을 불러오지 못했습니다: " + App.escapeHtml((err && err.message) || String(err)));
  }
})();

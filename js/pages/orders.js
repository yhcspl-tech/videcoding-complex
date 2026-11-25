// 내 결제내역 페이지
// RLS(행 단위 보안) 덕분에 select 하면 "내 주문"만 돌아온다.
// 단, 관리자 계정은 RLS 상 전체가 보이므로 user_id 로 한 번 더 걸러준다.
(async function () {
  const user = await App.requireLogin();
  const listEl = document.getElementById("order-list");
  const filterEl = document.getElementById("status-filter");

  const { data: orders, error } = await sb
    .from("orders")
    .select("toss_order_id, order_name, amount, status, method, approved_at, created_at, order_items(product_name, unit_price, quantity)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    listEl.innerHTML = `<p class="msg msg-error">결제내역을 불러오지 못했습니다: ${App.escapeHtml(error.message)}</p>`;
    return;
  }

  function render() {
    const filter = filterEl.value;
    const rows = filter === "ALL" ? orders : orders.filter((o) => o.status === filter);

    if (!rows.length) {
      listEl.innerHTML = `
        <div class="empty card">
          <h2>${filter === "ALL" ? "주문 내역이 없어요" : "결제 완료된 내역이 없어요"}</h2>
          <p>마음에 드는 굿즈를 골라보세요.</p>
          <a class="btn" href="index.html">상품 보러 가기</a>
        </div>`;
      return;
    }

    listEl.innerHTML = rows
      .map(
        (o) => `
        <div class="card order-card">
          <div class="order-head">
            <div>
              <p class="title">${App.escapeHtml(o.order_name)} ${App.statusBadge(o.status)}</p>
              <p class="meta">${[App.formatDate(o.approved_at || o.created_at), o.method, o.toss_order_id]
                .filter(Boolean)
                .map(App.escapeHtml)
                .join(" · ")}</p>
            </div>
            <div class="amount">${App.won(o.amount)}</div>
          </div>
          <ul class="order-items">
            ${o.order_items
              .map(
                (i) => `<li><span>${App.escapeHtml(i.product_name)} × ${i.quantity}</span><span>${App.won(i.unit_price * i.quantity)}</span></li>`
              )
              .join("")}
          </ul>
        </div>`
      )
      .join("");
  }

  filterEl.addEventListener("change", render);
  render();
})();

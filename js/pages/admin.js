// 관리자 페이지: 모든 회원의 결제내역
// 화면 차단(requireAdmin)은 편의용이고, 실제 보안은 DB RLS 가 담당한다.
// (관리자가 아니면 select 해도 본인 주문만 돌아옴)
(async function () {
  await App.requireAdmin();

  const content = document.getElementById("admin-content");
  const loading = document.getElementById("admin-loading");
  const rowsEl = document.getElementById("order-rows");
  const searchEl = document.getElementById("search");
  const filterEl = document.getElementById("status-filter");
  const countEl = document.getElementById("row-count");
  let orders = [];

  async function load() {
    loading.classList.remove("hidden");
    const { data, error } = await sb
      .from("orders")
      .select("toss_order_id, user_email, order_name, amount, status, method, approved_at, created_at, fail_reason, order_items(product_name, quantity)")
      .order("created_at", { ascending: false })
      .limit(1000);
    loading.classList.add("hidden");

    if (error) {
      content.classList.add("hidden");
      loading.textContent = "불러오지 못했습니다: " + error.message;
      loading.classList.remove("hidden");
      return;
    }
    orders = data;
    content.classList.remove("hidden");
    renderStats();
    render();
  }

  function renderStats() {
    const paid = orders.filter((o) => o.status === "PAID");
    document.getElementById("stat-revenue").textContent = App.won(paid.reduce((s, o) => s + o.amount, 0));
    document.getElementById("stat-paid").textContent = paid.length.toLocaleString("ko-KR") + "건";
    document.getElementById("stat-total").textContent = orders.length.toLocaleString("ko-KR") + "건";
    document.getElementById("stat-buyers").textContent =
      new Set(paid.map((o) => o.user_email)).size.toLocaleString("ko-KR") + "명";
  }

  function render() {
    const q = searchEl.value.trim().toLowerCase();
    const status = filterEl.value;
    const rows = orders.filter((o) => {
      if (status !== "ALL" && o.status !== status) return false;
      if (!q) return true;
      return [o.user_email, o.order_name, o.toss_order_id].some((v) => (v || "").toLowerCase().includes(q));
    });

    rowsEl.innerHTML = rows.length
      ? rows
          .map(
            (o) => `
          <tr>
            <td class="nowrap">${App.formatDate(o.approved_at || o.created_at)}</td>
            <td>${App.escapeHtml(o.user_email)}</td>
            <td>
              ${App.escapeHtml(o.order_name)}
              <div class="items">${o.order_items.map((i) => `${App.escapeHtml(i.product_name)}×${i.quantity}`).join(", ")}</div>
              <div class="mono">${App.escapeHtml(o.toss_order_id)}</div>
              ${o.status === "FAILED" && o.fail_reason ? `<div class="items">사유: ${App.escapeHtml(o.fail_reason)}</div>` : ""}
            </td>
            <td>${App.escapeHtml(o.method || "-")}</td>
            <td>${App.statusBadge(o.status)}</td>
            <td class="num">${App.won(o.amount)}</td>
          </tr>`
          )
          .join("")
      : `<tr><td colspan="6" class="empty">조건에 맞는 주문이 없습니다.</td></tr>`;

    countEl.textContent = `${rows.length.toLocaleString("ko-KR")}건 표시 (전체 ${orders.length.toLocaleString("ko-KR")}건)`;
  }

  searchEl.addEventListener("input", render);
  filterEl.addEventListener("change", render);
  document.getElementById("refresh-btn").addEventListener("click", load);

  await load();
})();

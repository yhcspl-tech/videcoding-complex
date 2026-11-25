// 공통 기능: 로그인 상태, 헤더(메뉴) 그리기, 페이지 접근 제한, 표시용 도우미 함수
window.App = (function () {
  const sb = window.sb;

  // ---------- 로그인 상태 ----------
  async function getUser() {
    const { data } = await sb.auth.getSession();
    return data.session ? data.session.user : null;
  }

  function isAdmin(user) {
    return !!user && user.app_metadata && user.app_metadata.role === "admin";
  }

  // 로그인 안 했으면 로그인 페이지로 (돌아올 주소를 next 로 넘김)
  async function requireLogin() {
    const user = await getUser();
    if (!user) {
      const next = location.pathname.split("/").pop() + location.search;
      location.replace("login.html?next=" + encodeURIComponent(next || "index.html"));
      return new Promise(() => {}); // 이동하는 동안 이후 코드가 실행되지 않게 멈춤
    }
    return user;
  }

  // 관리자만 통과
  async function requireAdmin() {
    const user = await requireLogin();
    if (!isAdmin(user)) {
      document.querySelector("main").innerHTML =
        '<div class="empty"><h2>접근 권한이 없습니다</h2><p>관리자 계정으로 로그인해 주세요.</p>' +
        '<a class="btn" href="index.html">상품 보러 가기</a></div>';
      return new Promise(() => {});
    }
    return user;
  }

  async function logout() {
    await sb.auth.signOut();
    Cart.clear(); // 같은 브라우저를 쓰는 다음 사람에게 장바구니가 남지 않도록
    location.href = "index.html";
  }

  // ---------- 헤더 ----------
  async function renderHeader() {
    const el = document.getElementById("site-header");
    if (!el) return;
    const user = await getUser();
    const page = location.pathname.split("/").pop() || "index.html";
    const link = (href, label, extra = "") =>
      `<a href="${href}" class="${page === href ? "active" : ""}" ${extra}>${label}</a>`;

    el.innerHTML = `
      <div class="header-inner">
        <a class="logo" href="index.html">🛍️ ${escapeHtml(window.APP_CONFIG.SHOP_NAME)}</a>
        <nav class="nav">
          ${link("index.html", "상품")}
          ${link("cart.html", `장바구니 <span class="badge" id="cart-count">${Cart.count()}</span>`)}
          ${user ? link("orders.html", "내 결제내역") : ""}
          ${isAdmin(user) ? link("admin.html", "관리자") : ""}
          ${
            user
              ? `<span class="user-email" title="${escapeHtml(user.email)}">${escapeHtml(user.email)}</span>
                 <button class="btn-link" id="logout-btn" type="button">로그아웃</button>`
              : link("login.html", "로그인 / 회원가입")
          }
        </nav>
      </div>`;

    const btn = document.getElementById("logout-btn");
    if (btn) btn.addEventListener("click", logout);
  }

  document.addEventListener("cart:changed", () => {
    const badge = document.getElementById("cart-count");
    if (badge) badge.textContent = Cart.count();
  });

  // ---------- 표시용 도우미 ----------
  function won(n) {
    return Number(n || 0).toLocaleString("ko-KR") + "원";
  }

  function formatDate(iso) {
    if (!iso) return "-";
    return new Date(iso).toLocaleString("ko-KR", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  }

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);
  }

  const STATUS_LABEL = { PAID: "결제완료", PENDING: "결제대기", FAILED: "결제실패" };
  function statusBadge(status) {
    return `<span class="status status-${status.toLowerCase()}">${STATUS_LABEL[status] || status}</span>`;
  }

  // 잠깐 떠오르는 알림
  function toast(message) {
    let box = document.getElementById("toast");
    if (!box) {
      box = document.createElement("div");
      box.id = "toast";
      box.setAttribute("role", "status");
      document.body.appendChild(box);
    }
    box.textContent = message;
    box.classList.add("show");
    clearTimeout(box._timer);
    box._timer = setTimeout(() => box.classList.remove("show"), 1800);
  }

  // 페이지가 열리면 헤더 자동 표시
  renderHeader();
  sb.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT") renderHeader();
  });

  return {
    getUser, isAdmin, requireLogin, requireAdmin, logout, renderHeader,
    won, formatDate, escapeHtml, statusBadge, toast,
  };
})();

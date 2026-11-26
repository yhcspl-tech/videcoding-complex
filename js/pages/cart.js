// 장바구니 페이지
(async function () {
  const listEl = document.getElementById("cart-list");
  const emptyEl = document.getElementById("cart-empty");
  const contentEl = document.getElementById("cart-content");
  const orderBtn = document.getElementById("order-btn");
  const orderMsg = document.getElementById("order-msg");

  // 최신 상품 정보로 장바구니 동기화 (가격 변경/판매중지 반영)
  const { data: products } = await sb.from("products").select("id, name, price, image_url");
  if (products) Cart.sync(products);

  function render() {
    const items = Cart.read();
    const empty = items.length === 0;
    emptyEl.classList.toggle("hidden", !empty);
    contentEl.classList.toggle("hidden", empty);
    if (empty) return;

    listEl.innerHTML = items
      .map(
        (i) => `
        <div class="cart-item" data-id="${i.product_id}">
          <img src="${App.escapeHtml(i.image_url)}" alt="">
          <div>
            <p class="name">${App.escapeHtml(i.name)}</p>
            <p class="price">${App.won(i.price)}</p>
          </div>
          <div class="right">
            <div class="qty" aria-label="수량">
              <button type="button" data-act="dec" aria-label="수량 빼기">−</button>
              <span>${i.quantity}</span>
              <button type="button" data-act="inc" aria-label="수량 더하기">+</button>
            </div>
            <span class="line-total">${App.won(i.price * i.quantity)}</span>
            <button type="button" class="btn btn-danger btn-sm" data-act="remove">삭제</button>
          </div>
        </div>`
      )
      .join("");

    document.getElementById("sum-count").textContent = Cart.count() + "개";
    document.getElementById("sum-total").textContent = App.won(Cart.total());
  }

  listEl.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const id = Number(btn.closest(".cart-item").dataset.id);
    const item = Cart.read().find((i) => i.product_id === id);
    if (!item) return;
    if (btn.dataset.act === "inc") Cart.setQuantity(id, item.quantity + 1);
    if (btn.dataset.act === "dec") Cart.setQuantity(id, item.quantity - 1);
    if (btn.dataset.act === "remove") Cart.remove(id);
    render();
  });

  orderBtn.addEventListener("click", async () => {
    orderMsg.classList.add("hidden");
    const user = await App.getUser();
    if (!user) {
      location.href = "login.html?next=" + encodeURIComponent("cart.html");
      return;
    }

    orderBtn.disabled = true;
    orderBtn.textContent = "주문 생성 중…";

    const items = Cart.read().map((i) => ({ product_id: i.product_id, quantity: i.quantity }));
    const { data, error } = await sb.rpc("create_order", { items });

    if (error) {
      orderMsg.textContent = "주문을 만들지 못했습니다: " + error.message;
      orderMsg.classList.remove("hidden");
      orderBtn.disabled = false;
      orderBtn.textContent = "주문하기";
      return;
    }

    location.href = "checkout.html?orderId=" + encodeURIComponent(data.toss_order_id);
  });

  render();
})();

// 상품 목록 페이지
(async function () {
  const grid = document.getElementById("product-grid");

  const { data: products, error } = await sb
    .from("products")
    .select("id, name, description, price, image_url")
    .order("id");

  if (error) {
    grid.innerHTML = `<p class="msg msg-error">상품을 불러오지 못했습니다: ${App.escapeHtml(error.message)}</p>`;
    return;
  }
  if (!products.length) {
    grid.innerHTML = `<p class="empty">판매 중인 상품이 없습니다.</p>`;
    return;
  }

  // 장바구니에 담긴 상품 가격을 최신으로 맞춤
  Cart.sync(products);

  grid.innerHTML = products
    .map(
      (p) => `
      <article class="product">
        <img class="product-img" src="${App.escapeHtml(p.image_url)}" alt="${App.escapeHtml(p.name)}" loading="lazy">
        <div class="product-body">
          <h3 class="product-name">${App.escapeHtml(p.name)}</h3>
          <p class="product-desc">${App.escapeHtml(p.description)}</p>
          <p class="product-price">${App.won(p.price)}</p>
          <button class="btn btn-block" type="button" data-id="${p.id}">장바구니 담기</button>
        </div>
      </article>`
    )
    .join("");

  grid.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-id]");
    if (!btn) return;
    const product = products.find((p) => p.id === Number(btn.dataset.id));
    Cart.add(product, 1);
    App.toast(`'${product.name}'을(를) 장바구니에 담았어요`);
  });
})();

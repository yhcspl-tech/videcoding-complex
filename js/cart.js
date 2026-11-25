// 장바구니: 브라우저 localStorage 에 저장
// 형식: [{ product_id, name, price, image_url, quantity }]
// price 는 화면 표시용일 뿐, 실제 결제 금액은 서버(create_order)가 다시 계산한다.
window.Cart = (function () {
  const KEY = "goods_cart_v1";
  const MAX_QTY = 99;

  function read() {
    try {
      const items = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(items) ? items : [];
    } catch {
      return [];
    }
  }

  function write(items) {
    localStorage.setItem(KEY, JSON.stringify(items));
    document.dispatchEvent(new CustomEvent("cart:changed"));
  }

  function add(product, qty = 1) {
    const items = read();
    const found = items.find((i) => i.product_id === product.id);
    if (found) {
      found.quantity = Math.min(MAX_QTY, found.quantity + qty);
    } else {
      items.push({
        product_id: product.id,
        name: product.name,
        price: product.price,
        image_url: product.image_url,
        quantity: Math.min(MAX_QTY, qty),
      });
    }
    write(items);
  }

  function setQuantity(productId, qty) {
    const items = read();
    const found = items.find((i) => i.product_id === productId);
    if (!found) return;
    found.quantity = Math.max(1, Math.min(MAX_QTY, qty));
    write(items);
  }

  function remove(productId) {
    write(read().filter((i) => i.product_id !== productId));
  }

  function clear() {
    write([]);
  }

  // 오래된 가격/삭제된 상품을 최신 상품 정보로 맞춤
  function sync(products) {
    const map = new Map(products.map((p) => [p.id, p]));
    const items = read()
      .filter((i) => map.has(i.product_id))
      .map((i) => {
        const p = map.get(i.product_id);
        return { ...i, name: p.name, price: p.price, image_url: p.image_url };
      });
    write(items);
    return items;
  }

  function count() {
    return read().reduce((sum, i) => sum + i.quantity, 0);
  }

  function total() {
    return read().reduce((sum, i) => sum + i.price * i.quantity, 0);
  }

  return { read, add, setQuantity, remove, clear, sync, count, total, MAX_QTY };
})();

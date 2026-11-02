let token = "";
const api = "/api/orders";
const money = n => `₱${Number(n).toLocaleString("en-PH")}`;
const login = document.querySelector("#ownerLogin"), error = document.querySelector("#ownerError");
async function loadOrders() {
  if (!token) { error.textContent = "Enter the owner token to continue."; return; }
  try {
    const response = await fetch(api, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (response.status === 401) { error.textContent = "Unauthorized. Check the token configured in Cloudflare."; return; }
    if (!response.ok) {
      error.textContent = body.error ? `${body.error} (HTTP ${response.status})` : `The orders API returned HTTP ${response.status}. Check the Pages deployment and variables.`;
      return;
    }
    if (!Array.isArray(body.orders)) { error.textContent = "The orders API returned an invalid response."; return; }
    const data = body; error.textContent = ""; login.hidden = true;
    document.querySelector("#orderCount").textContent = `${data.orders.length} order${data.orders.length === 1 ? "" : "s"}`;
    document.querySelector("#lastUpdated").textContent = `Updated ${new Date().toLocaleTimeString()}`;
    document.querySelector("#ordersTable").innerHTML = data.orders.length ? `<table><thead><tr><th>Order</th><th>Customer</th><th>Pickup</th><th>Items</th><th>Total</th><th>Payment proof</th><th>Status</th></tr></thead><tbody>${data.orders.map(order => `<tr><td><strong>#${order.id.slice(0,8)}</strong><small>${new Date(order.created_at).toLocaleString()}</small></td><td><strong>${escapeHtml(order.customer_name)}</strong><small>${escapeHtml(order.customer_phone)}</small></td><td>${escapeHtml(order.pickup_details)}<small>${escapeHtml(order.pickup_time)}</small></td><td>${formatItems(order.items_json)}</td><td><strong>${money(order.total)}</strong></td><td><button class="receipt-button" data-receipt="${escapeHtml(order.id)}">View receipt</button><img class="owner-receipt" data-receipt-image="${escapeHtml(order.id)}" alt="Payment receipt" hidden /></td><td><span class="order-status">${escapeHtml(order.status)}</span></td></tr>`).join("")}</tbody></table>` : '<p class="owner-empty">No orders yet.</p>';
    document.querySelectorAll(".receipt-button").forEach(button => button.onclick = () => loadReceipt(button));
  } catch (requestError) {
    console.error(requestError);
    error.textContent = "Could not reach the orders API. Check the deployed Pages URL and try again.";
  }
  async function loadReceipt(button) {
    const id = button.dataset.receipt;
    const image = document.querySelector(`img[data-receipt-image="${id}"]`);
    button.disabled = true;
    button.textContent = "Loading…";
    try {
      const response = await fetch(`${api}?receipt=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (!response.ok) throw new Error(`Receipt request failed (${response.status})`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const openLink = document.createElement("a");
      openLink.href = url;
      openLink.target = "_blank";
      openLink.rel = "noopener";
      openLink.textContent = "Open / download proof";
      openLink.className = "receipt-open-link";
      image.parentElement.appendChild(openLink);
      image.onerror = () => { image.hidden = true; };
      image.src = url;
      image.hidden = false;
      button.textContent = "Receipt loaded";
    } catch (requestError) {
      console.error(requestError);
      button.textContent = "Could not load";
    } finally { button.disabled = false; }
  }
}
function formatItems(items) {
  const parsed = typeof items === "string" ? JSON.parse(items) : items;
  return Array.isArray(parsed) ? parsed.map(item => `${escapeHtml(item.id)} × ${escapeHtml(item.quantity)}`).join("<br>") : "Unavailable";
}
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[char])); }
document.querySelector("#loadOrders").onclick = () => { token = document.querySelector("#ownerToken").value.trim(); loadOrders(); };
document.querySelector("#refreshOrders").onclick = loadOrders;
setInterval(() => { if (token) loadOrders(); }, 30000);

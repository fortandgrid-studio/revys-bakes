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
    document.querySelector("#ordersTable").innerHTML = data.orders.length ? `<table><thead><tr><th>Order</th><th>Customer</th><th>Pickup</th><th>Items</th><th>Total</th><th>Payment proof</th><th>Status</th></tr></thead><tbody>${data.orders.map(order => `<tr><td data-label="Order"><strong>#${order.id.slice(0,8)}</strong><small>${new Date(order.created_at).toLocaleString()}</small></td><td data-label="Customer"><strong>${escapeHtml(order.customer_name)}</strong><small>${escapeHtml(order.customer_phone)}</small></td><td data-label="Pickup">${escapeHtml(order.pickup_details)}<small>${escapeHtml(order.pickup_time)}</small></td><td data-label="Items">${formatItems(order.items_json)}</td><td data-label="Total"><strong>${money(order.total)}</strong></td><td data-label="Payment proof"><button class="receipt-button" data-receipt="${escapeHtml(order.id)}">Open proof</button></td><td data-label="Status"><select class="order-status-select" data-order="${escapeHtml(order.id)}"><option value="pending" selected>Pending review</option><option value="done">Done</option><option value="invalid_payment">Invalid payment</option></select></td></tr>`).join("")}</tbody></table>` : '<p class="owner-empty">No pending orders.</p>';
    document.querySelectorAll(".receipt-button").forEach(button => button.onclick = () => loadReceipt(button));
    document.querySelectorAll(".order-status-select").forEach(select => {
      select.dataset.previous = select.value;
      select.onchange = () => confirmStatusChange(select);
    });
  } catch (requestError) {
    console.error(requestError);
    error.textContent = "Could not reach the orders API. Check the deployed Pages URL and try again.";
  }
  function confirmStatusChange(select) {
    const nextStatus = select.value;
    const messages = {
      done: "Confirm completion: mark this order as done? It will disappear from the pending orders list.",
      invalid_payment: "Reject this order as invalid payment? It will disappear from the pending orders list.",
      pending: "Keep this order pending for review?"
    };
    if (!window.confirm(messages[nextStatus])) {
      select.value = select.dataset.previous || "pending";
      return;
    }
    updateStatus(select, nextStatus);
  }
  async function updateStatus(select, nextStatus) {
    const previous = select.dataset.previous || "pending";
    select.disabled = true;
    try {
      const response = await fetch(api, { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ id: select.dataset.order, status: nextStatus }) });
      if (!response.ok) throw new Error(`Status update failed (${response.status})`);
      await loadOrders();
    } catch (requestError) {
      console.error(requestError);
      select.value = previous;
      select.disabled = false;
      error.textContent = "Could not update this order status. Please try again.";
    }
  }
  async function loadReceipt(button) {
    const id = button.dataset.receipt;
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
      button.replaceWith(openLink);
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

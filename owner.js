let token = "";
const api = "/api/orders";
const money = n => `₱${Number(n).toLocaleString("en-PH")}`;
const login = document.querySelector("#ownerLogin"), error = document.querySelector("#ownerError");
async function loadOrders() {
  if (!token) { error.textContent = "Enter the owner token to continue."; return; }
  const response = await fetch(api, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (response.status === 401) { error.textContent = "Unauthorized. Check the token configured in Cloudflare."; return; }
  if (!response.ok) { error.textContent = "Could not load orders."; return; }
  const data = await response.json(); error.textContent = ""; login.hidden = true;
  document.querySelector("#orderCount").textContent = `${data.orders.length} order${data.orders.length === 1 ? "" : "s"}`;
  document.querySelector("#lastUpdated").textContent = `Updated ${new Date().toLocaleTimeString()}`;
  document.querySelector("#ordersTable").innerHTML = data.orders.length ? `<table><thead><tr><th>Order</th><th>Customer</th><th>Pickup</th><th>Items</th><th>Total</th><th>Status</th></tr></thead><tbody>${data.orders.map(order => `<tr><td><strong>#${order.id.slice(0,8)}</strong><small>${new Date(order.created_at).toLocaleString()}</small></td><td><strong>${escapeHtml(order.customer_name)}</strong><small>${escapeHtml(order.customer_phone)}</small></td><td>${escapeHtml(order.pickup_details)}<small>${escapeHtml(order.pickup_time)}</small></td><td>${JSON.parse(order.items_json).map(item => `${escapeHtml(item.id)} × ${item.quantity}`).join("<br>")}</td><td><strong>${money(order.total)}</strong></td><td><span class="order-status">${escapeHtml(order.status)}</span></td></tr>`).join("")}</tbody></table>` : '<p class="owner-empty">No orders yet.</p>';
}
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[char])); }
document.querySelector("#loadOrders").onclick = () => { token = document.querySelector("#ownerToken").value.trim(); loadOrders(); };
document.querySelector("#refreshOrders").onclick = loadOrders;
setInterval(() => { if (token) loadOrders(); }, 30000);

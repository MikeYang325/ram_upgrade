const $ = (selector) => document.querySelector(selector);
const validation = $("#validation");
const validateButton = $("#validate");
const deployButton = $("#deploy-button");
const dialog = $("#log-dialog");

async function request(path, options = {}) {
  const response = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "The local service could not complete that action.");
  return payload;
}
function setValidation(state, text) {
  validation.innerHTML = `<span class="status-dot ${state}"></span><span>${text}</span>`;
}
function escapeText(value = "") { const div = document.createElement("div"); div.textContent = value; return div.innerHTML; }
function dateLabel(iso) { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)); }
function showLog(title, log) { $("#dialog-title").textContent = title; $("#dialog-log").textContent = log || "No additional output."; dialog.showModal(); }

async function loadStatus() {
  const data = await request("/api/status");
  $("#repository").textContent = data.repository;
  $("#branch").textContent = data.branch;
  $("#commit").textContent = data.commit;
  $("#production").textContent = `${data.production} ↗`;
  const grid = $("#connection-grid");
  grid.innerHTML = data.connections.map((item) => `<article class="connection-card"><div class="connection-top"><h3>${escapeText(item.name)}</h3><span class="state ${item.state === "ready" ? "" : "needs"}">${escapeText(item.state)}</span></div><p>${escapeText(item.detail)}</p></article>`).join("");
}
async function loadHistory() {
  const history = await request("/api/history");
  const list = $("#history-list");
  if (!history.length) { list.innerHTML = '<div class="empty">No local releases recorded yet. Your first successful publish will appear here.</div>'; return; }
  list.innerHTML = history.map((entry) => `<div class="history-row"><div class="history-ref">${escapeText(entry.ref)}</div><div class="history-meta"><span class="mono">${escapeText(entry.commit)}</span> · ${escapeText(entry.target)} · ${dateLabel(entry.createdAt)}</div><div class="state ${entry.status === "ready" ? "" : "needs"}">${escapeText(entry.status)}</div><button data-roll="${escapeText(entry.id)}">Rollback</button></div>`).join("");
}
async function validate() {
  const ref = $("#ref").value.trim();
  if (!ref) { setValidation("error", "Enter a branch or commit before verifying."); return false; }
  validateButton.disabled = true; setValidation("working", "Checking that revision against GitHub…");
  try { const data = await request("/api/validate", { method: "POST", body: JSON.stringify({ ref }) }); setValidation("ready", `Verified commit ${data.commit.slice(0, 12)}. Ready to publish.`); return true; }
  catch (error) { setValidation("error", error.message); return false; }
  finally { validateButton.disabled = false; }
}
validateButton.addEventListener("click", validate);
$("#deploy-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!(await validate())) return;
  const ref = $("#ref").value.trim();
  deployButton.disabled = true; setValidation("working", "Publishing through your local Vercel session…");
  try { const data = await request("/api/deploy", { method: "POST", body: JSON.stringify({ ref, target: $("#target").value }) }); setValidation("ready", `Published ${data.deployment.commit.slice(0, 12)} successfully.`); showLog("Production release ready", data.deployment.log); await loadHistory(); }
  catch (error) { setValidation("error", error.message); showLog("Release did not complete", error.message); }
  finally { deployButton.disabled = false; }
});
$("#history-list").addEventListener("click", async (event) => {
  const id = event.target.dataset.roll; if (!id) return;
  if (!confirm("Roll production back to this recorded deployment?")) return;
  event.target.disabled = true;
  try { const data = await request("/api/rollback", { method: "POST", body: JSON.stringify({ id }) }); showLog("Rollback complete", data.message); }
  catch (error) { showLog("Rollback did not complete", error.message); }
  finally { event.target.disabled = false; }
});
$("#refresh-history").addEventListener("click", loadHistory);
$(".close").addEventListener("click", () => dialog.close());
Promise.all([loadStatus(), loadHistory()]).catch((error) => setValidation("error", error.message));

let registry;
const $ = selector => document.querySelector(selector);
const labels = { agents:"Agents",skills:"Skills",connectors:"Connectors",workflows:"Workflows",schedules:"Schedules",providers:"Providers",activity:"Activity" };

async function load() {
  registry = await fetch("/api/company").then(response => response.json());
  $("#company").textContent = registry.company.name;
  const realised = registry.capabilities.filter(item => item.state === "realised").length;
  $("#summary").textContent = `${realised}/${registry.capabilities.length} capabilities realised`;
  renderAttention();
}

function renderAttention() {
  const items = registry.capabilities.filter(item => item.state !== "realised");
  $("#attention-count").textContent = `${items.length} items`;
  $("#attention").innerHTML = items.map(capability => card(capability.name, `${capability.requirements.filter(item => !item.covered).length} requirements uncovered`, capability.state)).join("") || card("All clear", "Every declared capability is realised", "realised");
}

function card(name, detail, status="") { return `<article class="card"><div><strong>${escapeHtml(name)}</strong><small>${escapeHtml(detail)}</small></div><span class="status ${status}">${escapeHtml(status.replace("_", " "))}</span></article>`; }

function project(kind) {
  $("#home").classList.add("hidden"); $("#projection").classList.remove("hidden");
  $("#projection-kind").textContent = "COMPANY PROJECTION"; $("#projection-title").textContent = labels[kind] ?? "Capabilities";
  let content = [];
  if (kind === "capabilities") content = registry.capabilities.map(item => card(item.name, `${item.requirements.filter(req => req.covered).length}/${item.requirements.length} requirements covered`, item.state));
  else if (kind === "providers") content = registry.providers.map(item => card(item.family, item.provider, "configured"));
  else if (kind === "activity") content = [card("Runtime activity", "Apply and reconciliation history is retained in company state", "available")];
  else content = registry.resources.filter(item => item.family === kind).map(item => card(item.name, item.provider ?? "No provider", item.observed?.status ?? (item.deployed ? "deployed" : "desired")));
  $("#projection-content").innerHTML = content.join("") || card(`No ${kind}`, "No desired resources are declared", "missing");
}

$("#nav").addEventListener("click", event => { const link=event.target.closest("a"); if(!link)return; document.querySelectorAll("nav a").forEach(a=>a.classList.remove("active")); link.classList.add("active"); const kind=link.hash.slice(1); if(kind==="home"){ $("#projection").classList.add("hidden"); $("#home").classList.remove("hidden"); } else project(kind); });
$("#lily-form").addEventListener("submit", async event => { event.preventDefault(); const message=$("#intent").value; if(!message)return; $("#lily-response").textContent="Thinking…"; const result=await fetch("/api/lily",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({message})}).then(r=>r.json()); $("#lily-response").textContent=result.message; });
document.querySelectorAll(".suggestions button").forEach(button => button.addEventListener("click", () => { $("#intent").value=button.textContent; $("#lily-form").requestSubmit(); }));
function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c])}
load().catch(error => { $("#lily-response").textContent = error.message; });

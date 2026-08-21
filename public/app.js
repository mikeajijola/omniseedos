let registry;
let operatorToken = "";
const $ = selector => document.querySelector(selector);
const labels = { capabilities:"Capabilities",realisations:"Realisations",plan:"Plan",observe:"Observe",activity:"Activity" };

async function load() {
  registry = await fetch("/api/company").then(response => response.json());
  $("#company").textContent = registry.company.name;
  const readOnly = registry.instance.environment.endsWith("-read-only-inspection");
  $("#runtime-label").textContent = readOnly ? "Read-only" : registry.observations.length ? "Observed" : "Desired only";
  $("#instance").textContent = `${registry.instance.desiredState?.repository ?? "No canonical repository"} · ${registry.instance.desiredRevision ?? "revision unknown"} · ${registry.instance.environment}`;
  const steward = registry.stewardship?.realisation?.participants.find(item => item.family === "agents")?.desired;
  if (steward) { $("#steward-nav").textContent = steward.name; $("#steward-title").textContent = `${steward.name.toUpperCase()} · COMPANY STEWARD`; $("#steward-mark").textContent = steward.name.slice(0,1).toUpperCase(); }
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
  else if (kind === "realisations") content = registry.realisations.map(item => card(item.name, `${item.participants.length} primitive participants`, item.status));
  else if (kind === "plan") content = [...registry.proposals.map(item => card(item.id, `Company change · ${item.status}`, item.status)), ...registry.plans.map(item => card(item.id, `${item.actions?.length ?? 0} planned actions`, item.status ?? "planned"))];
  else if (kind === "observe") content = [...registry.observations.map(item => card(item.id, `${item.family} · ${item.checkedAt ?? "time unknown"}`, item.status)), ...registry.providerGaps.map(item => card(item.primitiveFamily, item.message, item.state))];
  else if (kind === "activity") content = registry.history.map(item => card(item.type, item.at ?? "No timestamp", item.actorId ?? "recorded"));
  $("#projection-content").innerHTML = content.join("") || card(`No ${kind}`, "No desired resources are declared", "missing");
}

$("#nav").addEventListener("click", event => { const link=event.target.closest("a"); if(!link)return; document.querySelectorAll("nav a").forEach(a=>a.classList.remove("active")); link.classList.add("active"); const kind=link.hash.slice(1); if(kind==="home"){ $("#projection").classList.add("hidden"); $("#home").classList.remove("hidden"); } else project(kind); });
$("#lily-form").addEventListener("submit", async event => { event.preventDefault(); const message=$("#intent").value; if(!message)return; $("#lily-response").textContent="Thinking…"; let response=await invokeSteward(message); if(response.status===403&&!operatorToken){operatorToken=window.prompt("This company requires an operator access token. It is kept only until you close or reload this page.")??""; if(operatorToken)response=await invokeSteward(message);} const result=await response.json(); if(response.status===403)operatorToken=""; $("#lily-response").textContent=result.message??result.error; if(response.ok)await load(); });
function invokeSteward(message){const headers={"content-type":"application/json"};if(operatorToken)headers.authorization=`Bearer ${operatorToken}`;return fetch("/api/lily",{method:"POST",headers,body:JSON.stringify({message})});}
document.querySelectorAll(".suggestions button").forEach(button => button.addEventListener("click", () => { $("#intent").value=button.textContent; $("#lily-form").requestSubmit(); }));
function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c])}
load().catch(error => { $("#lily-response").textContent = error.message; });

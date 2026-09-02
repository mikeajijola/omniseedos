import { renderPlans } from "./plan-view.js";
import { conversationIdFor, groupConversations } from "./conversations.js";

let registry;
let operatorToken = "";
let currentWork = null;
let conversations = [];
let workPoll = null;
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
  conversations = groupConversations(registry.workRuns ?? []);
  renderConversationPicker();
  if (!currentWork && conversations.length) {
    currentWork = conversations.at(-1).runs.at(-1);
    renderWork(currentWork);
    if (isActive(currentWork.status)) scheduleWorkPoll();
  }
}

function renderAttention() {
  const items = registry.capabilities.filter(item => item.state !== "realised");
  $("#attention-count").textContent = `${items.length} items`;
  $("#attention").innerHTML = items.map(capability => card(capability.name, `${capability.requirements.filter(item => !item.covered).length} requirements uncovered`, capability.state)).join("") || card("All clear", "Every declared capability is realised", "realised");
}

function card(name, detail, status="") { return `<article class="card"><div><strong>${escapeHtml(name)}</strong><small>${escapeHtml(detail)}</small></div><span class="status ${status}">${escapeHtml(status.replace("_", " "))}</span></article>`; }

function providerCard(item) {
  const implementation = item.implementation ? `${item.implementation.name}${item.implementation.version ? ` ${item.implementation.version}` : ""} · ${item.implementation.kind}` : "Not installed";
  const affected = [...item.affectedCapabilities.map(value => value.name), ...item.affectedRealisations.map(value => value.name)];
  const rows = [["Provider ID", item.providerId], ["Primitive family", item.primitiveFamily], ["Selected Provider", item.desiredProvider], ["Implementation", implementation], ["Lifecycle", item.lifecycleState.replaceAll("_", " ")], ["Last check", item.checkedAt ?? "No Provider check recorded"], ["Failure", item.failureCategory?.replaceAll("_", " ") ?? "None reported"], ["Affected company work", affected.join(", ") || "None"], ["Next step", item.remediationCategory?.replaceAll("_", " ") ?? "No action needed"]];
  return `<article class="provider-card"><div class="provider-heading"><div><strong>${escapeHtml(item.providerId)}</strong><small>${escapeHtml(item.primitiveFamily)} · ${escapeHtml(item.reason)}</small></div><span class="status ${escapeHtml(item.lifecycleState)}">${escapeHtml(item.lifecycleState.replaceAll("_", " "))}</span></div><details><summary>Diagnostic details</summary><dl>${rows.map(([label,value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl></details></article>`;
}

function project(kind) {
  $("#home").classList.add("hidden"); $("#projection").classList.remove("hidden");
  $("#projection-kind").textContent = "COMPANY PROJECTION"; $("#projection-title").textContent = labels[kind] ?? "Capabilities";
  let content = [];
  if (kind === "capabilities") content = registry.capabilities.map(item => card(item.name, `${item.requirements.filter(req => req.covered).length}/${item.requirements.length} requirements covered`, item.state));
  else if (kind === "realisations") content = registry.realisations.map(item => card(item.name, `${item.participants.length} primitive participants`, item.status));
  else if (kind === "plan") content = [renderPlans(registry.plans), ...registry.proposals.map(item => card(item.id, `Company change · ${item.status}`, item.status))];
  else if (kind === "observe") content = [...registry.providerDiagnostics.map(providerCard), ...registry.observations.map(item => card(item.id, `${item.family} · ${item.checkedAt ?? "time unknown"}`, item.status))];
  else if (kind === "activity") content = registry.history.map(item => card(item.type, item.at ?? "No timestamp", item.actorId ?? "recorded"));
  $("#projection-content").innerHTML = content.join("") || card(`No ${kind}`, "No desired resources are declared", "missing");
}

$("#nav").addEventListener("click", event => { const link=event.target.closest("a"); if(!link)return; document.querySelectorAll("nav a").forEach(a=>{ a.classList.remove("active"); a.removeAttribute("aria-current"); }); link.classList.add("active"); link.setAttribute("aria-current", "page"); const kind=link.hash.slice(1); if(kind==="home"){ $("#projection").classList.add("hidden"); $("#home").classList.remove("hidden"); } else project(kind); });
$("#steward-form").addEventListener("submit", async event => {
  event.preventDefault();
  const message = $("#intent").value.trim();
  if (!message) return;
  $("#steward-response").textContent = "The steward is accepting the message…";
  let response = await invokeSteward(message);
  if (response.status === 403 && !operatorToken) {
    operatorToken = window.prompt("This company requires an operator access token. It is kept only until you close or reload this page.") ?? "";
    if (operatorToken) response = await invokeSteward(message);
  }
  const result = await response.json();
  if (response.status === 403) operatorToken = "";
  if (!response.ok) {
    $("#steward-response").textContent = result.error ?? "The steward could not accept this message.";
    return;
  }
  $("#intent").value = "";
  if (response.status === 202) {
    currentWork = result;
    $("#steward-response").textContent = "";
    renderWork(result);
    scheduleWorkPoll(100);
  } else {
    currentWork = null;
    $("#steward-work").classList.add("hidden");
    $("#steward-response").textContent = result.message ?? "The steward returned no answer.";
  }
});
function invokeSteward(message) {
  const headers = { "content-type": "application/json", "idempotency-key": crypto.randomUUID() };
  if (operatorToken) headers.authorization = `Bearer ${operatorToken}`;
  if (currentWork && isContinuable(currentWork)) {
    return fetch(`/api/lily/${encodeURIComponent(currentWork.id)}/messages`, { method: "POST", headers, body: JSON.stringify({ message }) });
  }
  return fetch("/api/lily", { method: "POST", headers, body: JSON.stringify({ message }) });
}
function scheduleWorkPoll(delay = 1200) {
  clearTimeout(workPoll);
  if (!currentWork || !isActive(currentWork.status)) return;
  workPoll = setTimeout(pollWork, delay);
}
async function pollWork() {
  try {
    const response = await fetch(`/api/lily/${encodeURIComponent(currentWork.id)}`, { headers: operatorToken ? { authorization: `Bearer ${operatorToken}` } : {} });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Company work update failed");
    currentWork = result;
    renderWork(result);
    await load();
    scheduleWorkPoll(["waiting_for_company_approval", "waiting_for_checks"].includes(result.status) ? 5000 : 1200);
  } catch (error) {
    $("#steward-response").textContent = error.message;
    scheduleWorkPoll(5000);
  }
}
function renderWork(work) {
  $("#steward-work").classList.remove("hidden");
  $("#work-status").textContent = work.status.replaceAll("_", " ");
  const events = work.events ?? [];
  $("#work-timeline").innerHTML = events.map(event => `<article class="${escapeHtml(event.type)}"><strong>${escapeHtml(eventLabel(event))}</strong>${event.summary ? `<p>${escapeHtml(event.summary)}</p>` : ""}<small>${escapeHtml(event.at ?? "")}${event.operationId ? ` · ${escapeHtml(event.operationId)}` : ""}</small></article>`).join("");
  const answer = [...events].reverse().find(event => event.type === "assistant_message" && event.summary);
  if (answer) $("#steward-response").textContent = answer.summary;
  $("#cancel-work").classList.toggle("hidden", !isActive(work.status));
}
function eventLabel(event) {
  return ({
    company_work_started: "Intent",
    company_work_conversation_associated: "Conversation",
    agent_session_started: "Steward started",
    eve_session_started: "Steward started",
    agent_turn_started: "Reasoning over company state",
    operation_requested: "OmniSeed operation requested",
    operation_result: "OmniSeed operation result",
    assistant_message: "Lily",
    operator_input_requested: "Operator input required",
    user_message: "You",
    agent_session_waiting: "Waiting",
    company_work_settled: "Work state",
    company_work_status_changed: "Status",
    company_work_failed: "Work failed",
  })[event.type] ?? event.type.replaceAll("_", " ");
}
function isActive(status) { return !["completed", "failed", "blocked", "cancelled"].includes(status); }
function isContinuable(work) { return (work?.session?.runtimeSessionId || work?.session?.id) && !["failed", "blocked", "cancelled"].includes(work.status); }
function renderConversationPicker() {
  const select = $("#conversation-select");
  select.innerHTML = conversations.map((item, index) => `<option value="${escapeHtml(item.id)}">Conversation ${index + 1} · ${item.runs.length} work segment${item.runs.length === 1 ? "" : "s"}</option>`).join("");
  if (currentWork) select.value = conversationIdFor(currentWork);
}
$("#conversation-select").addEventListener("change", event => {
  const conversation = conversations.find(item => item.id === event.target.value);
  currentWork = conversation?.runs.at(-1) ?? null;
  if (currentWork) { renderWork(currentWork); if (isActive(currentWork.status)) scheduleWorkPoll(100); }
});
$("#new-conversation").addEventListener("click", () => {
  currentWork = null;
  clearTimeout(workPoll);
  $("#steward-work").classList.add("hidden");
  $("#steward-response").textContent = "A new conversation will begin with your next message.";
  $("#intent").focus();
});
$("#cancel-work").addEventListener("click", async () => {
  if (!currentWork) return;
  const headers = operatorToken ? { authorization: `Bearer ${operatorToken}` } : {};
  const response = await fetch(`/api/lily/${encodeURIComponent(currentWork.id)}/cancel`, { method: "POST", headers });
  const result = await response.json();
  if (!response.ok) return void ($("#steward-response").textContent = result.error ?? "Cancellation failed.");
  currentWork = result; renderWork(result);
});
document.querySelectorAll(".suggestions button").forEach(button => button.addEventListener("click", () => { $("#intent").value=button.textContent; $("#steward-form").requestSubmit(); }));
function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c])}
load().catch(error => { $("#steward-response").textContent = error.message; });

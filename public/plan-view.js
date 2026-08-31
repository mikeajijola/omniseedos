const words = value => String(value ?? "").replaceAll("_", " ");

export function renderPlans(plans = []) {
  if (!plans.length) return `<article class="empty-state"><h2>No plan yet</h2><p>Ask the company steward to generate a plan from the current company state.</p></article>`;
  return plans.map(renderPlan).join("");
}

function renderPlan(plan) {
  const current = plan.current === true;
  const stale = plan.current === false || plan.status === "stale";
  const empty = plan.status === "empty" || plan.outcome === "no_op";
  const state = stale ? "stale" : empty ? "no-op" : words(plan.status || "planned");
  const heading = current ? "Current plan" : stale ? "Earlier plan" : "Plan";
  const explanation = stale
    ? "Company state has changed since this plan was made. Generate a new plan before approval or apply."
    : empty
      ? "No changes are needed for the observed company state."
      : `${plan.actions?.length ?? 0} governed change${plan.actions?.length === 1 ? "" : "s"} ${current ? "in the current plan" : "recorded by OmniSeed"}.`;
  const actions = (plan.actions ?? []).map(renderAction).join("");
  return `<article class="plan-card ${stale ? "plan-stale" : ""}" aria-labelledby="${escapeHtml(plan.id)}-title">
    <div class="plan-heading"><div><p class="plan-kicker">${escapeHtml(heading)}</p><h2 id="${escapeHtml(plan.id)}-title">${escapeHtml(plan.id)}</h2></div><span class="status ${escapeHtml(state)}">${escapeHtml(state)}</span></div>
    <p>${escapeHtml(explanation)}</p>
    ${plan.createdAt ? `<p class="plan-meta">Created <time datetime="${escapeHtml(plan.createdAt)}">${escapeHtml(plan.createdAt)}</time></p>` : ""}
    ${actions ? `<ol class="plan-actions" aria-label="Planned changes">${actions}</ol>` : ""}
  </article>`;
}

function renderAction(action) {
  const change = action.action === "create" ? "Create" : action.action === "update" ? "Update" : words(action.action || "Change");
  const resource = action.desired?.name ?? action.resourceId;
  const observation = action.observed;
  const observedDetail = observation
    ? `Observed: ${words(observation.status ?? observation.state ?? "recorded")}${observation.checkedAt ? ` at ${observation.checkedAt}` : ""}.`
    : "No observation was recorded for this change.";
  return `<li><div><strong>${escapeHtml(change)} ${escapeHtml(resource)}</strong><small>${escapeHtml(action.family)} · Provider ${escapeHtml(action.provider ?? "missing")}</small></div><p>${escapeHtml(observedDetail)}</p></li>`;
}

function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]); }

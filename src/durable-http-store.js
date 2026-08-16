import { emptyRuntimeState } from "@omniseed/engine";

/** Durable state boundary for stateless/serverless OS runtimes. */
export class DurableHttpStateStore {
  constructor({ endpoint, token, fetchImpl = fetch }) {
    if (!endpoint || !token) throw new Error("A durable state endpoint and server-side token are required.");
    this.endpoint = endpoint.replace(/\/$/, "");
    this.token = token;
    this.fetch = fetchImpl;
  }

  async load(companyId) {
    const response = await this.fetch(`${this.endpoint}/companies/${encodeURIComponent(companyId)}/state`, { headers: this.#headers() });
    if (response.status === 404) return emptyRuntimeState(companyId);
    if (!response.ok) throw new Error(`Durable state load failed (${response.status}).`);
    const state = await response.json();
    if (state.companyId !== companyId) throw new Error("Durable state crossed a company boundary.");
    return state;
  }

  async save(state, expectedVersion) {
    const response = await this.fetch(`${this.endpoint}/companies/${encodeURIComponent(state.companyId)}/state`, {
      method: "PUT", headers: { ...this.#headers(), "content-type": "application/json", "if-match": String(expectedVersion) }, body: JSON.stringify(state)
    });
    if (response.status === 409 || response.status === 412) throw new Error("State conflict");
    if (!response.ok) throw new Error(`Durable state save failed (${response.status}).`);
    const saved = await response.json();
    if (saved.companyId !== state.companyId || saved.version !== expectedVersion + 1) throw new Error("Durable state service returned an invalid version or company.");
    return saved;
  }

  #headers() { return { authorization: `Bearer ${this.token}`, accept: "application/json" }; }
}

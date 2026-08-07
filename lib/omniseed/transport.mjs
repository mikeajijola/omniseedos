export class OmniSeedTransport {
  async getRuntimeStatus(){throw new Error('Not implemented')}
  async getCompany(){throw new Error('Not implemented')} async listCapabilities(){throw new Error('Not implemented')}
  async getCapability(){throw new Error('Not implemented')} async listGaps(){throw new Error('Not implemented')}
  async getPlan(){throw new Error('Not implemented')} async generatePlan(){throw new Error('Not implemented')}
  async cancelPlan(){throw new Error('Not implemented')} async applyPlan(){throw new Error('Not implemented')}
  async getState(){throw new Error('Not implemented')} async listActivity(){throw new Error('Not implemented')}
  async listObservations(){throw new Error('Not implemented')} async listFindings(){throw new Error('Not implemented')}
  async startFoundingSession(){throw new Error('Not implemented')} async submitFounderIntent(){throw new Error('Not implemented')} async getFoundingDraft(){throw new Error('Not implemented')}
}

export class LiveTransport extends OmniSeedTransport {
  constructor({baseUrl='http://127.0.0.1:8787',fetchImpl=globalThis.fetch}={}){super();this.baseUrl=baseUrl.replace(/\/$/,'');this.fetch=fetchImpl}
  async invoke(operation,input={}){const response=await this.fetch(`${this.baseUrl}/operations/${operation}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});const payload=await response.json();if(!response.ok||!payload.ok)throw new Error(payload.error?.message||`Runtime ${response.status}`);return payload.result}
  getRuntimeStatus(){return this.invoke('getRuntimeStatus')}
  getCompany(){return this.invoke('getCompany')} listCapabilities(){return this.invoke('listCapabilities')} getCapability(id){return this.invoke('getCapability',{id})}
  listGaps(){return this.invoke('listGaps')} getPlan(){return this.invoke('getCurrentPlan')} generatePlan(definition){return this.invoke('generatePlan',{definition})}
  cancelPlan(request){return this.invoke('cancelPlan',request)} applyPlan(request){return this.invoke('applyPlan',request)} getState(){return this.invoke('getState')}
  listActivity(){return this.invoke('listActivity')} listObservations(){return this.invoke('listObservations')} listFindings(){return this.invoke('listFindings')}
  startFoundingSession(actorId){return this.invoke('startFoundingSession',{actorId})} submitFounderIntent(sessionId,intent){return this.invoke('submitFounderIntent',{sessionId,intent})} getFoundingDraft(sessionId){return this.invoke('getFoundingDraft',{sessionId})}
  refineFoundingDraft(sessionId,instruction){return this.invoke('refineFoundingDraft',{sessionId,instruction})} acceptDraftItem(sessionId,section,itemId){return this.invoke('acceptDraftItem',{sessionId,section,itemId})} rejectDraftItem(sessionId,section,itemId){return this.invoke('rejectDraftItem',{sessionId,section,itemId})}
  updateDraftItem(sessionId,section,itemId,name){return this.invoke('updateDraftItem',{sessionId,section,itemId,name})} addDraftItem(sessionId,section,item){return this.invoke('addDraftItem',{sessionId,section,item})} explainFoundingItem(sessionId,section,itemId){return this.invoke('explainFoundingItem',{sessionId,section,itemId})}
  validateFoundingDraft(sessionId){return this.invoke('validateFoundingDraft',{sessionId})} commitFoundingDraft(sessionId,authorization){return this.invoke('commitFoundingDraft',{sessionId,authorization})}
}

export class FixtureTransport extends OmniSeedTransport {
  constructor(fixture){super();this.fixture=structuredClone(fixture);this.plan=this.fixture.plan||null}
  async getCompany(){return this.fixture.company} async listCapabilities(){return Object.values(this.fixture.capabilities)}
  async getCapability(id){return this.fixture.capabilities[id]||null} async listGaps(){return Object.values(this.fixture.capabilities).filter(item=>item.required&&item.state!=='realised')}
  async getPlan(){return this.plan} async generatePlan(){return this.plan} async cancelPlan(){this.plan=null;return {cancelled:true}}
  async applyPlan(){throw new Error('FixtureTransport is read-only; use LiveTransport for real apply')}
  async getState(){return {capabilities:await this.listCapabilities()}} async listActivity(){return this.fixture.events||[]}
  async listObservations(){return this.fixture.observations||[]} async listFindings(){return this.fixture.findings||[]}
  async getRuntimeStatus(){return {mode:'fixture',reachable:true,persistence:'none',version:'fixture'}}
}

export class DemoTransport extends FixtureTransport {
  async getRuntimeStatus(){return {mode:'demo',reachable:true,persistence:'none',version:'public-demo'}}
  async generatePlan(){throw new Error('Demo mode is read-only; run OmniSeed locally for real planning')}
  async cancelPlan(){throw new Error('Demo mode is read-only')}
  async applyPlan(){throw new Error('Demo mode is read-only and does not persist changes')}
}

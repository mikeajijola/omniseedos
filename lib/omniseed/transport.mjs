export class OmniSeedTransport {
  async getRuntimeStatus(){throw new Error('Not implemented')}
  async discoverOperations(){throw new Error('Not implemented')} async resolveIntent(){throw new Error('Not implemented')}
  async getCompany(){throw new Error('Not implemented')} async listCapabilities(){throw new Error('Not implemented')}
  async getCapability(){throw new Error('Not implemented')} async listGaps(){throw new Error('Not implemented')}
  async getPlan(){throw new Error('Not implemented')} async generatePlan(){throw new Error('Not implemented')}
  async cancelPlan(){throw new Error('Not implemented')} async applyPlan(){throw new Error('Not implemented')}
  async getState(){throw new Error('Not implemented')} async getInfrastructure(){throw new Error('Not implemented')} async listActivity(){throw new Error('Not implemented')}
  async listObservations(){throw new Error('Not implemented')} async listFindings(){throw new Error('Not implemented')}
  async startFoundingSession(){throw new Error('Not implemented')} async submitFounderIntent(){throw new Error('Not implemented')} async getFoundingDraft(){throw new Error('Not implemented')}
}

export class LiveTransport extends OmniSeedTransport {
  constructor({baseUrl='http://127.0.0.1:8787',fetchImpl=globalThis.fetch}={}){super();this.baseUrl=baseUrl.replace(/\/$/,'');this.fetch=fetchImpl}
  async invoke(operation,input={}){const response=await this.fetch(`${this.baseUrl}/operations/${operation}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});const payload=await response.json();if(!response.ok||!payload.ok)throw new Error(payload.error?.message||`Runtime ${response.status}`);return payload.result}
  getRuntimeStatus(){return this.invoke('getRuntimeStatus')}
  discoverOperations(surface){return this.invoke('discoverOperations',{interface:surface})} resolveIntent(utterance){return this.invoke('resolveIntent',{utterance})}
  getCompany(){return this.invoke('getCompany')} listCapabilities(){return this.invoke('listCapabilities')} getCapability(id){return this.invoke('getCapability',{id})}
  listGaps(){return this.invoke('listGaps')} getPlan(){return this.invoke('getCurrentPlan')} generatePlan(definition){return this.invoke('generatePlan',{definition})}
  cancelPlan(request){return this.invoke('cancelPlan',request)} applyPlan(request){return this.invoke('applyPlan',request)} getState(){return this.invoke('getState')} getInfrastructure(){return this.invoke('getInfrastructure')}
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
  async discoverOperations(surface){return demoOperations.filter(item=>!surface||item.interfaces.includes(surface))}
  async resolveIntent(utterance){return resolveDemoIntent(utterance,await this.listCapabilities(),await this.discoverOperations('lily'))}
  async getInfrastructure(){return (this.fixture.resources||[]).map(item=>({...item,status:item.status||'absent'}))}
}

export class DemoTransport extends FixtureTransport {
  async getRuntimeStatus(){return {mode:'demo',reachable:true,persistence:'none',version:'public-demo'}}
  async generatePlan(){throw new Error('Demo mode is read-only; run OmniSeed locally for real planning')}
  async cancelPlan(){throw new Error('Demo mode is read-only')}
  async applyPlan(){throw new Error('Demo mode is read-only and does not persist changes')}
}

const demoOperations=[
 {id:'inspect_capability',runtimeOperation:'getCapability',description:'Inspect one calculated capability.',mutation:false,permissions:['read_company'],risk:'none',approvalRequired:false,interfaces:['ui','lily','api','cli','controller']},
 {id:'list_gaps',runtimeOperation:'listGaps',description:'Find required capability gaps.',mutation:false,permissions:['read_company'],risk:'none',approvalRequired:false,interfaces:['ui','lily','api','cli','controller']},
 {id:'inspect_plan',runtimeOperation:'getCurrentPlan',description:'Review the current governed plan.',mutation:false,permissions:['read_company'],risk:'none',approvalRequired:false,interfaces:['ui','lily','api','cli','controller']},
 {id:'generate_plan',runtimeOperation:'generatePlan',description:'Generate a proposed company plan.',mutation:false,permissions:['plan_company'],risk:'low',approvalRequired:false,interfaces:['ui','lily','api','cli','controller']},
 {id:'apply_plan',runtimeOperation:'applyPlan',description:'Apply approved plan changes.',mutation:true,permissions:['apply_plan'],risk:'high',approvalRequired:true,interfaces:['ui','lily','api','cli','controller']},
 {id:'list_activity',runtimeOperation:'listActivity',description:'Inspect audited history.',mutation:false,permissions:['read_company'],risk:'none',approvalRequired:false,interfaces:['ui','lily','api','cli','controller']},
 {id:'list_infrastructure',runtimeOperation:'getInfrastructure',description:'Inspect provider realisations.',mutation:false,permissions:['read_company'],risk:'none',approvalRequired:false,interfaces:['ui','lily','api','cli','controller']}
];
function resolveDemoIntent(utterance,capabilities,available){const text=String(utterance||'').toLowerCase(),ids=new Set(available.map(item=>item.id)),target=capabilities.find(item=>text.includes(item.id.replaceAll('_',' '))||text.includes(item.name.toLowerCase()))?.id;if(/delete|destroy|remove/.test(text))return {status:'clarification_required',requiresClarification:true,intent:'remove_resource',candidateOperations:ids.has('generate_plan')?['generate_plan']:[],clarification:'Which specific resource do you mean? No destructive plan has been generated.'};if(/go ahead|apply|do it|fix it|can you fix/.test(text))return {status:'resolved',requiresClarification:false,intent:'request_execution',target,candidateOperations:['inspect_plan','apply_plan'].filter(id=>ids.has(id)),requiresApproval:true};if(/how would|plan|sort out|what should|fix/.test(text))return {status:'resolved',requiresClarification:false,intent:'improve_capability',target,candidateOperations:['inspect_capability','generate_plan'].filter(id=>ids.has(id))};if(/supporting|infrastructure|running on|depend on/.test(text))return {status:'resolved',requiresClarification:false,intent:'inspect_infrastructure',target,candidateOperations:['list_infrastructure'].filter(id=>ids.has(id))};if(/changed|happened/.test(text))return {status:'resolved',requiresClarification:false,intent:'inspect_activity',candidateOperations:['list_activity'].filter(id=>ids.has(id))};if(/wrong|attention|missing|degraded/.test(text))return {status:'resolved',requiresClarification:false,intent:'inspect_gaps',target,candidateOperations:['list_gaps','inspect_capability'].filter(id=>ids.has(id))};return {status:'unsupported',requiresClarification:false,intent:'unknown',candidateOperations:[],clarification:'I cannot map that request to an available governed capability yet.'}}

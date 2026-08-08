import fs from 'node:fs';
const omniformCatalog=JSON.parse(fs.readFileSync(new URL('../../generated/omniform-core.operations.json',import.meta.url),'utf8'));
export class OmniSeedTransport {
  async getRuntimeStatus(){throw new Error('Not implemented')}
  async getCapabilityRegistry(){throw new Error('Not implemented')} async listOperations(){throw new Error('Not implemented')} async describeOperation(){throw new Error('Not implemented')} async discoverOperations(){throw new Error('Not implemented')} async resolveIntent(){throw new Error('Not implemented')}
  async getCompany(){throw new Error('Not implemented')} async listCapabilities(){throw new Error('Not implemented')}
  async getCapability(){throw new Error('Not implemented')} async getResource(){throw new Error('Not implemented')} async listGaps(){throw new Error('Not implemented')}
  async resolveCapability(){throw new Error('Not implemented')} async getCapabilityRealisation(){throw new Error('Not implemented')} async listAttention(){throw new Error('Not implemented')} async acceptCapabilityGap(){throw new Error('Not implemented')}
  async getPlan(){throw new Error('Not implemented')} async generatePlan(){throw new Error('Not implemented')}
  async cancelPlan(){throw new Error('Not implemented')} async applyPlan(){throw new Error('Not implemented')}
  async getState(){throw new Error('Not implemented')} async getInfrastructure(){throw new Error('Not implemented')} async listActivity(){throw new Error('Not implemented')}
  async listObservations(){throw new Error('Not implemented')} async listFindings(){throw new Error('Not implemented')}
  async startFoundingSession(){throw new Error('Not implemented')} async submitFounderIntent(){throw new Error('Not implemented')} async getFoundingDraft(){throw new Error('Not implemented')}
}

export class LiveTransport extends OmniSeedTransport {
  constructor({baseUrl='http://127.0.0.1:8787',fetchImpl=globalThis.fetch,headers={}}={}){super();this.baseUrl=baseUrl.replace(/\/$/,'');this.fetch=fetchImpl;this.headers=headers}
  async invoke(operation,input={}){const response=await this.fetch(`${this.baseUrl}/operations/${operation}`,{method:'POST',headers:{'content-type':'application/json',...this.headers},body:JSON.stringify(input)});const payload=await response.json();if(!response.ok||!payload.ok)throw new Error(payload.error?.message||`Runtime ${response.status}`);return payload.result}
  getRuntimeStatus(){return this.invoke('getRuntimeStatus')}
  getCapabilityRegistry(){return this.invoke('getCapabilityRegistry')} listOperations(surface){return this.invoke('listOperations',{interface:canonicalSurface(surface)})} describeOperation(id){return this.invoke('describeOperation',{id})} discoverOperations(surface){return this.listOperations(surface)} resolveIntent(utterance,interactionContext={}){return this.invoke('resolveIntent',{utterance,interactionContext})}
  getCompany(){return this.invoke('getCompany')} listCapabilities(){return this.invoke('listCapabilities')} getCapability(id){return this.invoke('getCapability',{id})} getResource(id){return this.invoke('getResource',{id})}
  listGaps(){return this.invoke('listGaps')} resolveCapability(capabilityId){return this.invoke('resolveCapability',{capabilityId})} getCapabilityRealisation(capabilityId){return this.invoke('getCapabilityRealisation',{capabilityId})} listAttention(){return this.invoke('listAttention')} acceptCapabilityGap(request){return this.invoke('acceptCapabilityGap',request)} getPlan(){return this.invoke('getCurrentPlan')} generatePlan(definition){return this.invoke('generatePlan',{definition})}
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
  async getCapability(id){return this.fixture.capabilities[id]||null} async getResource(id){return (this.fixture.resources||[]).find(item=>item.id===id)||null} async listGaps(){return Object.values(this.fixture.capabilities).filter(item=>item.required&&item.state!=='realised')}
  async resolveCapability(capabilityId){const capability=await this.getCapability(capabilityId);return capability?{capabilityId,existingCoverage:capability.coverage,missingRequirements:capability.missingRequirements||[],candidateRealisations:[],recommendedRealisation:null,unresolvedRequirements:capability.missingRequirements||[]}:null}
  async getCapabilityRealisation(capabilityId){const capability=await this.getCapability(capabilityId);return capability?{capability,selected:this.fixture.realisations?.[capabilityId]||null,resources:(this.fixture.resources||[]).filter(item=>item.capabilityIds?.includes(capabilityId)),attempts:[]}:null}
  async listAttention(){return Object.values(this.fixture.capabilities).filter(item=>['missing','partial','degraded','blocked','retryable'].includes(item.state)).map(item=>({id:`capability:${item.id}`,type:'capability_gap',severity:'medium',capabilityId:item.id,title:`${item.name} is ${item.state}`,reason:item.missingRequirements?.map(entry=>entry.id).join(', ')||'Not fully realised'}))}
  async acceptCapabilityGap(){throw new Error('FixtureTransport is read-only; use LiveTransport for governed decisions')}
  async getPlan(){return this.plan} async generatePlan(){return this.plan} async cancelPlan(){this.plan=null;return {cancelled:true}}
  async applyPlan(){throw new Error('FixtureTransport is read-only; use LiveTransport for real apply')}
  async getState(){return {capabilities:await this.listCapabilities()}} async listActivity(){return this.fixture.events||[]}
  async listObservations(){return this.fixture.observations||[]} async listFindings(){return this.fixture.findings||[]}
  async getRuntimeStatus(){return {mode:'fixture',reachable:true,persistence:'none',version:'fixture'}}
  async getCapabilityRegistry(){return {source:{kind:'omniform-operation-catalog',version:omniformCatalog.catalogVersion},operations:demoOperations}}
  async listOperations(surface){const canonical=canonicalSurface(surface);return demoOperations.filter(item=>!canonical||item.interfaces.includes(canonical))}
  async describeOperation(id){return demoOperations.find(item=>item.id===id)||null}
  async discoverOperations(surface){return this.listOperations(surface)}
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
 ...omniformCatalog.operations.map(item=>{const mutation=item.mutation;return {...structuredClone(item),inputSchema:item.input,outputSchema:item.output,available:!mutation,unavailableReason:mutation?'demo runtime is read-only':null,implementedBy:mutation?null:'demo-transport',runtimeOperation:{get_capability:'getCapability',get_resource:'getResource',generate_plan:'generatePlan',apply_plan:'applyPlan',resolve_capability:'resolveCapability',get_capability_realisation:'getCapabilityRealisation',list_attention:'listAttention',accept_capability_gap:'acceptCapabilityGap'}[item.id]}}),
 {id:'list_gaps',runtimeOperation:'listGaps',description:'Find required capability gaps.',mutation:false,permissions:['read_company'],risk:'none',approvalRequired:false,interfaces:['ui','lily','api','cli','controller']},
 {id:'inspect_plan',runtimeOperation:'getCurrentPlan',description:'Review the current governed plan.',mutation:false,permissions:['read_company'],risk:'none',approvalRequired:false,interfaces:['ui','lily','api','cli','controller']},
 {id:'list_activity',runtimeOperation:'listActivity',description:'Inspect audited history.',mutation:false,permissions:['read_company'],risk:'none',approvalRequired:false,interfaces:['ui','lily','api','cli','controller']},
 {id:'list_infrastructure',runtimeOperation:'getInfrastructure',description:'Inspect provider realisations.',mutation:false,permissions:['read_company'],risk:'none',approvalRequired:false,interfaces:['ui','lily','api','cli','controller']}
];
function resolveDemoIntent(utterance,capabilities,available){const text=String(utterance||'').toLowerCase(),ids=new Set(available.map(item=>item.id)),target=capabilities.find(item=>text.includes(item.id.replaceAll('_',' '))||text.includes(item.name.toLowerCase()))?.id;if(/what can (you|omniseed) do|available operations/.test(text))return {status:'resolved',requiresClarification:false,intent:'discover_operations',candidateOperations:[...ids]};if(/delete|destroy|remove/.test(text))return {status:'clarification_required',requiresClarification:true,intent:'remove_resource',candidateOperations:ids.has('generate_plan')?['generate_plan']:[],clarification:'Which specific resource do you mean? No destructive plan has been generated.'};if(/go ahead|apply(?: the| this)? plan|do it|execute|redeploy/.test(text))return {status:'resolved',requiresClarification:false,intent:'request_execution',target,candidateOperations:['inspect_plan','apply_plan'].filter(id=>ids.has(id)),requiresApproval:true};if(/i need|how would|plan|sort out|what should|fix/.test(text))return {status:'resolved',requiresClarification:false,intent:'improve_capability',target,candidateOperations:['get_capability','resolve_capability','generate_plan'].filter(id=>ids.has(id))};if(/supporting|infrastructure|running on|depend on|vercel/.test(text))return {status:'resolved',requiresClarification:false,intent:'inspect_infrastructure',target,candidateOperations:['list_infrastructure'].filter(id=>ids.has(id))};if(/changed|happened/.test(text))return {status:'resolved',requiresClarification:false,intent:'inspect_activity',candidateOperations:['list_activity'].filter(id=>ids.has(id))};if(/wrong|attention|missing|degraded/.test(text))return {status:'resolved',requiresClarification:false,intent:'inspect_gaps',target,candidateOperations:['list_attention','list_gaps','get_capability'].filter(id=>ids.has(id))};if(/show me|why|capabilit/.test(text))return {status:'resolved',requiresClarification:false,intent:'inspect_capability',target,candidateOperations:['get_capability'].filter(id=>ids.has(id))};return {status:'unsupported',requiresClarification:false,intent:'unknown',candidateOperations:[],clarification:'I cannot map that request to an available governed capability yet.'}}
function canonicalSurface(surface){return {lily:'agent',ui:'human',controller:'machine'}[surface]||surface}

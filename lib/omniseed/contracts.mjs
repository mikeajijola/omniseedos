export const navigation=[
 {id:'found',label:'Found'},{id:'company',label:'Company'},{id:'capabilities',label:'Capabilities'},{id:'plan',label:'Plan'},{id:'observe',label:'Observe'},{id:'activity',label:'Activity'}
];
export const operations={
 getRuntimeStatus:{mutation:false},discoverOperations:{mutation:false},resolveIntent:{mutation:false},getCompany:{mutation:false},listCapabilities:{mutation:false},getCapability:{mutation:false},getResource:{mutation:false},listGaps:{mutation:false},resolveCapability:{mutation:false},getCapabilityRealisation:{mutation:false},listAttention:{mutation:false},getCurrentPlan:{mutation:false},getState:{mutation:false},getInfrastructure:{mutation:false},listActivity:{mutation:false},listObservations:{mutation:false},listFindings:{mutation:false},
 generatePlan:{mutation:true,requires:['definition']},cancelPlan:{mutation:true,requires:['authorization','policy','plan']},applyPlan:{mutation:true,requires:['authorization','policy','approved_change_ids']},acceptCapabilityGap:{mutation:true,requires:['authorization','policy','reason']},
 startFoundingSession:{mutation:true,requires:['actor']},submitFounderIntent:{mutation:true,requires:['session','intent']},updateDraftItem:{mutation:true,requires:['session','review']},commitFoundingDraft:{mutation:true,requires:['authorization','validated_draft']}
};
export function capabilityView(runtimeCapability){if(!runtimeCapability?.state)throw new Error('Calculated OmniSeed state is required');return {...runtimeCapability,statusLabel:runtimeCapability.state}}

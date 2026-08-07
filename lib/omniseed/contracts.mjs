export const navigation=[
 {id:'found',label:'Found'},{id:'company',label:'Company'},{id:'capabilities',label:'Capabilities'},{id:'plan',label:'Plan'},{id:'observe',label:'Observe'},{id:'activity',label:'Activity'}
];
export const operations={
 getCompany:{mutation:false},listCapabilities:{mutation:false},getCapability:{mutation:false},listGaps:{mutation:false},getCurrentPlan:{mutation:false},getState:{mutation:false},listActivity:{mutation:false},listObservations:{mutation:false},listFindings:{mutation:false},
 generatePlan:{mutation:true,requires:['definition']},cancelPlan:{mutation:true,requires:['authorization','policy','plan']},applyPlan:{mutation:true,requires:['authorization','policy','approved_change_ids']},
 startFoundingSession:{mutation:true,requires:['actor']},submitFounderIntent:{mutation:true,requires:['session','intent']},updateDraftItem:{mutation:true,requires:['session','review']},commitFoundingDraft:{mutation:true,requires:['authorization','validated_draft']}
};
export function capabilityView(runtimeCapability){if(!runtimeCapability?.state)throw new Error('Calculated OmniSeed state is required');return {...runtimeCapability,statusLabel:runtimeCapability.state}}

export const navigation=[
 {id:'found',label:'Found'},{id:'company',label:'Company'},{id:'capabilities',label:'Capabilities'},{id:'plan',label:'Plan'},{id:'observe',label:'Observe'},{id:'activity',label:'Activity'}
];
export const operations={
 get_company:{mutation:false},list_capabilities:{mutation:false},get_capability:{mutation:false},list_gaps:{mutation:false},get_plan:{mutation:false},get_state:{mutation:false},list_findings:{mutation:false},get_evidence:{mutation:false},explain_change:{mutation:false},
 approve_plan:{mutation:true,requires:['authorization','policy','plan']},apply_approved_plan:{mutation:true,requires:['authorization','policy','approved_plan']}
};
export function capabilityView(runtimeCapability){if(!runtimeCapability?.state)throw new Error('Calculated OmniSeed state is required');return {...runtimeCapability,statusLabel:runtimeCapability.state}}

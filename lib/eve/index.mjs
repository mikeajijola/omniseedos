import {operations} from '../omniseed/contracts.mjs';
export const eveTools=Object.fromEntries(Object.entries(operations).filter(([,value])=>!value.mutation));
export function invokeEve(name,input,omniseed){if(!eveTools[name])throw new Error('Eve mutation is not available');return omniseed.invoke(name,input)}

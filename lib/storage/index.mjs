export function readOnlyFixtureStore(fixtures){return Object.freeze({get:name=>structuredClone(fixtures[name])})}

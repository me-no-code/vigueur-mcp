// Offline tests never reach the network: a test that forgets to pass its own `fetch` would
// otherwise call the real PISTE through the global one. The live and bundle suites run in child
// processes, which this does not touch.
globalThis.fetch = () => Promise.reject(new Error('network access in an offline test'));

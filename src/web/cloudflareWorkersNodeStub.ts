// Node builds never execute the Cloudflare branch. This module only gives
// Vite a concrete target for the Workers-only virtual module during analysis.
export const env: Record<string, never> = {};

// The Worker entry re-exports its Durable Object class. Nitro evaluates that
// module while bundling for Node even though the Cloudflare branch is dead.
// A concrete base class is therefore required for module evaluation only.
export class DurableObject {}

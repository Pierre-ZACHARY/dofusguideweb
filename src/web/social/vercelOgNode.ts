// The Docker/Nitro build runs in Node.js. Its Vite configuration aliases the
// Cloudflare-specific ImageResponse module to this Node-compatible adapter.
export { ImageResponse } from "@vercel/og";

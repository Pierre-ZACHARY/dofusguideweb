import http from "node:http";

// Nitro's Vite adapter proxies to `localhost`. Listen on the IPv6 wildcard so
// both ::1 and 127.0.0.1 reach the child server on Windows and buildx/QEMU.
process.env.HOST ??= "::";
process.env.NITRO_HOST ??= "::";

const originalEmit = http.Server.prototype.emit;
let activeRequests = 0;
let idleTimer;
let receivedPrerenderTraffic = false;

function scheduleStartupWatchdog() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => process.exit(1), 60_000);
}

function scheduleExit() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => process.exit(0), 2_000);
}

http.Server.prototype.emit = function emit(event, ...args) {
  if (event === "request") {
    clearTimeout(idleTimer);
    activeRequests += 1;
    const request = args[0];
    const response = args[1];
    const isStartupProbe = request.url?.startsWith("/__prerender-warmup-") === true;
    if (!isStartupProbe) receivedPrerenderTraffic = true;
    let completed = false;
    const complete = () => {
      if (completed) return;
      completed = true;
      activeRequests -= 1;
      if (activeRequests === 0) {
        if (receivedPrerenderTraffic) scheduleExit();
        else scheduleStartupWatchdog();
      }
    };
    response.once("finish", complete);
    response.once("close", complete);
  }
  return originalEmit.call(this, event, ...args);
};

// Protect the build from a preview server that starts but never receives a
// real prerender request. Startup probes only reset this watchdog; they never
// start the short successful-exit timer used after the actual crawl.
scheduleStartupWatchdog();

await import("../.output/server/index.mjs");

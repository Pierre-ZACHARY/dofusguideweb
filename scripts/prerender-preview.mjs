import http from "node:http";

// Nitro's Vite adapter proxies to `localhost`. Listen on the IPv6 wildcard so
// both ::1 and 127.0.0.1 reach the child server on Windows and buildx/QEMU.
process.env.HOST ??= "::";
process.env.NITRO_HOST ??= "::";

const originalEmit = http.Server.prototype.emit;
let activeRequests = 0;
let idleTimer;

function scheduleExit() {
  clearTimeout(idleTimer);
  // TanStack's startup probes wait 10 seconds after an expected failure. Keep
  // Nitro alive across that gap; otherwise Vite keeps proxying to a child that
  // exited successfully and every following prerender request returns 500.
  idleTimer = setTimeout(() => process.exit(0), 15_000);
}

http.Server.prototype.emit = function emit(event, ...args) {
  if (event === "request") {
    clearTimeout(idleTimer);
    activeRequests += 1;
    const response = args[1];
    let completed = false;
    const complete = () => {
      if (completed) return;
      completed = true;
      activeRequests -= 1;
      if (activeRequests === 0) scheduleExit();
    };
    response.once("finish", complete);
    response.once("close", complete);
  }
  return originalEmit.call(this, event, ...args);
};

// Protect the build from a preview server that starts but never receives a
// request. Real prerender traffic replaces this watchdog with the idle timer.
idleTimer = setTimeout(() => process.exit(1), 60_000);

await import("../.output/server/index.mjs");

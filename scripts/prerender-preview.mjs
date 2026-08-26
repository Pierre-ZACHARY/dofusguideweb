import http from "node:http";

const originalEmit = http.Server.prototype.emit;
let activeRequests = 0;
let idleTimer;

function scheduleExit() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => process.exit(0), 2_000);
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

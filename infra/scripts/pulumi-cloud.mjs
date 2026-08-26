import { spawnSync } from "node:child_process";

const pulumiExecutable = process.platform === "win32" ? "pulumi.exe" : "pulumi";
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("Usage: node scripts/pulumi-cloud.mjs <pulumi arguments>");
  process.exit(1);
}

const result = spawnSync(pulumiExecutable, args, {
  env: {
    ...process.env,
    PULUMI_BACKEND_URL: "https://api.pulumi.com",
  },
  stdio: "inherit",
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required");
  return value;
}

function run(command, args, input) {
  const result = spawnSync(command, args, {
    stdio: input === undefined ? "inherit" : ["pipe", "inherit", "inherit"],
    input,
    env: process.env,
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(command + " exited with code " + result.status);
}

const databaseId = requiredEnvironment("D1_DATABASE_ID");
const googleClientId = requiredEnvironment("GOOGLE_CLIENT_ID");
const metaMobCredentialsKey = requiredEnvironment("METAMOB_CREDENTIALS_KEY");
requiredEnvironment("CLOUDFLARE_ACCOUNT_ID");
requiredEnvironment("CLOUDFLARE_API_TOKEN");

run("npm", ["run", "web:build"]);

const generatedConfigPath = path.resolve("dist/server/wrangler.json");
const deploymentConfigPath = path.resolve("dist/server/wrangler.pulumi.json");
const config = JSON.parse(await readFile(generatedConfigPath, "utf8"));
const userDatabase = config.d1_databases?.find((binding) => binding.binding === "USER_DB");
if (!userDatabase) throw new Error("The generated Worker is missing the USER_DB binding");
userDatabase.database_id = databaseId;
config.vars = { ...config.vars, GOOGLE_CLIENT_ID: googleClientId };
config.workers_dev = false;
delete config.routes;
delete config.route;
await writeFile(deploymentConfigPath, JSON.stringify(config, null, 2) + "\n", "utf8");

run("npx", [
  "wrangler", "d1", "migrations", "apply", "USER_DB",
  "--remote", "--config", deploymentConfigPath,
]);
run("npx", ["wrangler", "deploy", "--config", deploymentConfigPath]);
run("npx", ["wrangler", "secret", "put", "METAMOB_CREDENTIALS_KEY", "--config", deploymentConfigPath], metaMobCredentialsKey + "\n");

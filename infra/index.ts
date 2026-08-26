import * as cloudflare from "@pulumi/cloudflare";
import * as command from "@pulumi/command";
import * as pulumi from "@pulumi/pulumi";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const config = new pulumi.Config();
const cloudflareConfig = new pulumi.Config("cloudflare");
const accountId = config.get("cloudflareAccountId")
  ?? process.env.CLOUDFLARE_ACCOUNT_ID
  ?? "aaf857a57ff01f7b5c961b37053782e1";
const domainName = config.get("domainName")
  ?? process.env.DOMAIN_NAME
  ?? "dofusguideweb.com";
const workerName = config.get("workerName") ?? "dofusguideweb";
const googleClientId = config.get("googleClientId")
  ?? process.env.GOOGLE_CLIENT_ID
  ?? "559765229314-g71qdbv43se29qv3hnpfr9vnsd648ra5.apps.googleusercontent.com";
const apiToken = process.env.CLOUDFLARE_API_TOKEN
  ? pulumi.secret(process.env.CLOUDFLARE_API_TOKEN)
  : cloudflareConfig.requireSecret("apiToken");
const projectRoot = path.resolve(__dirname, "..");

function hashPath(hash: ReturnType<typeof createHash>, relativePath: string): void {
  const absolutePath = path.join(projectRoot, relativePath);
  const stat = statSync(absolutePath);
  if (stat.isDirectory()) {
    for (const entry of readdirSync(absolutePath).sort()) {
      if (relativePath === "public" && entry === "generated") continue;
      hashPath(hash, path.join(relativePath, entry));
    }
    return;
  }
  hash.update(relativePath.replaceAll("\\", "/"));
  hash.update(readFileSync(absolutePath));
}

const sourceHash = createHash("sha256");
for (const source of [
  "package.json",
  "package-lock.json",
  "wrangler.jsonc",
  "vite.config.ts",
  "vite.shared.ts",
  "src/accounts",
  "src/web",
  "src/cloudflare-env.d.ts",
  "public",
  "data/dofusguide.sqlite",
  "data/dofusdb/breeds.json",
  "drizzle-user",
  "scripts/deploy-cloudflare.mjs",
]) hashPath(sourceHash, source);

const zone = cloudflare.getZoneOutput({ filter: { name: domainName } });

const userDatabase = new cloudflare.D1Database("user-database", {
  accountId,
  name: workerName + "-users",
  jurisdiction: "eu",
  readReplication: { mode: "disabled" },
});

const workerDeployment = new command.local.Command("worker-deployment", {
  dir: projectRoot,
  create: "node scripts/deploy-cloudflare.mjs",
  update: "node scripts/deploy-cloudflare.mjs",
  delete: "npx wrangler delete " + workerName + " --force",
  environment: {
    CLOUDFLARE_ACCOUNT_ID: accountId,
    CLOUDFLARE_API_TOKEN: apiToken,
    D1_DATABASE_ID: userDatabase.uuid,
    GOOGLE_CLIENT_ID: googleClientId,
  },
  triggers: [sourceHash.digest("hex"), userDatabase.uuid, googleClientId],
}, { dependsOn: [userDatabase] });

const apexDomain = new cloudflare.WorkersCustomDomain("apex-domain", {
  accountId,
  hostname: domainName,
  service: workerName,
  zoneId: zone.id,
  zoneName: domainName,
}, { dependsOn: [workerDeployment] });

const wwwDomain = new cloudflare.WorkersCustomDomain("www-domain", {
  accountId,
  hostname: "www." + domainName,
  service: workerName,
  zoneId: zone.id,
  zoneName: domainName,
}, { dependsOn: [workerDeployment] });

export const url = pulumi.interpolate`https://${apexDomain.hostname}`;
export const wwwRedirect = pulumi.interpolate`https://${wwwDomain.hostname} -> https://${apexDomain.hostname}`;
export const d1DatabaseId = userDatabase.uuid;
export const googleAuthorizedJavascriptOrigins = [
  pulumi.interpolate`https://${apexDomain.hostname}`,
  pulumi.interpolate`https://${wwwDomain.hostname}`,
  "http://localhost:3001",
  "http://localhost:3003",
];

import * as cloudflare from "@pulumi/cloudflare";
import * as command from "@pulumi/command";
import * as pulumi from "@pulumi/pulumi";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const config = new pulumi.Config();
const cloudflareConfig = new pulumi.Config("cloudflare");

function localDevelopmentVariable(name: string): string | undefined {
  try {
    const contents = readFileSync(path.resolve(__dirname, "..", ".dev.vars"), "utf8");
    const prefix = name + "=";
    const line = contents.split(/\r?\n/u).find((candidate) => candidate.startsWith(prefix));
    const value = line?.slice(prefix.length).trim();
    return value === "" ? undefined : value;
  } catch {
    return undefined;
  }
}

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
const localMetaMobCredentialsKey = process.env.METAMOB_CREDENTIALS_KEY
  ?? localDevelopmentVariable("METAMOB_CREDENTIALS_KEY");
const metaMobCredentialsKey = localMetaMobCredentialsKey
  ? pulumi.secret(localMetaMobCredentialsKey)
  : config.requireSecret("metamobCredentialsKey");
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
  "src/presence",
  "src/web",
  "src/cloudflare-env.d.ts",
  "public",
  "data/generated",
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
  // Build output can be very large. Reinjecting it into the next command's
  // environment eventually exceeds Linux's argument/environment size limit.
  addPreviousOutputInEnv: false,
  dir: projectRoot,
  create: "node scripts/deploy-cloudflare.mjs",
  update: "node scripts/deploy-cloudflare.mjs",
  environment: {
    CLOUDFLARE_ACCOUNT_ID: accountId,
    CLOUDFLARE_API_TOKEN: apiToken,
    D1_DATABASE_ID: userDatabase.uuid,
    DEPLOYMENT_SOURCE_HASH: sourceHash.digest("hex"),
    GOOGLE_CLIENT_ID: googleClientId,
    METAMOB_CREDENTIALS_KEY: metaMobCredentialsKey,
  },
}, {
  dependsOn: [userDatabase],
  // A deployment command has no backing cloud resource to destroy. Retaining it
  // also protects the Worker during the one-time transition away from triggers.
  retainOnDelete: true,
});

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

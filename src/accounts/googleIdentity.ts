import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import type { GoogleIdentity } from "./types.js";

const googleClaimsSchema = z.object({
  sub: z.string().min(1),
  email: z.string().email(),
  email_verified: z.boolean().optional(),
  name: z.string().min(1).optional(),
  picture: z.string().url().optional(),
});

const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export async function verifyGoogleCredential(credential: string, clientId: string): Promise<GoogleIdentity> {
  const result = await jwtVerify(credential, googleKeys, {
    audience: clientId,
    issuer: ["accounts.google.com", "https://accounts.google.com"],
  });
  const claims = googleClaimsSchema.parse(result.payload);
  if (claims.email_verified === false) throw new Error("L’adresse Google n’est pas vérifiée");
  return {
    subject: claims.sub,
    email: claims.email,
    displayName: claims.name ?? claims.email.split("@")[0] ?? "Joueur",
    pictureUrl: claims.picture ?? null,
  };
}

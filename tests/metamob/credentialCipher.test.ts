import { describe, expect, it } from "vitest";
import { decryptMetaMobApiKey, encryptMetaMobApiKey } from "../../src/metamob/credentialCipher.js";

describe("MetaMob credential encryption", () => {
  it("round-trips an API key with AES-GCM without storing it as plaintext", async () => {
    const encryptionKey = Buffer.alloc(32, 7).toString("base64");
    const encrypted = await encryptMetaMobApiKey("metamob-secret-api-key", encryptionKey);
    expect(encrypted.encryptedApiKey).not.toContain("metamob-secret-api-key");
    expect(encrypted.encryptionIv).not.toBe("");
    await expect(decryptMetaMobApiKey(encrypted.encryptedApiKey, encrypted.encryptionIv, encryptionKey))
      .resolves.toBe("metamob-secret-api-key");
  });

  it("rejects a key that is not 256 bits", async () => {
    await expect(encryptMetaMobApiKey("secret", Buffer.alloc(16).toString("base64")))
      .rejects.toThrow("exactement 32 octets");
  });
});

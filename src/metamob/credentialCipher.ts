const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function importKey(encodedKey: string): Promise<CryptoKey> {
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(encodedKey.trim());
  } catch {
    throw new Error("METAMOB_CREDENTIALS_KEY doit être une clé de 32 octets encodée en base64");
  }
  if (bytes.byteLength !== 32) throw new Error("METAMOB_CREDENTIALS_KEY doit contenir exactement 32 octets");
  return crypto.subtle.importKey("raw", asArrayBuffer(bytes), "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptMetaMobApiKey(apiKey: string, encodedKey: string): Promise<{ encryptedApiKey: string; encryptionIv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: asArrayBuffer(iv) }, await importKey(encodedKey), encoder.encode(apiKey));
  return { encryptedApiKey: bytesToBase64(new Uint8Array(encrypted)), encryptionIv: bytesToBase64(iv) };
}

export async function decryptMetaMobApiKey(encryptedApiKey: string, encryptionIv: string, encodedKey: string): Promise<string> {
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: asArrayBuffer(base64ToBytes(encryptionIv)) },
      await importKey(encodedKey),
      asArrayBuffer(base64ToBytes(encryptedApiKey)),
    );
    return decoder.decode(decrypted);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("METAMOB_CREDENTIALS_KEY")) throw error;
    throw new Error("Impossible de déchiffrer la clé API MetaMob", { cause: error });
  }
}

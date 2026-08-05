const STORAGE_PREFIX = "cowrypay_biometric_cred_";

function credentialKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

/**
 * The platform authenticator WebAuthn calls out to is decided by the OS, not
 * by us — same code path works on any device. This just picks the label
 * that matches what the OS itself calls it, the way Chase/PayPal/Revolut do
 * ("Face ID" on iOS, "Fingerprint" on Android) instead of a generic
 * cross-platform "Face ID / Fingerprint" slash-label.
 */
export function biometricLabel(): "Face ID" | "Fingerprint" | "Biometric login" {
  if (typeof navigator === "undefined") return "Biometric login";
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return "Face ID";
  if (/android/i.test(navigator.userAgent)) return "Fingerprint";
  return "Biometric login";
}

function bufferToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBuffer(b64url: string): ArrayBuffer {
  const padded = b64url + "=".repeat((4 - (b64url.length % 4)) % 4);
  const str = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
  return bytes.buffer;
}

export async function isBiometricAvailable(): Promise<boolean> {
  if (typeof window === "undefined" || !window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable) {
    return false;
  }
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function hasLocalBiometricCredential(userId: string): boolean {
  return typeof window !== "undefined" && !!localStorage.getItem(credentialKey(userId));
}

/**
 * Registers a platform-authenticator (Face ID / Touch ID / fingerprint)
 * WebAuthn credential purely to gate local app-unlock. The credential ID is
 * only ever stored on this device, never sent to the backend — this isn't
 * used for server-side signature verification, so it can't stand in for the
 * transaction PIN, which stays the only thing that authorizes moving money.
 */
export async function registerBiometricCredential(userId: string, email: string): Promise<void> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "CowryPay" },
      user: {
        id: new TextEncoder().encode(userId),
        name: email,
        displayName: email,
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },   // ES256
        { type: "public-key", alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
      },
      timeout: 60000,
      attestation: "none",
    },
  })) as PublicKeyCredential | null;

  if (!credential) throw new Error("Biometric setup was cancelled");
  localStorage.setItem(credentialKey(userId), bufferToBase64Url(credential.rawId));
}

/** Prompts Face ID / Touch ID / fingerprint and resolves true only if it succeeds. */
export async function verifyBiometric(userId: string): Promise<boolean> {
  const storedId = localStorage.getItem(credentialKey(userId));
  if (!storedId) return false;
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ id: base64UrlToBuffer(storedId), type: "public-key" }],
        userVerification: "required",
        timeout: 60000,
      },
    });
    return !!assertion;
  } catch {
    return false;
  }
}

export function clearBiometricCredential(userId: string): void {
  localStorage.removeItem(credentialKey(userId));
}

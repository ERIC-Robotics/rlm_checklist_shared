import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export function getAadhaarEncryptionKey() {
  const encodedKey = process.env.AADHAAR_ENCRYPTION_KEY;
  if (!encodedKey || !/^[A-Za-z0-9+/]+={0,2}$/.test(encodedKey)) {
    throw new Error("AADHAAR_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }
  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32 || key.toString("base64") !== encodedKey) {
    throw new Error("AADHAAR_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }
  return key;
}

export function encryptAadhaar(aadhaar) {
  if (!/^\d{12}$/.test(aadhaar)) {
    throw new Error("Aadhaar must contain exactly 12 digits.");
  }

  const key = getAadhaarEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(aadhaar, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptAadhaar(value) {
  const [version, encodedIv, encodedTag, encodedCiphertext, extra] = String(value ?? "").split(":");
  if (version !== "v1" || !encodedIv || !encodedTag || !encodedCiphertext || extra) {
    throw new Error("Stored Aadhaar ciphertext has an invalid format.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getAadhaarEncryptionKey(),
    Buffer.from(encodedIv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  if (!/^\d{12}$/.test(plaintext)) {
    throw new Error("Stored Aadhaar value is invalid.");
  }
  return plaintext;
}

export function encryptExternalMemberAadhaars(state) {
  const rosterQuestion = Array.isArray(state?.answers?.[5]?.externalMembers)
    ? 5
    : 4;
  const externalMembers = state?.answers?.[rosterQuestion]?.externalMembers;
  if (!Array.isArray(externalMembers)) return state;
  return {
    ...state,
    answers: {
      ...state.answers,
      [rosterQuestion]: {
        ...state.answers[rosterQuestion],
        externalMembers: externalMembers.map((member) => ({
          ...member,
          aadhaar: member.aadhaar ? encryptAadhaar(member.aadhaar) : "",
        })),
      },
    },
  };
}

export function decryptExternalMemberAadhaars(state) {
  const rosterQuestion = Array.isArray(state?.answers?.[5]?.externalMembers)
    ? 5
    : 4;
  const externalMembers = state?.answers?.[rosterQuestion]?.externalMembers;
  if (!Array.isArray(externalMembers)) return state;
  return {
    ...state,
    answers: {
      ...state.answers,
      [rosterQuestion]: {
        ...state.answers[rosterQuestion],
        externalMembers: externalMembers.map((member) => ({
          ...member,
          aadhaar: member.aadhaar
            ? member.aadhaar.startsWith("v1:")
              ? decryptAadhaar(member.aadhaar)
              : member.aadhaar
            : "",
        })),
      },
    },
  };
}

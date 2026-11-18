import { createHash } from "crypto";

/** Photo tied to the email address. A custom uploaded picture wins over Gravatar. */
export function emailPhotoUrl(email: string | null | undefined, stored: string | null | undefined): string | null {
  if (stored && !stored.includes("gravatar.com")) return stored;
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return null;
  const hash = createHash("md5").update(normalized).digest("hex");
  return `https://www.gravatar.com/avatar/${hash}?s=160&d=404`;
}

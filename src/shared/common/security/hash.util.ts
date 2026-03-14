import { createHash } from "node:crypto";

const PASSWORD_SALT = "saifute-wms-bootstrap";

export function hashText(raw: string): string {
  return createHash("sha256").update(`${PASSWORD_SALT}:${raw}`).digest("hex");
}

export function compareHash(raw: string, hashed: string): boolean {
  return hashText(raw) === hashed;
}

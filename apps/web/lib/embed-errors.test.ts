import { describe, expect, it } from "vitest";
import { embedErrorKey } from "./embed-errors";

describe("embedErrorKey (RV-04 / FX-12)", () => {
  it("maps auth/token/401 codes to the auth message", () => {
    expect(embedErrorKey("unknown-auth-error")).toBe("embed.errAuth");
    expect(embedErrorKey("auth-failed")).toBe("embed.errAuth");
    expect(embedErrorKey("TOKEN_EXPIRED")).toBe("embed.errAuth");
    expect(embedErrorKey("http-401")).toBe("embed.errAuth");
  });

  it("maps forbidden/permission/403 to the forbidden message", () => {
    expect(embedErrorKey("forbidden")).toBe("embed.errForbidden");
    expect(embedErrorKey("permission-denied")).toBe("embed.errForbidden");
    expect(embedErrorKey("http-403")).toBe("embed.errForbidden");
  });

  it("maps not-found/404 to the not-found message", () => {
    expect(embedErrorKey("not-found")).toBe("embed.errNotFound");
    expect(embedErrorKey("resource-not-found")).toBe("embed.errNotFound");
    expect(embedErrorKey("http-404")).toBe("embed.errNotFound");
  });

  it("falls back to generic for unknown / empty codes", () => {
    expect(embedErrorKey("internal-error")).toBe("embed.errGeneric");
    expect(embedErrorKey("")).toBe("embed.errGeneric");
    expect(embedErrorKey(null)).toBe("embed.errGeneric");
    expect(embedErrorKey(undefined)).toBe("embed.errGeneric");
  });
});

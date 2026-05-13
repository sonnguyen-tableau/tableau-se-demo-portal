import { describe, expect, it } from "vitest";
import { decodeJwt, decodeProtectedHeader, jwtVerify } from "jose";
import { JWT_TTL_SECONDS, mintTableauJwt } from "./mint";

const CONFIG = {
  clientId: "11111111-1111-1111-1111-111111111111",
  secretId: "22222222-2222-2222-2222-222222222222",
  secretValue: "test-secret-value-needs-min-length-of-32-bytes-aaaa",
};

describe("mintTableauJwt", () => {
  it("rejects empty scopes", async () => {
    await expect(
      mintTableauJwt(CONFIG, { sub: "u@x.com", tenantId: "t", scopes: [] }),
    ).rejects.toThrow(/at least one scope/);
  });

  it("rejects incomplete config", async () => {
    await expect(
      mintTableauJwt(
        { ...CONFIG, secretValue: "" },
        { sub: "u@x.com", tenantId: "t", scopes: ["tableau:views:embed"] },
      ),
    ).rejects.toThrow(/connected-app config/);
  });

  it("produces a verifiable token with the right header and claims", async () => {
    const jwt = await mintTableauJwt(CONFIG, {
      sub: "alice@acme.com",
      tenantId: "tenant-acme",
      scopes: ["tableau:views:embed"],
      region: "EMEA",
      groups: ["tenant-acme"],
    });
    const header = decodeProtectedHeader(jwt);
    expect(header.alg).toBe("HS256");
    expect(header.kid).toBe(CONFIG.secretId);
    expect(header.iss).toBe(CONFIG.clientId);

    const { payload } = await jwtVerify(jwt, new TextEncoder().encode(CONFIG.secretValue), {
      issuer: CONFIG.clientId,
      audience: "tableau",
    });
    expect(payload.sub).toBe("alice@acme.com");
    expect(payload.scp).toEqual(["tableau:views:embed"]);
    expect(payload.TenantId).toBe("tenant-acme");
    expect(payload.Region).toBe("EMEA");
    expect(payload["https://tableau.com/groups"]).toEqual(["tenant-acme"]);
    expect(typeof payload.jti).toBe("string");
  });

  it("caps TTL at 600 seconds even if a longer value is requested", async () => {
    const jwt = await mintTableauJwt(CONFIG, {
      sub: "u@x.com",
      tenantId: "t",
      scopes: ["tableau:views:embed"],
      ttlSeconds: 999_999,
    });
    const payload = decodeJwt(jwt);
    expect(payload.exp).toBeDefined();
    expect(payload.iat).toBeDefined();
    expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(JWT_TTL_SECONDS);
  });
});

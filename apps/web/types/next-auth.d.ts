import type { DefaultSession, DefaultUser } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      tenantId: string;
      tenantName: string;
      region?: "NA" | "EMEA" | "APAC";
      groups: string[];
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    tenantId: string;
    tenantName: string;
    region?: "NA" | "EMEA" | "APAC";
    groups: string[];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    tenantId?: string;
    tenantName?: string;
    region?: "NA" | "EMEA" | "APAC";
    groups?: string[];
  }
}

export {};

import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { env } from "@/lib/env";

const devUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  tenantId: z.string().min(1),
  tenantName: z.string().min(1),
  region: z.enum(["NA", "EMEA", "APAC"]).optional(),
  groups: z.array(z.string()).default([]),
});

type DevUser = z.infer<typeof devUserSchema>;

function loadDevUsers(): DevUser[] {
  if (env.PORTAL_ENV !== "dev") return [];
  const raw = env.DEV_USERS_JSON;
  if (!raw) return [];
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    console.warn("DEV_USERS_JSON is not valid JSON; dev sign-in disabled");
    return [];
  }
  const parsed = z.array(devUserSchema).safeParse(json);
  if (!parsed.success) {
    console.warn("DEV_USERS_JSON failed validation; dev sign-in disabled", parsed.error.issues);
    return [];
  }
  return parsed.data;
}

const devUsers = loadDevUsers();

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const authConfig: NextAuthConfig = {
  secret: env.AUTH_SECRET,
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  pages: { signIn: "/sign-in" },
  providers: [
    Credentials({
      name: "Dev credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = signInSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        // 1. Try KV-stored portal users first (works in all environments)
        try {
          const { verifyPortalUser } = await import("@/lib/portal-users");
          const kvUser = await verifyPortalUser(email, password);
          if (kvUser) {
            return {
              id: kvUser.email,
              email: kvUser.email,
              name: kvUser.email.split("@")[0] ?? kvUser.email,
              tenantId: kvUser.tenantId,
              tenantName: kvUser.tenantName,
              ...(kvUser.region ? { region: kvUser.region } : {}),
              groups: kvUser.groups,
            };
          }
        } catch {
          // KV unavailable — fall through to DEV_USERS_JSON
        }

        // 2. Fall back to DEV_USERS_JSON (dev / local only)
        if (env.PORTAL_ENV !== "dev") return null;
        const user = devUsers.find(
          (u) => u.email === email && u.password === password,
        );
        if (!user) return null;
        const displayName = user.email.split("@")[0] ?? user.email;
        return {
          id: user.email,
          email: user.email,
          name: displayName,
          tenantId: user.tenantId,
          tenantName: user.tenantName,
          ...(user.region ? { region: user.region } : {}),
          groups: user.groups,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.tenantId = user.tenantId;
        token.tenantName = user.tenantName;
        token.region = user.region;
        token.groups = user.groups;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.tenantId = (token.tenantId as string | undefined) ?? "";
        session.user.tenantName = (token.tenantName as string | undefined) ?? "";
        session.user.groups = (token.groups as string[] | undefined) ?? [];
        const region = token.region as "NA" | "EMEA" | "APAC" | undefined;
        if (region) {
          session.user.region = region;
        } else {
          delete session.user.region;
        }
      }
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

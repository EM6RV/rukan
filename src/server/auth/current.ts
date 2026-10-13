import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { getEnv } from "@/lib/env";
import { createSession, destroySession, validateSession, type SessionUser } from "./session";

// بادئة __Host- تفرض الكوكي يكون host-only وSecure، يعني ما يوصلش لواجهات المتاجر أبداً.
export const SESSION_COOKIE = () => (getEnv().NODE_ENV === "production" ? "__Host-rukn_session" : "rukn_session");

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE())?.value;
  if (!token) return null;
  return validateSession(getDb(), token);
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.platformRole !== "admin") redirect("/dashboard");
  return user;
}

export async function getClientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

export async function startSession(userId: string) {
  const h = await headers();
  const { token, expiresAt } = await createSession(getDb(), userId, {
    ip: await getClientIp(),
    userAgent: h.get("user-agent"),
  });
  (await cookies()).set(SESSION_COOKIE(), token, {
    httpOnly: true,
    secure: getEnv().NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE())?.value;
  if (token) await destroySession(getDb(), token);
  jar.delete(SESSION_COOKIE());
}

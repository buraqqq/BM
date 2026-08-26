import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { isLoginRateLimited, recordLoginAttempt } from "@/lib/rate-limit";
import { writeAuditLog } from "@/lib/audit";
import type { AdminRole } from "@/lib/enums";

// ==========================================================
// Bölüm 7 — Admin Authentication
// FAZ 0'da bulunan CRITICAL açığın (hard-coded şifre, localStorage "auth")
// yerine geçen GERÇEK server-side authentication.
//
// - Şifreler bcrypt ile hash'lenip DB'de tutulur (asla düz metin).
// - Oturum JWT tabanlı (NextAuth), httpOnly + secure cookie ile taşınır.
// - Her istekte rol, DB'deki AdminUser kaydından (jwt callback içinde,
//   login anında) alınır; isActive=false olan kullanıcılar giriş yapamaz.
// - Brute-force koruması: src/lib/rate-limit.ts (DB tabanlı, IP+e-posta).
// - Her login denemesi (başarılı/başarısız) audit log'a yazılır.
// ==========================================================

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: AdminRole;
    };
  }
}
declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: AdminRole;
  }
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 }, // 8 saat
  pages: { signIn: "/admin/login" },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "E-posta", type: "email" },
        password: { label: "Şifre", type: "password" },
      },
      async authorize(credentials, req) {
        const email = credentials?.email?.toLowerCase().trim();
        const password = credentials?.password;
        const ip =
          (req?.headers as Record<string, string> | undefined)?.["x-forwarded-for"]?.split(",")[0] ?? null;

        if (!email || !password) return null;

        if (await isLoginRateLimited(email)) {
          await writeAuditLog({
            adminUserId: null,
            action: "LOGIN_FAILED",
            entity: "Auth",
            entityId: email,
            ipAddress: ip,
            metadata: { reason: "rate_limited" },
          });
          throw new Error("RATE_LIMITED");
        }

        const admin = await prisma.adminUser.findUnique({ where: { email } });

        const passwordOk = admin ? await bcrypt.compare(password, admin.passwordHash) : false;
        const isValid = !!admin && admin.isActive && passwordOk;

        await recordLoginAttempt({ email, success: isValid, ipAddress: ip, adminUserId: admin?.id });
        await writeAuditLog({
          adminUserId: isValid ? admin!.id : null,
          action: isValid ? "LOGIN_SUCCESS" : "LOGIN_FAILED",
          entity: "Auth",
          entityId: email,
          ipAddress: ip,
          metadata: isValid ? undefined : { reason: !admin ? "no_such_user" : !admin.isActive ? "inactive" : "bad_password" },
        });

        if (!isValid || !admin) return null;

        await prisma.adminUser.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });

        return { id: admin.id, email: admin.email, name: admin.name, role: admin.role as AdminRole };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as unknown as { id: string; role: AdminRole };
        token.id = u.id;
        token.role = u.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
      }
      return session;
    },
  },
};

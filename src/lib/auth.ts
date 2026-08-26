import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { isLoginRateLimited, recordLoginAttempt } from "@/lib/rate-limit";
import { writeAuditLog } from "@/lib/audit";
import { normalizeEmail } from "@/lib/customer-auth";
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
//
// FAZ 4A — Bölüm 1/3: MÜŞTERİ (customer) girişi de bu AYNI NextAuth
// altyapısına, İKİNCİ bir CredentialsProvider olarak eklendi — "yeni ikinci
// authentication mekanizması oluşturma" talimatı, kendi token/cookie imzalama
// sistemini icat etmeyi yasaklıyor; NextAuth'un birden fazla provider
// desteklemesi ZATEN var olan, idiomatic bir özellik, bu yüzden burada
// kullanmak mimariyi yeniden yazmak DEĞİL. `id: "customer-credentials"` ile
// admin akışından (id: "credentials") tamamen ayrı, birbirine karışmayan iki
// authorize() fonksiyonu var — session/jwt artık `kind: "admin" | "customer"`
// alanıyla ayrıştırılıyor (bkz. src/lib/require-customer.ts,
// src/lib/require-admin.ts). Rate limit tablosu (LoginAttempt) zaten generic
// tasarlanmıştı (adminUserId opsiyonel) — müşteri girişleri için de AYNI
// tablo, AYNI isLoginRateLimited/recordLoginAttempt fonksiyonlarıyla
// kullanıldı (Bölüm 31 — mevcut rate-limit altyapısını kullan talimatı).
// ==========================================================

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      kind: "admin" | "customer";
      role?: AdminRole; // yalnızca kind==="admin" için dolu
    };
  }
}
declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    kind: "admin" | "customer";
    role?: AdminRole;
  }
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 }, // 8 saat — admin ve customer için ortak, bkz. FAZ4A raporu "Known limitations"
  pages: { signIn: "/admin/login" },
  providers: [
    CredentialsProvider({
      id: "credentials",
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

        return { id: admin.id, email: admin.email, name: admin.name, role: admin.role as AdminRole, kind: "admin" as const };
      },
    }),
    // FAZ 4A — Bölüm 3: müşteri girişi. Bilinçli olarak AYRI bir provider id
    // kullanıldı (admin akışıyla asla karışmasın) — genel hata mesajı
    // (Bölüm 3: "kullanıcı var/yok bilgisini dışarı sızdırma") admin
    // akışındaki AYNI desenle korunuyor: authorize null dönerse NextAuth
    // istemciye tek tip "CredentialsSignin" hatası verir, sebep sızdırılmaz.
    CredentialsProvider({
      id: "customer-credentials",
      name: "customer-credentials",
      credentials: {
        email: { label: "E-posta", type: "email" },
        password: { label: "Şifre", type: "password" },
      },
      async authorize(credentials, req) {
        const email = credentials?.email ? normalizeEmail(credentials.email) : "";
        const password = credentials?.password;
        const ip =
          (req?.headers as Record<string, string> | undefined)?.["x-forwarded-for"]?.split(",")[0] ?? null;

        if (!email || !password) return null;

        if (await isLoginRateLimited(email)) {
          throw new Error("RATE_LIMITED");
        }

        const customer = await prisma.user.findUnique({ where: { email } });
        const passwordOk = customer?.passwordHash ? await bcrypt.compare(password, customer.passwordHash) : false;
        const isValid = !!customer && passwordOk;

        // Bölüm 3 — rate-limit altyapısı customer için de kullanılıyor.
        // Not: müşteri login denemeleri AdminUser'a bağlı olmadığı için
        // writeAuditLog (AuditLog tablosu, yalnızca admin işlemleri için
        // dokümante edilmiş — bkz. src/lib/audit.ts) BİLEREK çağrılmadı;
        // brute-force koruması yine de LoginAttempt tablosu üzerinden tam
        // olarak çalışıyor (bkz. FAZ4A raporu "Known limitations").
        await recordLoginAttempt({ email, success: isValid, ipAddress: ip, adminUserId: null });

        if (!isValid || !customer) return null;

        return {
          id: customer.id,
          email: customer.email,
          name: [customer.name, customer.surname].filter(Boolean).join(" ") || customer.email,
          kind: "customer" as const,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        const u = user as unknown as { id: string; role?: AdminRole; kind: "admin" | "customer" };
        token.id = u.id;
        token.kind = u.kind;
        if (u.kind === "admin") token.role = u.role;
      }
      // FAZ 4A — Bölüm 4: profil (ad/e-posta) güncellendiğinde, JWT'deki
      // eski değerlerin bir sonraki gerçek login'e kadar bayatlamaması için
      // NextAuth'un standart `useSession().update()` mekanizması kullanıldı
      // (bkz. src/app/hesabim/page.tsx) — bu, NextAuth'un KENDİ, zaten var
      // olan bir özelliği; ayrı bir "session senkronizasyon" sistemi icat
      // edilmedi.
      if (trigger === "update" && session) {
        const s = session as { name?: string; email?: string };
        if (s.name) token.name = s.name;
        if (s.email) token.email = s.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.kind = token.kind;
        session.user.role = token.role;
        if (token.name) session.user.name = token.name;
        if (token.email) session.user.email = token.email;
      }
      return session;
    },
  },
};

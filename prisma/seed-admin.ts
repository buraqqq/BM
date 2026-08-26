/**
 * İlk (SUPER_ADMIN) kullanıcıyı oluşturur.
 * Şifre KAYNAK KODA YAZILMAZ — yalnızca .env içindeki
 * ADMIN_SEED_EMAIL / ADMIN_SEED_PASSWORD okunur, bcrypt ile hash'lenip
 * DB'ye yazılır. Script sonunda .env'den bu iki satırı silmeniz ve
 * admin panelinden şifrenizi değiştirmeniz önerilir.
 *
 * Çalıştırma: npm run seed:admin
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_SEED_EMAIL;
  const password = process.env.ADMIN_SEED_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "ADMIN_SEED_EMAIL ve ADMIN_SEED_PASSWORD .env içinde tanımlı olmalı (bkz. .env.example)."
    );
  }
  if (password.length < 10) {
    throw new Error("ADMIN_SEED_PASSWORD en az 10 karakter olmalı.");
  }

  const existing = await prisma.adminUser.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    console.log(`[seed-admin] ${email} zaten mevcut, atlanıyor.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await prisma.adminUser.create({
    data: {
      email: email.toLowerCase(),
      passwordHash,
      name: "B&M Vourla Admin",
      role: "SUPER_ADMIN",
      isActive: true,
    },
  });

  console.log(`[seed-admin] Oluşturuldu: ${admin.email} (rol: ${admin.role})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

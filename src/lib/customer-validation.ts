import { z } from "zod";
import { DELIVERY_METHODS } from "@/lib/enums";

// ==========================================================
// FAZ 4A — Bölüm 30: "Tüm mutation endpointleri server-side Zod validation
// kullanmalı." Mevcut src/lib/validation.ts admin write-endpoint'leri için
// ayrılmıştı (dosyanın kendi başlığı bunu belirtiyor) — müşteri-facing
// (account/cart) şemalar karışmasın diye AYRI bir dosyada tutuldu, aynı
// prensiple (frontend'den gelen hiçbir veri güvenilmez).
// ==========================================================

export const customerRegisterSchema = z.object({
  name: z.string().trim().min(1).max(100),
  surname: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(200),
  phone: z
    .string()
    .trim()
    .min(10)
    .max(20)
    .regex(/^[0-9+()\s-]+$/, "Telefon yalnızca rakam ve +()- karakterleri içerebilir"),
  password: z.string().min(1).max(200), // asıl güç kontrolü validatePasswordStrength() ile (bkz. customer-auth.ts) — burada yalnızca uzunluk sınırı
});

export const customerProfileUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  surname: z.string().trim().min(1).max(100).optional(),
  phone: z
    .string()
    .trim()
    .min(10)
    .max(20)
    .regex(/^[0-9+()\s-]+$/)
    .optional(),
  email: z.string().trim().email().max(200).optional(),
});

export const customerPasswordChangeSchema = z
  .object({
    currentPassword: z.string().min(1).max(200),
    newPassword: z.string().min(1).max(200),
    newPasswordConfirmation: z.string().min(1).max(200),
  })
  .refine((d) => d.newPassword === d.newPasswordConfirmation, {
    message: "Yeni şifre ve onayı eşleşmiyor",
    path: ["newPasswordConfirmation"],
  });

export const addressCreateSchema = z.object({
  title: z.string().trim().min(1).max(50),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phone: z
    .string()
    .trim()
    .min(10)
    .max(20)
    .regex(/^[0-9+()\s-]+$/),
  city: z.string().trim().min(1).max(100),
  district: z.string().trim().min(1).max(100),
  neighborhood: z.string().trim().max(150).optional().nullable(),
  addressLine: z.string().trim().min(5).max(500),
  postalCode: z.string().trim().max(10).optional().nullable(),
  country: z.string().trim().min(1).max(100).optional(),
  isDefault: z.boolean().optional(),
});

export const addressUpdateSchema = addressCreateSchema.partial();

export const cartAddItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(9999).optional(),
});

export const cartUpdateItemSchema = z.object({
  quantity: z.coerce.number().int().min(1).max(9999),
});

// ==========================================================
// FAZ 4B — Bölüm 15/25/30: POST /api/checkout/validate gövdesi.
//
// BİLEREK yalnızca `addressId` ve `deliveryMethod` kabul edilir.
// price/subtotal/total/shippingPrice/quantity gibi hiçbir alan burada
// TANIMLI DEĞİL — zod varsayılan davranışı gereği (strict() kullanılmadı)
// şemada olmayan alanlar sessizce ELENIR, istemci onları gönderse bile
// route bunları hiçbir zaman OKUYAMAZ (Bölüm 14 — "Client state source of
// truth değildir"). `deliveryMethod`, enums.ts'teki TEK kaynaktan
// (DELIVERY_METHODS) türetildiği için "HACK" gibi keyfi bir değer zod
// tarafından doğrudan reddedilir (Bölüm 18).
// ==========================================================
export const checkoutValidateSchema = z
  .object({
    addressId: z.string().min(1).optional().nullable(),
    deliveryMethod: z.enum(DELIVERY_METHODS),
  })
  .superRefine((data, ctx) => {
    // Bölüm 4/8: Kargo ile teslimatta adres ZORUNLU; Gel-Al'da değil
    // (mağazadan teslim alınıyor, kargo adresi anlamsız).
    if (data.deliveryMethod === "DELIVERY" && !data.addressId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Kargo ile teslimat için bir teslimat adresi seçmelisiniz.", path: ["addressId"] });
    }
  });

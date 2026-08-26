import { mkdir, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";

// ==========================================================
// Bölüm 17 — Image Storage
// FAZ 1: "local" sürücü, dosyaları public/uploads/<kategori>/ altına yazar.
// Gelecekte S3 uyumlu depolamaya geçiş için tek yapılması gereken:
// STORAGE_DRIVER=s3 ortam değişkenini set edip bu arayüzün "s3" dalını
// doldurmak — çağıran kodun (API route'ları) DEĞİŞMESİ GEREKMEZ.
// ==========================================================

export type StorageCategory = "products" | "banners" | "garden" | "ai-generated";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_BYTES = 8 * 1024 * 1024; // 8MB

export interface StoredFile {
  url: string;
  path: string;
  bytes: number;
  mimeType: string;
}

/**
 * Bölüm 21 — güvenli dosya yükleme: MIME whitelist, boyut sınırı,
 * rastgele dosya adı (path traversal / isim çakışması önlenir),
 * kategoriye göre izole klasör.
 */
export async function saveUploadedImage(
  category: StorageCategory,
  file: { arrayBuffer: () => Promise<ArrayBuffer>; type: string; size: number }
): Promise<StoredFile> {
  const driver = process.env.STORAGE_DRIVER ?? "local";
  if (!ALLOWED_MIME.has(file.type)) {
    throw new Error(`Desteklenmeyen dosya tipi: ${file.type}`);
  }
  if (file.size > MAX_BYTES) {
    throw new Error("Dosya boyutu 8MB sınırını aşıyor");
  }

  if (driver === "s3") {
    // FAZ 2+ için ayrılmış: S3 uyumlu istemci burada implemente edilecek.
    throw new Error("S3 storage driver henüz FAZ 1'de implemente edilmedi");
  }

  const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
  const filename = `${crypto.randomBytes(16).toString("hex")}.${ext}`;
  const basePath = process.env.STORAGE_LOCAL_PATH ?? "./public/uploads";
  const dir = path.join(process.cwd(), basePath.replace(/^\.\//, ""), category);
  await mkdir(dir, { recursive: true });
  const fullPath = path.join(dir, filename);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(fullPath, buffer);

  return {
    url: `/uploads/${category}/${filename}`,
    path: fullPath,
    bytes: file.size,
    mimeType: file.type,
  };
}

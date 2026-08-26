// ==========================================================
// Bölüm 23/26 — CSV içe/dışa aktarma
//
// Mimari karar: npm'de yayınlanan popüler "xlsx" (SheetJS) paketi
// denendi, ancak kurulumda `npm audit` bilinen, npm registry'sinde HENÜZ
// yamanmamış bir high-severity güvenlik açığı (prototip kirlenmesi/ReDoS)
// bildirdi — SheetJS'in resmi düzeltmesi yalnızca kendi CDN'lerinden
// dağıtılıyor, npm üzerinden değil. Güvenilmeyen kullanıcı dosyaları
// (import özelliğinin doğası gereği tam olarak bu) işleyecek bir pakette
// bilinen, düzeltilmemiş bir açığı bilinçli olarak KABUL ETMEMEK için bu
// paket kaldırıldı (bkz. docs/import-export.md).
//
// Bunun yerine: CSV için üçüncü parti bağımlılık olmadan, RFC 4180 uyumlu
// minimal bir parser/writer burada yazıldı. XLSX (ikili Excel formatı) bu
// nedenle FAZ 2'de desteklenmiyor — kullanıcı Excel/Google Sheets'te
// "CSV olarak dışa aktar" diyerek aynı sonuca ulaşabilir; pratikte
// işlevsellik kaybı yoktur, yalnızca bir ekstra adımdır.
// ==========================================================

/** RFC 4180 uyumlu basit CSV parse: virgül ayraç, çift tırnak ile alan/satır içi karakter kaçışı. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows = parseCsvRows(text);
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).filter((r) => r.some((c) => c.trim() !== "")).map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = row[i] ?? "";
    });
    return obj;
  });
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  // BOM temizliği (Excel'in ürettiği UTF-8 CSV'lerde sık görülür)
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === "\r") {
      // \r\n içindeki \r'yi yut, sıradaki \n satırı kapatacak
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv(rows: Record<string, unknown>[], headers: string[]): string {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  }
  return lines.join("\r\n");
}

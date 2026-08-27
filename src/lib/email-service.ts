// ==========================================================
// FAZ 10 — E-posta Bildirim Servisi.
//
// Provider/Adapter mimarisi: EMAIL_PROVIDER env değişkenine göre seçilir.
//   CONSOLE (varsayılan): e-postayı stdout'a yazar (geliştirme gözlemi).
//   MOCK   : hiçbir şey yapmaz — deterministik no-op (test ortamı).
//   RESEND : Resend REST API'ye gerçek HTTP isteği gönderir.
//
// `delivered` DÜRÜST tutulur: yalnızca gerçek bir dağıtım kanalı mesajı kabul
// ettiğinde true (RESEND 2xx). CONSOLE/MOCK gerçek teslimat yapmadığı için
// false döner — proje "uydurma veri yok" ilkesine uygun olarak "gönderildi"
// iddiası yalnızca gerçek teslimatta verilir.
// ==========================================================

export type EmailProviderName = "console" | "resend" | "mock";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailSendResult {
  /** İşlem hatasız tamamlandı mı (provider ağ/validasyon hatası vermedi mi). */
  ok: boolean;
  /** Mesaj gerçek bir dağıtım kanalı tarafından kabul edildi mi. */
  delivered: boolean;
  provider: EmailProviderName;
  error?: string;
}

export interface EmailProvider {
  readonly name: EmailProviderName;
  send(message: EmailMessage): Promise<EmailSendResult>;
}

// ----------------------------------------------------------
// Provider'lar
// ----------------------------------------------------------

export class ConsoleEmailProvider implements EmailProvider {
  readonly name = "console" as const;

  async send(message: EmailMessage): Promise<EmailSendResult> {
    // eslint-disable-next-line no-console
    console.log(`[email:console] to=${message.to} subject="${message.subject}"`);
    // eslint-disable-next-line no-console
    console.log(message.text);
    return { ok: true, delivered: false, provider: this.name };
  }
}

export class MockEmailProvider implements EmailProvider {
  readonly name = "mock" as const;

  async send(_message: EmailMessage): Promise<EmailSendResult> {
    return { ok: true, delivered: false, provider: this.name };
  }
}

export interface ResendOptions {
  apiKey?: string;
  from?: string;
  fetchFn?: typeof fetch;
  baseUrl?: string;
}

export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend" as const;
  private readonly apiKey?: string;
  private readonly from: string;
  private readonly fetchFn: typeof fetch;
  private readonly baseUrl: string;

  constructor(opts: ResendOptions) {
    this.apiKey = opts.apiKey;
    this.from = opts.from ?? "B&M Vourla <no-reply@bmvourla.com>";
    this.fetchFn = opts.fetchFn ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
    this.baseUrl = opts.baseUrl ?? "https://api.resend.com/emails";
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    if (!this.apiKey) {
      return { ok: false, delivered: false, provider: this.name, error: "RESEND_API_KEY eksik" };
    }
    try {
      const res = await this.fetchFn(this.baseUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          ...(message.html ? { html: message.html } : {}),
        }),
      });
      if (!res.ok) {
        return { ok: false, delivered: false, provider: this.name, error: `resend HTTP ${res.status}` };
      }
      return { ok: true, delivered: true, provider: this.name };
    } catch (err) {
      return { ok: false, delivered: false, provider: this.name, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

// ----------------------------------------------------------
// Provider seçimi + e-posta şablonu
// ----------------------------------------------------------

export interface EmailServiceEnv {
  EMAIL_PROVIDER?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
}

/** EMAIL_PROVIDER env'ine göre provider üretir. Varsayılan: CONSOLE. */
export function resolveProvider(env: EmailServiceEnv = process.env as EmailServiceEnv): EmailProvider {
  const name = (env.EMAIL_PROVIDER ?? "console").trim().toLowerCase();
  switch (name) {
    case "resend":
      return new ResendEmailProvider({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM });
    case "mock":
      return new MockEmailProvider();
    case "console":
    default:
      return new ConsoleEmailProvider();
  }
}

export interface AlertEmailContext {
  alertType: string;
  productName: string;
  finalPrice: number;
  targetPrice: number | null;
  stockQuantity: number | null;
}

export interface AlertEmailDraft {
  subject: string;
  text: string;
}

function formatTL(n: number): string {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(n);
}

/** Alarm tetiklenmesi için konu + gövde şablonu üretir (saf, testli). */
export function buildAlertEmail(ctx: AlertEmailContext): AlertEmailDraft {
  const isPrice = ctx.alertType === "PRICE_DROP";
  const subject = isPrice ? "Fiyat Alarmınız Tetiklendi" : "Stok Alarmınız Tetiklendi";

  const detail = isPrice && ctx.targetPrice !== null
    ? `${ctx.productName} ürününün fiyatı hedeflediğiniz ${formatTL(ctx.targetPrice)} ₺ seviyesine düştü. Güncel fiyat: ${formatTL(ctx.finalPrice)} ₺.`
    : `${ctx.productName} ürünü tekrar stokta (${ctx.stockQuantity ?? 0} adet). Güncel fiyat: ${formatTL(ctx.finalPrice)} ₺.`;

  const text = ["Merhaba,", "", detail, "", "B&M Vourla ekibi"].join("\n");
  return { subject, text };
}

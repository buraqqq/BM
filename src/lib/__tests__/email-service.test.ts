import { describe, it, expect, vi, afterEach } from "vitest";
import {
  ConsoleEmailProvider,
  MockEmailProvider,
  ResendEmailProvider,
  resolveProvider,
  buildAlertEmail,
  type EmailMessage,
} from "@/lib/email-service";

const MESSAGE: EmailMessage = {
  to: "musteri@example.com",
  subject: "Test",
  text: "Gövde",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("email-service — resolveProvider", () => {
  it("EMAIL_PROVIDER yoksa CONSOLE döner (varsayılan)", () => {
    expect(resolveProvider({})).toBeInstanceOf(ConsoleEmailProvider);
  });

  it("EMAIL_PROVIDER=mock ise MOCK döner", () => {
    expect(resolveProvider({ EMAIL_PROVIDER: "mock" })).toBeInstanceOf(MockEmailProvider);
  });

  it("EMAIL_PROVIDER=console ise CONSOLE döner", () => {
    expect(resolveProvider({ EMAIL_PROVIDER: "console" })).toBeInstanceOf(ConsoleEmailProvider);
  });

  it("EMAIL_PROVIDER=resend ise RESEND döner", () => {
    expect(resolveProvider({ EMAIL_PROVIDER: "resend", RESEND_API_KEY: "k" })).toBeInstanceOf(ResendEmailProvider);
  });

  it("bilinmeyen değer CONSOLE'a düşer", () => {
    expect(resolveProvider({ EMAIL_PROVIDER: "smtp" })).toBeInstanceOf(ConsoleEmailProvider);
  });

  it("büyük/küçük harf duyarsız", () => {
    expect(resolveProvider({ EMAIL_PROVIDER: "RESEND", RESEND_API_KEY: "k" })).toBeInstanceOf(ResendEmailProvider);
  });
});

describe("email-service — MockEmailProvider", () => {
  it("hiçbir yan etki olmadan ok:true, delivered:false döner", async () => {
    const res = await new MockEmailProvider().send(MESSAGE);
    expect(res).toEqual({ ok: true, delivered: false, provider: "mock" });
  });
});

describe("email-service — ConsoleEmailProvider", () => {
  it("stdout'a yazar, ok:true, delivered:false döner (gerçek teslimat değil)", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const res = await new ConsoleEmailProvider().send(MESSAGE);
    expect(res.ok).toBe(true);
    expect(res.delivered).toBe(false);
    expect(res.provider).toBe("console");
    expect(spy).toHaveBeenCalled();
  });
});

describe("email-service — ResendEmailProvider", () => {
  it("API key yoksa delivered:false + hata döner", async () => {
    const res = await new ResendEmailProvider({}).send(MESSAGE);
    expect(res.ok).toBe(false);
    expect(res.delivered).toBe(false);
    expect(res.error).toContain("RESEND_API_KEY");
  });

  it("2xx yanıtta delivered:true döner", async () => {
    const mockFetch = vi.fn(async () => ({ ok: true, status: 200 }));
    const res = await new ResendEmailProvider({ apiKey: "k", fetchFn: mockFetch as unknown as typeof fetch }).send(MESSAGE);
    expect(res.ok).toBe(true);
    expect(res.delivered).toBe(true);
    expect(res.provider).toBe("resend");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("resend.com");
    expect(init.method).toBe("POST");
    expect(JSON.stringify(init.headers)).toContain("Bearer k");
    const body = JSON.parse(init.body as string);
    expect(body.to).toEqual([MESSAGE.to]);
    expect(body.subject).toBe(MESSAGE.subject);
  });

  it("non-2xx yanıtta delivered:false + HTTP durum hata döner", async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 429 })) as unknown as typeof fetch;
    const res = await new ResendEmailProvider({ apiKey: "k", fetchFn }).send(MESSAGE);
    expect(res.ok).toBe(false);
    expect(res.delivered).toBe(false);
    expect(res.error).toContain("429");
  });

  it("ağ hatasında delivered:false + hata mesajı döner", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const res = await new ResendEmailProvider({ apiKey: "k", fetchFn }).send(MESSAGE);
    expect(res.ok).toBe(false);
    expect(res.delivered).toBe(false);
    expect(res.error).toContain("network down");
  });
});

describe("email-service — buildAlertEmail", () => {
  it("PRICE_DROP için fiyat konusu ve hedef fiyat içerir", () => {
    const draft = buildAlertEmail({ alertType: "PRICE_DROP", productName: "Lavanta", finalPrice: 99.9, targetPrice: 100, stockQuantity: null });
    expect(draft.subject).toBe("Fiyat Alarmınız Tetiklendi");
    expect(draft.text).toContain("Lavanta");
    expect(draft.text).toContain("99,9");
  });

  it("stok alarmı için stok konusu ve stok adedi içerir", () => {
    const draft = buildAlertEmail({ alertType: "BACK_IN_STOCK", productName: "Saksı", finalPrice: 250, targetPrice: null, stockQuantity: 12 });
    expect(draft.subject).toBe("Stok Alarmınız Tetiklendi");
    expect(draft.text).toContain("tekrar stokta");
    expect(draft.text).toContain("12 adet");
  });

  it("STOCK_RESTOCK da stok konusunu kullanır", () => {
    const draft = buildAlertEmail({ alertType: "STOCK_RESTOCK", productName: "Hortum", finalPrice: 380, targetPrice: null, stockQuantity: 5 });
    expect(draft.subject).toBe("Stok Alarmınız Tetiklendi");
  });
});

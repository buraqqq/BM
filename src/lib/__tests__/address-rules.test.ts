import { describe, it, expect } from "vitest";
import { idsToUnsetDefault, shouldForceDefault, pickPromotedDefaultId } from "@/lib/address-rules";

// FAZ 4A — Bölüm 33 ADDRESS senaryolarının saf kısmı (Test 7-10). Gerçek
// user isolation/IDOR (Test 11) DB+HTTP gerektirdiği için
// scripts/faz4a-commerce-e2e-check.ts'te doğrulanıyor.

describe("idsToUnsetDefault — Test 10: default address invariant", () => {
  it("yeni default dışında halihazırda default olan adresi işaretler", () => {
    const addresses = [
      { id: "a1", isDefault: true },
      { id: "a2", isDefault: false },
    ];
    expect(idsToUnsetDefault(addresses, "a2")).toEqual(["a1"]);
  });

  it("zaten tek default varsa ve o korunuyorsa boş dizi döner (gereksiz update yok)", () => {
    const addresses = [
      { id: "a1", isDefault: true },
      { id: "a2", isDefault: false },
    ];
    expect(idsToUnsetDefault(addresses, "a1")).toEqual([]);
  });

  it("birden fazla (tutarsız) default olsa bile hepsini yakalar", () => {
    const addresses = [
      { id: "a1", isDefault: true },
      { id: "a2", isDefault: true },
      { id: "a3", isDefault: false },
    ];
    expect(idsToUnsetDefault(addresses, "a3").sort()).toEqual(["a1", "a2"]);
  });

  it("hiç default yoksa boş dizi döner", () => {
    const addresses = [{ id: "a1", isDefault: false }];
    expect(idsToUnsetDefault(addresses, "a1")).toEqual([]);
  });
});

describe("shouldForceDefault — Test 7: ilk adres otomatik varsayılan olmalı", () => {
  it("kullanıcının hiç adresi yoksa, istek default:false olsa bile zorlar", () => {
    expect(shouldForceDefault(0, false)).toBe(true);
    expect(shouldForceDefault(0, undefined)).toBe(true);
  });
  it("kullanıcının adresi varsa ve istek default:true ise zorlar", () => {
    expect(shouldForceDefault(2, true)).toBe(true);
  });
  it("kullanıcının adresi varsa ve istek default değilse zorlamaz", () => {
    expect(shouldForceDefault(2, false)).toBe(false);
    expect(shouldForceDefault(2, undefined)).toBe(false);
  });
});

describe("pickPromotedDefaultId — Test 9: default adres silindiğinde otomatik terfi", () => {
  it("kalan adres varsa (createdAt DESC sıralı) ilkini önerir", () => {
    expect(pickPromotedDefaultId([{ id: "newest" }, { id: "older" }])).toBe("newest");
  });
  it("hiç adres kalmadıysa null döner", () => {
    expect(pickPromotedDefaultId([])).toBeNull();
  });
});

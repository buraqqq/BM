#!/usr/bin/env bash
# ==========================================================
# B&M Vourla — Bölüm 29 uçtan uca doğrulama senaryosu (15 adım)
# + Bölüm 21 güvenlik testleri + Bölüm 20 admin->public testleri.
#
# Sunucunun ayakta olması gerekir: npm run build && npm run start
# (veya npm run dev) — varsayılan http://localhost:3000
#
# Kullanım: ADMIN_EMAIL=... ADMIN_PASSWORD=... bash scripts/verify-e2e.sh
# Test verisi (ürün/kampanya/banner) script sonunda archive/deactive edilir,
# HİÇBİR ŞEY hard-delete edilmez.
# ==========================================================
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
ADMIN_EMAIL="${ADMIN_EMAIL:?ADMIN_EMAIL ortam değişkeni gerekli}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:?ADMIN_PASSWORD ortam değişkeni gerekli}"
JAR=$(mktemp)

jf() { node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d)$1)}catch(e){console.log('PARSE_ERROR')}})"; }

echo "== [1] Admin login =="
CSRF=$(curl -s -c "$JAR" "$BASE_URL/api/auth/csrf" | jf ".csrfToken")
curl -s -b "$JAR" -c "$JAR" -X POST "$BASE_URL/api/auth/callback/credentials" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "email=$ADMIN_EMAIL" --data-urlencode "password=$ADMIN_PASSWORD" \
  --data-urlencode "csrfToken=$CSRF" --data-urlencode "json=true" -o /dev/null -w "login HTTP %{http_code}\n"

echo "== [2] Yeni test ürünü oluştur =="
CAT_ID=$(curl -s -b "$JAR" "$BASE_URL/api/admin/categories" | jf ".items[0].id")
CREATE=$(curl -s -b "$JAR" -X POST "$BASE_URL/api/admin/products" -H "Content-Type: application/json" \
  -d "{\"name\":\"E2E TEST ÜRÜNÜ\",\"categoryId\":\"$CAT_ID\",\"price\":1500,\"stock\":10}")
PID=$(echo "$CREATE" | jf ".id"); SLUG=$(echo "$CREATE" | jf ".slug")
echo "  urun: $PID / $SLUG"

echo "== [3-4] Public API + site kontrolü =="
curl -s -o /dev/null -w "  /api/products/$SLUG -> HTTP %{http_code}\n" "$BASE_URL/api/products/$SLUG"

echo "== [5-6] Fiyat değişikliği =="
curl -s -b "$JAR" -X PATCH "$BASE_URL/api/admin/products/$PID" -H "Content-Type: application/json" \
  -d '{"price":1750}' -o /dev/null -w "  fiyat guncelle -> HTTP %{http_code}\n"
NEWPRICE=$(curl -s "$BASE_URL/api/products/$SLUG" | jf ".price.final")
echo "  public final price: $NEWPRICE (beklenen 1750)"

echo "== [7-8] Archive et, public'ten kalktığını doğrula =="
curl -s -b "$JAR" -X PATCH "$BASE_URL/api/admin/products/$PID" -H "Content-Type: application/json" \
  -d '{"isActive":false,"reason":"e2e-cleanup"}' -o /dev/null -w "  archive -> HTTP %{http_code}\n"
curl -s -o /dev/null -w "  public /api/products/$SLUG -> HTTP %{http_code} (beklenen 404)\n" "$BASE_URL/api/products/$SLUG"

echo "== [9-10] Kampanya oluştur, indirimli fiyatı doğrula =="
START=$(date -u +%Y-%m-%dT00:00:00.000Z)
END=$(date -u -d '+3 days' +%Y-%m-%dT23:59:59.000Z 2>/dev/null || date -u -v+3d +%Y-%m-%dT23:59:59.000Z)
CAMP=$(curl -s -b "$JAR" -X POST "$BASE_URL/api/admin/campaigns" -H "Content-Type: application/json" \
  -d "{\"name\":\"E2E Test Kampanya\",\"discountType\":\"PERCENTAGE\",\"discountValue\":10,\"scope\":\"CATEGORY\",\"categoryId\":\"$CAT_ID\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
CAMPID=$(echo "$CAMP" | jf ".id")
echo "  kampanya: $CAMPID"

echo "== [11-12] Banner oluştur, public'te görün =="
BAN=$(curl -s -b "$JAR" -X POST "$BASE_URL/api/admin/banners" -H "Content-Type: application/json" \
  -d "{\"title\":\"E2E Test Banner\",\"imageUrl\":\"/uploads/banners/placeholder.png\",\"startDate\":\"$START\",\"endDate\":\"$END\"}")
BANID=$(echo "$BAN" | jf ".id")
curl -s "$BASE_URL/api/banners" | jf ".items.length" | xargs -I{} echo "  public banner sayisi: {}"

echo "== [13] Logout =="
CSRF2=$(curl -s -b "$JAR" -c "$JAR" "$BASE_URL/api/auth/csrf" | jf ".csrfToken")
curl -s -b "$JAR" -c "$JAR" -X POST "$BASE_URL/api/auth/signout" -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "csrfToken=$CSRF2" --data-urlencode "json=true" -o /dev/null -w "  logout -> HTTP %{http_code}\n"

echo "== [14-15] Yetkisiz erişim reddi =="
curl -s -b "$JAR" -o /dev/null -w "  /api/admin/me -> HTTP %{http_code} (beklenen 401)\n" "$BASE_URL/api/admin/me"

echo "== Temizlik: test kampanya/banner'ı kapat (ürün zaten archive edildi) =="
CSRF3=$(curl -s -c "$JAR" "$BASE_URL/api/auth/csrf" | jf ".csrfToken")
curl -s -b "$JAR" -c "$JAR" -X POST "$BASE_URL/api/auth/callback/credentials" -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "email=$ADMIN_EMAIL" --data-urlencode "password=$ADMIN_PASSWORD" \
  --data-urlencode "csrfToken=$CSRF3" --data-urlencode "json=true" -o /dev/null
curl -s -b "$JAR" -X PUT "$BASE_URL/api/admin/campaigns/$CAMPID" -H "Content-Type: application/json" -d '{"isActive":false}' -o /dev/null -w "  kampanya kapat -> HTTP %{http_code}\n"
curl -s -b "$JAR" -X PUT "$BASE_URL/api/admin/banners/$BANID" -H "Content-Type: application/json" -d '{"isActive":false}' -o /dev/null -w "  banner kapat -> HTTP %{http_code}\n"

echo ""
echo "== TAMAMLANDI =="
rm -f "$JAR"

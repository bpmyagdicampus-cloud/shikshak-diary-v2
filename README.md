# Shikshak Diary v2 — Frontend (Phase 2: Responsive शुरुआत)

## के छ
- लगइन पेज (नेपाली/English छनोट, लगइनअघि नै)
- Responsive shell: desktop मा sidebar, मोबाइलमा माथि header र तल bottom nav
- भूमिका अनुसार मेनु (Super admin, Admin, …)
- Super admin: संस्था/क्याम्पस थप्ने (सुरु महिना सहित)
- Admin/Super admin: शैक्षिक वर्ष थप्ने, BS वा AD छनोट, सक्रिय वर्ष छनोट
- मिति सधैँ AD मा भण्डारण; प्रदर्शन BS/AD प्रयोगकर्ता सेटिङ अनुसार

## चलाउने (Node 20+)
1. `cp .env.example .env` र v2 **staging** Supabase को URL/anon key राख्नुहोस्।
2. `npm install`
3. `npm run dev` → browser मा http://localhost:5173
4. Production build: `npm run build`

## Supabase सेटअप
- पहिले `v2_phase1_foundation.sql` staging मा चलाउनुहोस्।
- Auth मा user बनाएर `platform_roles` मा पहिलो super admin थप्नुहोस्।

## अहिलेका सीमा (जान्नुपर्ने)
- यो कोड सिधै सुरुवातको नमुना हो; `npm install` र build मा तपाईंको वातावरणमा परीक्षण गर्नुपर्छ।
- नयाँ super admin थप्ने, प्रयोगकर्ता/विभाग/कक्षा/विषय सेटअप, डायरी, र भाषा प्रोफाइलमा सेभ — Phase 2 को अर्को चरण।
- भाषा अहिले browser मा सेभ हुन्छ; लगइन पछि profile मा सेभ गर्ने काम बाँकी।

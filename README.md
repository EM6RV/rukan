# رُكن — RUKN

> ركنك في السوق… أونلاين.

منصة SaaS متعددة المتاجر للبياعين في ليبيا. التفاصيل الكاملة في [`CLAUDE.md`](./CLAUDE.md).

## التشغيل المحلي

```bash
pnpm install
cp .env.example .env          # عدّل ADMIN_PHONE و ADMIN_PASSWORD
SEED_DEMO=1 pnpm db:setup     # migrations + بيانات مرجعية + متجر demo
pnpm dev
```

- الموقع: <http://localhost:3000> — لوحة البياع `/dashboard` — الأدمن `/admin`
- متجر تجريبي: <http://localhost:3000/s/demo> أو <http://demo.localhost:3000>
- معاينة نظام التصميم (تطوير فقط): `/design-system`
- فحص الصحة: `/api/health` (أضف `?db=1` لفحص القاعدة)

## ما تم لحد الآن

- **المرحلة 1:** الأساس (قاعدة، مصادقة، عزل المتاجر، نظام التصميم).
- **المرحلة 2:** معالج إنشاء المتجر، لوحة البياع (الرئيسية، الأقسام، المنتجات بالمتغيرات والمخزون والصور، التعديل الجماعي، الاستيراد من CSV/Excel، الإعدادات)، وفرض حدود الباقة.

## الأوامر

| الأمر | الوظيفة |
|---|---|
| `pnpm test` | الاختبارات (بما فيها اختبارات عزل المتاجر) |
| `pnpm typecheck` / `pnpm lint` | فحص الأنواع / ESLint |
| `pnpm db:generate` | توليد migration بعد تعديل `src/db/schema` |
| `pnpm db:migrate` / `pnpm db:seed` | تطبيق الـ migrations / البيانات المرجعية |
| `pnpm icons` | توليد أيقونات التطبيق من `public/brand/rukn-app-icon.png` |

## قاعدة العزل (مهمة)

بيانات أي متجر ما تتقرا ولا تتكتب إلا عبر `forStore(db, storeId)` من `src/server/tenant`. قاعدة ESLint تمنع استيراد جداول المتجر مباشرة، والاختبارات تفحص كل الجداول.

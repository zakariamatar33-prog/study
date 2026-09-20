# دليل واحد شامل — بناء APK عبر GitHub (كل شيء جاهز بالمستودع)

هذا الملف يغطي كل شيء من الصفر: الصوت بالخلفية، فيرباس، الأيقونات،
شاشة البداية. اتبع الترتيب بالضبط.

## محتويات المستودع
```
www/index.html          ← التطبيق كامل
resources/icon.png      ← أيقونة التطبيق (1024×1024، جاهزة)
resources/splash.png    ← شاشة البداية (2732×2732، جاهزة)
debug.keystore          ← مفتاح توقيع ثابت (نفسه بكل بناء)
scripts/patch-android.js← يعدّل الصلاحيات وGradle تلقائيًا أثناء البناء
.github/workflows/      ← يبني الـ APK تلقائيًا على سيرفرات GitHub
```
ما راح تحتاج تلمس أي من ملفات `scripts` أو `.github` — شغّالة تلقائيًا.

---

## الخطوة 1 — رفع المستودع
```bash
git init
git add .
git commit -m "أول رفعة"
git branch -M main
git remote add origin <رابط-المستودع-عندك>
git push -u origin main
```

## الخطوة 2 — تسجيل تطبيق أندرويد بفيرباس (مشروع study-77920)
1. Firebase Console → مشروع `study-77920` → ⚙️ إعدادات المشروع →
   Add app → Android.
2. اسم الحزمة (Package name):
   ```
   com.gakusei.japaneselearning
   ```
3. بصمة SHA-1 (جاهزة، ثابتة، من debug.keystore المرفق):
   ```
   B8:F7:A9:11:DD:8F:E5:94:3F:5E:47:9D:71:02:75:75:66:18:22:E9
   ```
4. حمّل `google-services.json` من نفس الصفحة (لا ترفعه للمستودع مباشرة).
5. Authentication → Sign-in method → تأكد إن Google مفعّل.

## الخطوة 3 — إضافة google-services.json كسرّ بـ GitHub
```bash
base64 -w0 google-services.json
```
- المستودع → Settings → Secrets and variables → Actions →
  New repository secret
- الاسم: `GOOGLE_SERVICES_JSON_B64`
- القيمة: الناتج من الأمر فوق

## الخطوة 4 — تشغيل البناء
تلقائي مع أي push، أو يدويًا: تبويب Actions → Build Android APK →
Run workflow.

## الخطوة 5 — تحميل الـ APK
بعد انتهاء البناء (٥-٨ دقائق): افتح آخر تشغيل بتبويب Actions →
Artifacts بالأسفل → حمّل `app-debug-apk`.

---

## شو يسوّي البناء تلقائيًا بكل مرة
- يولّد كل مقاسات الأيقونة وشاشة البداية لكل كثافات الشاشة (mdpi
  حتى xxxhdpi) من `resources/icon.png` و `resources/splash.png`.
- يضيف صلاحيات الصوت بالخلفية (Foreground Service) لمانفست أندرويد.
- يربط إضافة Google Services بـ Gradle.
- يستخدم نفس `debug.keystore` بكل مرة، فبصمة SHA-1 ما تتغيّر أبدًا.
- يعدّل تسجيل الدخول بجوجل ليستخدم الطريقة الأصلية (native) تلقائيًا
  داخل التطبيق المبني فقط — يبقى popup بالمتصفح العادي بدون تغيير.

## تغيير الأيقونة لاحقًا
استبدل `resources/icon.png` (1024×1024) و `resources/splash.png`
(2732×2732) بأي صورة تحبها وارفع push من جديد — البناء التالي يطبّقها
تلقائيًا بكل المقاسات.

## قبل النشر على Google Play
هذي نسخة APK بمفتاح debug (تجريبي) — تكفي للتثبيت المباشر أو
المشاركة. للنشر على المتجر لازم مفتاح release دائم منفصل، وهذي خطوة
إضافية لاحقة عند وصولك لهذي المرحلة فقط.


# מודל משק בית משותף + אבטחה מלאה

## המטרה
להפוך את האפליקציה ממצב "פתוח לכולם" (open_all RLS) לאפליקציה מאובטחת שבה אתה ושירי (וכל מי שתזמין בעתיד) חולקים נתונים, אבל אף משתמש אחר בעולם לא יכול לראות או לגעת בנתונים שלכם.

## 1. אימות (Authentication)
- הפעלת כניסה דרך **Google בלבד** (Lovable Cloud Managed).
- הסרת אופציית סיסמה/אימייל כדי לצמצם משטח התקפה.
- דף `/auth` עם כפתור "התחבר עם Google".
- בעת התחברות ראשונה: אם למשתמש אין משק בית, מוצג מסך עם שתי אופציות:
  1. **צור משק בית חדש** — יוצר household ומקבל קוד הזמנה ייחודי.
  2. **הצטרף עם קוד הזמנה** — מקליד קוד שקיבל משותף.
- כל שאר הדפים יעברו תחת `_authenticated/` (TanStack Start guard managed).

## 2. סכמת בסיס נתונים

### טבלאות חדשות
- **`households`**: `id`, `name`, `created_at`.
- **`profiles`**: `id` (= auth.users.id), `household_id`, `display_name`, `avatar_url`, `created_at`. נוצר אוטומטית ב-trigger על `auth.users`.
- **`household_invites`**: `id`, `household_id`, `code` (6 תווים ייחודי), `created_by`, `expires_at`, `used_at`, `used_by`. קוד חד-פעמי, בתוקף 7 ימים.

### פונקציות security definer
- `current_household_id()` — מחזיר את ה-household של המשתמש המחובר. נקראת מתוך כל ה-RLS policies בלי לגרום לרקורסיה.
- `redeem_invite(code text)` — מאמת קוד, משייך את המשתמש למשק הבית, מסמן את הקוד כנוצל.
- `create_household(name text)` — יוצר household + profile + invite ראשון.

### שינויים בטבלאות קיימות
- `transactions`: הוספת `household_id uuid NOT NULL` + `user_id uuid` (המשתמש שיצר). שמירה על `entered_by` enum (יונתן/שירי) לתאימות UI לאחור.
- `categories`, `tags`, `investment_accounts`: הוספת `household_id uuid NOT NULL`.
- `transaction_tags`: יתפס דרך ה-transaction (אין צורך ב-household_id).

### Migration של נתונים קיימים
- יצירת household אחד ("בית יונתן ושירי") + שיוך כל הנתונים הקיימים אליו.
- אחרי שתתחבר לראשונה בגוגל, ה-profile שלך יקושר אוטומטית לאותו household (דרך זיהוי לפי email או מסך onboarding ראשוני).

## 3. RLS Policies (החדשות)
מחליפים את כל ה-`open_all` הקיימים.

לכל טבלה עם `household_id`:
- **SELECT/INSERT/UPDATE/DELETE**: `USING (household_id = current_household_id())` + `WITH CHECK (household_id = current_household_id())`.
- ל-`authenticated` בלבד. גישת `anon` תיחסם לחלוטין.

`profiles`:
- SELECT: רק לפרופילים באותו משק בית.
- UPDATE: רק על הפרופיל של עצמך.

`households`:
- SELECT/UPDATE: רק `id = current_household_id()`.

`household_invites`:
- SELECT: רק קודים של המשק שלי.
- INSERT: רק אם household_id = שלי.
- redeem עובר דרך security-definer function (לא דרך RLS ישיר).

`transaction_tags`:
- דרך EXISTS לבדוק שה-transaction שייך למשק שלי.

GRANTs מפורשים לכל טבלה (`authenticated` + `service_role`), בלי `anon`.

## 4. שינויי קוד (Frontend)

### חדש
- `src/routes/auth.tsx` — דף כניסה עם Google.
- `src/routes/onboarding.tsx` — בחירת "צור משק בית" / "הזן קוד הזמנה".
- `src/routes/_authenticated/route.tsx` — guard מנוהל ע"י האינטגרציה.
- `src/components/HouseholdInvite.tsx` — בהגדרות, מציג קוד הזמנה לשיתוף עם שירי, כפתור "צור קוד חדש".
- `src/lib/household.ts` — hook `useHousehold()` להחזרת household + profile של המשתמש.

### שינויים
- העברת כל ה-routes הקיימים (`index`, `transactions.*`, `investments`, `settings`) לתוך `_authenticated/`.
- `src/lib/db.ts`: כל ה-inserts יוסיפו `household_id` אוטומטית (נשלף מ-profile). ה-RLS תאכוף גם בצד DB.
- `entered_by` יישאר enum 'yonatan' | 'shiri' — בהגדרות תוכל לבחור איזה משתמש אתה (נשמר ב-profile.display_name או שדה ייעודי). מי שמצטרף ראשון מקבל yonatan, השני shiri.
- Realtime ימשיך לעבוד — RLS חל גם על postgres_changes, אז שירי תראה אוטומטית את ההוצאות שלך ולהיפך.
- `__root.tsx`: הוספת `onAuthStateChange` listener שמרענן router cache ב-sign-in/sign-out.

### הגדרות
- בדף ההגדרות: סקציה "משק הבית שלי" עם:
  - שם משק הבית (עריכה).
  - רשימת חברים (אתה + שירי).
  - "הזמן בן משפחה" — מציג קוד 6 תווים להעתקה.
  - "התנתק".

## 5. מה הופך את זה למאובטח
- כל הנתונים תחת RLS שמסתמך על `auth.uid()` + שיוך ל-household.
- אין שום policy של `anon`.
- service_role לעולם לא נחשף ל-client (כבר ככה במבנה).
- קודי הזמנה חד-פעמיים עם תפוגה.
- Google OAuth = אין סיסמאות לפרוץ.
- אפילו אם מישהו ימצא את ה-publishable key ויפתח קונסול — בלי session של Google הוא לא יראה כלום, ועם session של חשבון אחר הוא יראה רק את
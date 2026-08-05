# Family Spend 

זה מCHATGPT
📄 PRD — מערכת פיננסית משפחתית חכמה

Smart Family Finance Management Platform

1. Overview

מטרת המערכת

פיתוח מערכת פיננסית פרטית וחכמה לניהול הכנסות, הוצאות, חסכונות והשקעות עבור משק בית קטן (בשלב הראשון: זוג נשוי בלבד).

המטרה המרכזית היא לאפשר שליטה מלאה על ההתנהלות הכלכלית היומיומית בצורה פשוטה, מהירה, ויזואלית ואינטואיטיבית — תוך יצירת תובנות פיננסיות אמיתיות לאורך זמן.

המערכת אינה מיועדת כרגע לשוק ציבורי רחב, אלא כמערכת פרטית אישית עבור שני משתמשים מסונכרנים בלבד.

2. Product Goals

המערכת צריכה לאפשר:

מעקב מלא אחר הכנסות והוצאות

ניהול תקציב משפחתי חודשי

ניתוח הרגלי צריכה

מעקב אחר חסכונות והשקעות

סנכרון בזמן אמת בין בני זוג

יבוא נתוני בנק בצורה חכמה

השוואות חודשיות ושנתיות

ניתוח מגמות פיננסיות

יצירת דוחות וגרפים ויזואליים

ניהול טיולים/חופשות בסגנון TravelSpend

קבלת התראות חכמות בזמן אמת

שמירה על חוויית משתמש מהירה ונקייה

3. Core Product Philosophy

Fast Input First

כל פעולה באפליקציה צריכה להיות מהירה ככל האפשר.

יעד UX:
הוספת פעולה חדשה תוך פחות מ־5 שניות.

Financial Clarity

המשתמש צריך להבין במבט אחד:

כמה כסף נכנס

כמה כסף יצא

כמה נחסך

כמה הושקע

כמה כסף פנוי נשאר

Minimalistic UI

העיצוב יתבסס על:

White Space

מינימום עומס

צבעוניות עקבית

גרפים פשוטים וברורים

Mobile First

UX בסגנון TravelSpend

4. User Types

Primary Users

User 1

בעל הבית / מנהל ראשי

User 2

בן/בת זוג

5. Permission Model

כרגע אין צורך במערכת הרשאות מורכבת.

שני המשתמשים יכולים:

להוסיף פעולות

לערוך פעולות

למחוק פעולות

לראות נתונים מלאים

לקבל התראות

בעתיד:

הרשאות לקריאה בלבד

משתמשי ילדים

משתמשים זמניים

6. Financial Structure

6.1 Transaction Types

Income

הכנסות

Expense

הוצאות רגילות

Fixed Expense

הוצאות קבועות

Savings

העברות לחיסכון

Investments

העברות להשקעות

6.2 Financial Logic

המערכת חייבת להבדיל בין:

כסף שנשרף

הוצאות רגילות

לבין:

כסף שעבר לנכס

השקעות / חסכונות

דוגמה:
העברה לקרן כספית אינה "בזבוז".

7. Core Features

7.1 Dashboard

המסך הראשי של המערכת.

Header Section

יוצג:

שם המשתמש

חודש נוכחי

יתרה חודשית

מצב תקציב

מצב חסכון

Financial Summary Cards

Total Income

סה"כ הכנסות

Total Expenses

סה"כ הוצאות

Total Savings

סה"כ חסכונות

Total Investments

סה"כ השקעות

Remaining Balance

יתרה פנויה

Visual Analytics

Expense Pie Chart

פילוח הוצאות

Monthly Trend Graph

מגמות חודשיות

Savings Trend

מגמת חסכון

Investment Growth

צמיחת השקעות

Recent Activity Feed

פעולות אחרונות

הוצאות חריגות

חיובים קרובים

התראות

7.2 Quick Add Transaction

אחד המסכים החשובים ביותר במערכת.

Required Fields

FieldDescriptionTransaction Typeסוג פעולהAmountסכוםCurrencyמטבעCategoryקטגוריהTitleשם פעולהDescriptionהערהTagsתגיותTransaction DateתאריךUserמי ביצע

UX Requirements

Numeric keyboard auto-open

Large buttons

Minimal typing

Smart suggestions

Last used currency default

Current date default

Auto category suggestions

7.3 Categories System

Main Categories

Income

Salary

Freelance

Refunds

Gifts

Home Expenses

Rent

Mortgage

Electricity

Water

Internet

Living Expenses

Supermarket

Pharmacy

Fuel

Transportation

Lifestyle

Restaurants

Coffee

Shopping

Entertainment

Investments & Savings

Trading Account

Savings Account

Pension

Crypto

Money Market Funds

7.4 Tags System

המערכת תאפשר:

יצירת תגיות

השלמה אוטומטית

חיפוש לפי תגיות

ניתוח לפי תגיות

דוגמאות:

עבודה

חופשה

זוגי

שבת

דלק

8. Recurring Transactions System

המערכת תאפשר יצירת פעולות קבועות.

Supported Frequencies

Weekly

Monthly

Quarterly

Yearly

Recurring Rules

אפשרויות:

ללא תאריך סיום

עד תאריך מסוים

עד מספר פעולות מוגדר

Examples

שכר דירה

משכורת

נטפליקס

הלוואה

גן ילדים

9. Travel / Projects Module

מודול ייעודי בסגנון TravelSpend.

Features

פתיחת טיול חדש

מטבע נפרד

תקציב טיול

משתתפים

פילוח לפי קטגוריות

מעקב הוצאות יומי

Important Logic

כל הוצאה מטיול:

תיכנס גם לסטטיסטיקת החודש הרגילה

וגם לסטטיסטיקת הטיול

ללא צורך בהזנה כפולה.

10. Investment & Savings Module

Purpose

ניהול כל הנכסים הפיננסיים במקום אחד.

Supported Assets

Trading Accounts

Savings Accounts

Pension Funds

Money Market Funds

Crypto Wallets

Emergency Funds

Dashboard

יוצג:

שווי כולל

חלוקה לפי סוג נכס

גרף צמיחה

הפקדות חודשיות

אחוז חסכון

11. Bank Import System

אחד המודולים החשובים ביותר.

11.1 Supported Formats

CSV

XLSX

Future PDF support

11.2 AI Categorization Engine

המערכת תנתח:

שם בית העסק

סכום

תיאור

תדירות

ותסווג אוטומטית.

Examples

"שופרסל" → Supermarket

"פז" → Fuel

"Netflix" → Streaming

11.3 Learning System

המערכת תלמד מהבחירות של המשתמש.

ככל שיש יותר שימוש —
הדיוק משתפר.

12. Currency & Exchange Rate Logic

המערכת תשמור שער המרה היסטורי קבוע.

Required Data

FieldDescriptionOriginal Amountסכום מקוריCurrencyמטבעHistorical Exchange Rateשער באותו יוםConverted ILS Amountערך בש"ח

Critical Rule

הנתונים ההיסטוריים לעולם לא משתנים.

13. Notifications System

Types

Budget Warning

חריגה מתקציב

Savings Risk

פגיעה ביעד חסכון

Upcoming Charges

חיובים קרובים

Monthly Summary

דוח סוף חודש

14. Monthly Closing Logic

בכל 1 לחודש:

המערכת פותחת חודש חדש

הדאשבורד מתאפס

כל ההיסטוריה נשמרת

כל הגרפים ממשיכים להצטבר

15. Analytics Module

Main Analytics

Monthly Comparison

השוואה חודשית

Category Trends

מגמות לפי קטגוריה

Spending Habits

הרגלי צריכה

Savings Rate

אחוז חסכון

Financial Growth

צמיחה פיננסית

16. Security Requirements

המערכת מנהלת מידע פיננסי פרטי ולכן האבטחה קריטית.

Requirements

JWT Authentication

Encrypted Passwords

HTTPS

Secure Cloud Storage

Database Backups

Row Level Security

Protected APIs

17. Real Time Sync

המערכת תאפשר:

סנכרון מיידי בין שני מכשירים

עדכון בזמן אמת

מניעת כפילויות

Offline Support בעתיד

18. Technical Architecture

Frontend

Recommended

React Native

Reason:

Cross Platform

Fast Development

Modern UI

Excellent Ecosystem

Backend

Recommended

Node.js + NestJS

Reason:

Scalable

Structured

Fast APIs

Real-time support

Database

PostgreSQL

Reason:

Relational structure

Financial consistency

Excellent performance

Cloud

Recommended

Supabase

Reason:

Authentication

PostgreSQL

Realtime

Storage

Fast MVP Development

AI Layer

OpenAI API

Purpose:

Categorization

Smart Suggestions

Analytics

19. Database Tables

Core Tables

users

households

household_members

categories

transactions

recurring_transactions

tags

transaction_tags

payment_methods

projects

investments

notifications

20. Future Features

OCR Receipts

צילום קבלות והזנה אוטומטית.

AI Forecasting

תחזית הוצאות עתידיות.

Smart Recommendations

המלצות לחיסכון.

Open Banking

חיבור ישיר לבנקים.

Financial Health Score

ציון פיננסי אישי.

Goals System

יעדים פיננסיים:

חופשה

רכב

דירה

קרן חירום

21. Development Phases

Phase 1 — MVP

Authentication

Transactions

Categories

Dashboard

Basic Analytics

Phase 2

Recurring Transactions

Family Sync

Notifications

Monthly Reports

Phase 3

Investments

Savings

Bank Import

AI Categorization

Phase 4

OCR

AI Forecasting

Open Banking

22. Final Product Goal

המטרה אינה רק לעקוב אחרי כסף.

המטרה היא ליצור מערכת שמאפשרת:

להבין לאן הכסף הולך

לשפר הרגלים פיננסיים

להגדיל חסכונות

לנהל השקעות בצורה מסודרת

לקבל תמונת מצב פיננסית מלאה

לבנות יציבות כלכלית לאורך זמן

וכל זה —
בצורה פשוטה, מהירה, ויזואלית ונעימה לשימוש.

זה מGEMINI
מסמך אפיון דרישות מקיף (PRD): אפליקציית ניהול פיננסי לתא המשפחתי

מטרת המערכת

יצירת מערכת מהירה, אינטואיטיבית ומסונכרנת לניהול תקציב התא המשפחתי. המערכת תשלב הזנת נתונים ידנית ואוטומטית, תתמוך בניהול כספים משותף משני מכשירים במקביל, ותפריד באופן ברור בין הוצאות שוטפות לבין צבירת הון והשקעות.

1. מסך הזנת נתונים ותנועות (Data Entry Form)

מנגנון הזנת הנתונים חייב להיות מהיר, ויזואלי ותומך בהזנה היסטורית אחורה (למשל, החל מינואר 2026).

שדהסוג קלטהתנהגות מערכתסוג הפעולהכפתור בוררחלוקה ברורה ל"הכנסה" (ירוק) או "הוצאה" (אדום).שם הפעולהטקסט קצרכותרת ראשית (לדוגמה: "סופרמרקט").קטגוריהבחירה ויזואליתבחירה מתוך גריד אייקונים כדי למנוע הקלדה מיותרת.מילות מפתח/תגיותטקסט / בחירההשלמה אוטומטית מתגיות עבר או הקלדת תגית חדשה.מידע נוסףטקסט חופשישדה (Note) להערות מורחבות למעקב.סכוםמספרמקלדת נומרית גדולה ומובנית במסך.מטבערשימה נפתחתהמטבע האחרון שהיה בשימוש יופיע כדיפולט. ניתן לשינוי ידני.תאריךבורר תאריכיםהתאריך יוגדר אוטומטית להיום. ניתן לעריכה.משתמש (מבצע)זיהוי אוטומטיתיוג אוטומטי של המכשיר/המשתמש שביצע את הפעולה.

2. מנגנון קליטת נתונים ואוטומציה (Data Ingestion & AI)

כדי לצמצם את העבודה הידנית, המערכת תאפשר יבוא המוני של נתונים וסיווג חכם.

יבוא קבצי בנק (Bank Statement Parsing): אפשרות להעלות קבצי אקסל/CSV המופקים מחשבונות הבנק וכרטיסי האשראי. המערכת תדע לזהות את עמודות הליבה (תאריך, תיאור, סכום).

אלגוריתם סיווג (AI Classification): זיהוי אוטומטי של בית העסק לפי הטקסט ושיוכו לקטגוריה המתאימה.

למידה עצמית: אם תבצע תיקון ידני לקטגוריה (למשל, שינוי מ"כללי" ל"מסעדה"), המערכת תזכור את החוקיות לעסקאות עתידיות מאותו מקור. עסקאות לא ברורות ימתינו לאישור ידני מהיר.

3. סנכרון זוגי בזמן אמת וניהול משותף (Dual-Device Sync)

המערכת ממוקדת בתא המשפחתי ומספקת תשתית אמינה לשני מכשירים מול בסיס נתונים משותף.

סנכרון ענן (Real-time Sync): ברגע שאחד מבני הזוג מזין הוצאה במכשירו, הנתון מתעדכן באופן מיידי במסך הבית (Dashboard) של המכשיר השני.

תקציב משותף: הצגת "התקציב שנותר" לחודש הנוכחי על בסיס ההכנסות המשותפות פחות ההוצאות המצטברות של שני המכשירים.

קיבוע שערי מט"ח (Historical FX): תנועות במטבע זר יקובעו לפי שער החליפין המדויק ביום ביצוע העסקה, כך שתנודות עתידיות במט"ח לא ישנו בדיעבד את הדוחות של חודשים קודמים.

4. ניהול הוצאות מחזוריות ופרויקטים (Recurring & Projects)

תשלומים קבועים: אפשרות להגדיר תנועות אוטומטיות (הכנסות או הוצאות) שיוזנו לבד בכל חודש מיום מסוים, עם אפשרות לתנאי עצירה (למשל: עד 12 תשלומים או ללא הגבלת זמן).

פרויקטים וחופשות: פתיחת "פרויקט טיול" נפרד (בדומה ל-TravelSpend). הוצאות שיוזנו תחת הטיול יוצגו בדוח ייעודי לו, אך יסתנכרנו אוטומטית כהוצאה גם לחודש הקלנדרי בו התרחשו, כדי לשמור על תזרים חודשי מדויק ולמנוע הקלדה כפולה.

5. דוחות, אנליטיקה והתראות תקציב

חודש נקי (Clean Slate): בכל 1 בחודש המסך הראשי מתאפס. התקציב הפנוי מחושב מחדש והנתונים הישנים נשמרים בהיסטוריה.

השוואות וגרפים (Visual Analytics): גרף עוגה המציג פילוח קטגוריות, והשוואה של נתוני החודש הנוכחי לחודשים קודמים כדי לאתר שיפור או הרעה במגמות ההוצאה.

סיכום חודשי למייל: שליחה אוטומטית בסיום החודש של דוח מסכם (הכנסות, הוצאות, יתרה).

התראות פגיעה בחיסכון (Alerts): אם קצב ההוצאות מסכן את יעד החיסכון החודשי שהוגדר, תישלח התראה בזמן אמת המציגה את הקטגוריות שחרגו, כדי לאפשר תיקון מסלול לפני סוף החודש.

6. מודול השקעות, חסכונות ונכסים (Investment Tracking)

הפרדה ארכיטקטונית מוחלטת בין כסף "שנשרף" (הוצאות שוטפות) לכסף "שנשמר" (בניית הון).

העברה, לא הוצאה: הפקדות כספים לחסכונות, לתיק מסחר או תוכניות חיסכון לילדים לא יירשמו כ"בזבוז" חודשי ולא יפגעו בגרף ההוצאות, אלא יסווגו כמעבר בין נכסים.

חלונית נכסים מרכזית (Asset View Widget): תצוגה מרוכזת של סך ההון המשפחתי:

יתרת עובר ושב (עו"ש)

קרנות כספיות

תיקי השקעות וניירות ערך

חסכונות ייעודיים

7. שפת עיצוב וקוד צבעים (UI/UX Color Scheme)

זיהוי ויזואלי מהיר של סוגי התנועות על בסיס צבעים קבועים לאורך כל האפליקציה (בגרפים, ברשימות ובדאשבורד).

קטגוריה / מודולצבע בממשקהסבר פונקציונליהכנסות🟢 ירוקזרימת כסף נכנסת (משכורות, החזרים, הכנסות נוספות).הוצאות בית🔵 כחולהוצאות ליבה של המגורים (משכנתא/שכירות, חשבונות, ארנונה).הוצאות שוטפות / חוץ🔴 אדוםהוצאות משתנות ופנאי (קניות בסופר, מסעדות, בילויים).הוצאות קבועות🟣 סגולהוראות קבע ומנויים (אינטרנט, ביטוחים, מנויי תוכנה).חיסכון והשקעות🟡 זהבהעברת כספים לבניית הון (תיק מסחר, כספיות, חסכונות ילדים).

צור סכמת מסד נתונים למסמך המאוחד

כתוב סיפורי משתמש לפיתוח

תכנן את מסך הבית והדאשבורד

תשאל אותי מה שאתה עוד צריך כדי שהפרוייקט יצא בצורה טובה ושלא יהיו בלבולים בינינו

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/bb2356da-1231-44ad-8b96-47330b0e3ee6).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

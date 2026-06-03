
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS emoji TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS location TEXT;

UPDATE public.categories SET emoji = m.emoji, color = m.color, sort_order = m.so
FROM (VALUES
  ('משכורת','💼','#22c55e',1),
  ('פרילנס','💻','#16a34a',2),
  ('החזרים','↩️','#15803d',3),
  ('מתנות','🎁','#10b981',4),
  ('סופרמרקט','🛒','#ef4444',1),
  ('דלק','⛽','#f97316',2),
  ('תחבורה','🚕','#f59e0b',3),
  ('בית מרקחת','💊','#ec4899',4),
  ('מסעדות','🍔','#f43f5e',5),
  ('קפה','☕','#a16207',6),
  ('קניות','🛍️','#d946ef',7),
  ('בילויים','🎬','#8b5cf6',8),
  ('משכנתא/שכירות','🏠','#3b82f6',1),
  ('חשמל','⚡','#eab308',2),
  ('מים','💧','#06b6d4',3),
  ('ארנונה','🏛️','#6366f1',4),
  ('אינטרנט','📶','#0ea5e9',5),
  ('מנויים','🔁','#a855f7',6),
  ('ביטוחים','🛡️','#64748b',7),
  ('גן/חינוך','🎓','#14b8a6',8),
  ('חיסכון','🐷','#eab308',1),
  ('קרן כספית','🏦','#84cc16',1),
  ('תיק מסחר','📈','#22c55e',2),
  ('פנסיה','🛡️','#0ea5e9',3),
  ('קריפטו','₿','#f97316',4),
  ('אינטראקטיב','🔷','#6366f1',5)
) AS m(nm, emoji, color, so)
WHERE public.categories.name = m.nm;

INSERT INTO public.categories (name, type, icon, color, emoji, sort_order)
SELECT v.name, v.type::transaction_type, v.icon, v.color, v.emoji, v.so
FROM (VALUES
  ('בונוס','income','award','#16a34a','💰',5),
  ('דיבידנד','income','trending-up','#16a34a','📊',6),
  ('רכב (תחזוקה)','expense','wrench','#dc2626','🚗',9),
  ('תחבורה ציבורית','expense','bus','#f59e0b','🚌',10),
  ('טיסות','expense','plane','#3b82f6','✈️',11),
  ('לינה','expense','bed','#ec4899','🏨',12),
  ('שתייה','expense','wine','#7c3aed','🍺',13),
  ('בריאות','expense','heart-pulse','#ef4444','🏥',14),
  ('ביגוד','expense','shirt','#f43f5e','👕',15),
  ('חיות מחמד','expense','dog','#a16207','🐶',16),
  ('טיפוח','expense','scissors','#ec4899','💇',17),
  ('ספורט','expense','dumbbell','#10b981','🏋️',18),
  ('הוצאות בית','expense','home','#64748b','🧹',19),
  ('כביסה','expense','washing-machine','#06b6d4','🧺',20),
  ('סלולר','expense','smartphone','#0ea5e9','📱',21),
  ('עמלות','expense','dollar-sign','#a855f7','💸',22),
  ('חו"ל','expense','globe','#14b8a6','🌍',23),
  ('כללי','expense','more-horizontal','#94a3b8','📦',24)
) AS v(name, type, icon, color, emoji, so)
WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.name = v.name);

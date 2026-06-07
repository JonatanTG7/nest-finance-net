UPDATE public.transactions SET type='investment' WHERE type='savings';
DELETE FROM public.categories WHERE id='222b1fb8-2de7-4c70-a9f9-081a24bfba0f';

CREATE POLICY "tx photos read"   ON storage.objects FOR SELECT USING (bucket_id = 'transaction-photos');
CREATE POLICY "tx photos insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'transaction-photos');
CREATE POLICY "tx photos update" ON storage.objects FOR UPDATE USING (bucket_id = 'transaction-photos');
CREATE POLICY "tx photos delete" ON storage.objects FOR DELETE USING (bucket_id = 'transaction-photos');

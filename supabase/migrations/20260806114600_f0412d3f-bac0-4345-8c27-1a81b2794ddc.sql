CREATE POLICY "voucher_photos_authenticated_all" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'voucher-photos')
  WITH CHECK (bucket_id = 'voucher-photos');
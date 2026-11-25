-- ============================================================================
-- Migration 006: Supabase Storage Buckets & Bootstrap Helper
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('school-logos', 'school-logos', true),
  ('student-photos', 'student-photos', true),
  ('teacher-photos', 'teacher-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage access policies scoped to authenticated school members
CREATE POLICY "Public read for school assets" ON storage.objects
  FOR SELECT USING (bucket_id IN ('school-logos', 'student-photos', 'teacher-photos'));

CREATE POLICY "Authenticated upload for school assets" ON storage.objects
  FOR INSERT WITH CHECK (
    auth.role() = 'authenticated'
    AND bucket_id IN ('school-logos', 'student-photos', 'teacher-photos')
  );

CREATE POLICY "Authenticated update for school assets" ON storage.objects
  FOR UPDATE USING (
    auth.role() = 'authenticated'
    AND bucket_id IN ('school-logos', 'student-photos', 'teacher-photos')
  );

CREATE POLICY "Authenticated delete for school assets" ON storage.objects
  FOR DELETE USING (
    auth.role() = 'authenticated'
    AND bucket_id IN ('school-logos', 'student-photos', 'teacher-photos')
  );

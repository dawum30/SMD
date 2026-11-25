-- ============================================================================
-- Migration 007: In-App User Provisioning & Role Management RPCs
-- Allows Super Admins and School Admins to add/promote Admin, Teacher,
-- and Super Admin accounts directly from inside the application.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.provision_school_user(
  p_school_id UUID,
  p_email TEXT,
  p_full_name TEXT,
  p_phone TEXT DEFAULT '',
  p_role TEXT DEFAULT 'teacher',
  p_teacher_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_confirmed BOOLEAN := FALSE;
  v_clean_email TEXT := lower(btrim(p_email));
BEGIN
  IF NOT public.is_school_admin(p_school_id) THEN
    RAISE EXCEPTION 'Only School Administrators or Super Administrators can provision school users.';
  END IF;

  IF p_role NOT IN ('super_admin', 'school_admin', 'teacher') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;

  IF p_role = 'super_admin' AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only a Super Administrator can assign Super Administrator privileges.';
  END IF;

  SELECT id, (email_confirmed_at IS NOT NULL)
  INTO v_user_id, v_confirmed
  FROM auth.users
  WHERE lower(email) = v_clean_email
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Auth account for % was not found. Please provide a password to create a new login or create the user in Authentication first.', v_clean_email;
  END IF;

  -- Confirm email automatically when provisioned by an authenticated administrator
  IF NOT COALESCE(v_confirmed, FALSE) THEN
    BEGIN
      UPDATE auth.users
      SET email_confirmed_at = COALESCE(email_confirmed_at, NOW())
      WHERE id = v_user_id;
      v_confirmed := TRUE;
    EXCEPTION WHEN OTHERS THEN
      v_confirmed := FALSE;
    END;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, phone, is_super_admin, is_active)
  VALUES (
    v_user_id,
    v_clean_email,
    COALESCE(NULLIF(btrim(p_full_name), ''), split_part(v_clean_email, '@', 1)),
    COALESCE(p_phone, ''),
    (p_role = 'super_admin'),
    TRUE
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(NULLIF(btrim(p_full_name), ''), public.profiles.full_name),
    phone = CASE WHEN COALESCE(btrim(p_phone), '') <> '' THEN p_phone ELSE public.profiles.phone END,
    is_super_admin = CASE WHEN p_role = 'super_admin' THEN TRUE ELSE public.profiles.is_super_admin END,
    is_active = TRUE;

  INSERT INTO public.school_memberships (school_id, user_id, role, is_active)
  VALUES (p_school_id, v_user_id, p_role, TRUE)
  ON CONFLICT (school_id, user_id) DO UPDATE SET
    role = EXCLUDED.role,
    is_active = TRUE;

  IF p_teacher_id IS NOT NULL THEN
    UPDATE public.teachers
    SET user_id = v_user_id
    WHERE id = p_teacher_id AND school_id = p_school_id;
  ELSIF p_role = 'teacher' THEN
    UPDATE public.teachers
    SET user_id = v_user_id
    WHERE school_id = p_school_id
      AND lower(email) = v_clean_email
      AND user_id IS NULL;
  END IF;

  RETURN jsonb_build_object(
    'user_id', v_user_id,
    'email_confirmed', v_confirmed
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.update_school_user_membership(
  p_membership_id UUID,
  p_role TEXT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_school_id UUID;
  v_user_id UUID;
  v_old_role TEXT;
  v_has_other_super BOOLEAN;
BEGIN
  SELECT school_id, user_id, role
  INTO v_school_id, v_user_id, v_old_role
  FROM public.school_memberships
  WHERE id = p_membership_id;

  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'Membership record not found.';
  END IF;

  IF NOT public.is_school_admin(v_school_id) THEN
    RAISE EXCEPTION 'Administrator access required.';
  END IF;

  IF p_role IS NOT NULL THEN
    IF p_role NOT IN ('super_admin', 'school_admin', 'teacher') THEN
      RAISE EXCEPTION 'Invalid role: %', p_role;
    END IF;
    IF (p_role = 'super_admin' OR v_old_role = 'super_admin') AND NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'Only a Super Administrator can grant or revoke Super Administrator privileges.';
    END IF;
  END IF;

  UPDATE public.school_memberships
  SET role = COALESCE(p_role, role),
      is_active = COALESCE(p_is_active, is_active),
      updated_at = NOW()
  WHERE id = p_membership_id;

  IF p_role = 'super_admin' THEN
    UPDATE public.profiles SET is_super_admin = TRUE WHERE id = v_user_id;
  ELSIF p_role IS NOT NULL AND v_old_role = 'super_admin' AND p_role <> 'super_admin' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.school_memberships
      WHERE user_id = v_user_id AND role = 'super_admin' AND is_active = TRUE
    ) INTO v_has_other_super;
    IF NOT COALESCE(v_has_other_super, FALSE) THEN
      UPDATE public.profiles SET is_super_admin = FALSE WHERE id = v_user_id;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

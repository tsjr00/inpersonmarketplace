-- M-16: Add input validation to scan_vendor_activity()
-- Validates that p_vertical_id exists in the verticals table when provided.
-- NULL is still valid (scans all verticals).

CREATE OR REPLACE FUNCTION scan_vendor_activity(p_vertical_id TEXT DEFAULT NULL)
RETURNS TABLE (
  scan_id UUID,
  vendors_scanned INTEGER,
  new_flags INTEGER,
  auto_resolved INTEGER
) AS $$
DECLARE
  v_scan_id UUID;
  v_settings RECORD;
  v_vendor RECORD;
  v_vendors_scanned INTEGER := 0;
  v_new_flags INTEGER := 0;
  v_auto_resolved INTEGER := 0;
  v_flags_by_reason JSONB := '{}';
  v_days_since_login INTEGER;
  v_days_since_order INTEGER;
  v_days_since_listing INTEGER;
  v_days_since_approval INTEGER;
  v_published_count INTEGER;
  v_last_order_date TIMESTAMPTZ;
  v_last_listing_date TIMESTAMPTZ;
  v_start_time TIMESTAMPTZ := NOW();
BEGIN
  -- Input validation: if a vertical_id is provided, verify it exists
  IF p_vertical_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM verticals WHERE vertical_id = p_vertical_id) THEN
      RAISE EXCEPTION 'Invalid vertical_id: %. Must be a valid vertical.', p_vertical_id;
    END IF;
  END IF;

  -- Create scan log entry
  INSERT INTO vendor_activity_scan_log (vertical_id, status)
  VALUES (p_vertical_id, 'running')
  RETURNING id INTO v_scan_id;

  -- Get settings (use defaults if not configured)
  SELECT
    COALESCE(vas.monitoring_enabled, TRUE) AS monitoring_enabled,
    COALESCE(vas.days_no_login_threshold, 90) AS days_no_login_threshold,
    COALESCE(vas.days_no_orders_threshold, 120) AS days_no_orders_threshold,
    COALESCE(vas.days_no_listing_activity_threshold, 180) AS days_no_listing_activity_threshold,
    COALESCE(vas.days_incomplete_onboarding_threshold, 30) AS days_incomplete_onboarding_threshold,
    COALESCE(vas.check_no_login, TRUE) AS check_no_login,
    COALESCE(vas.check_no_orders, TRUE) AS check_no_orders,
    COALESCE(vas.check_no_listing_activity, TRUE) AS check_no_listing_activity,
    COALESCE(vas.check_no_published_listings, TRUE) AS check_no_published_listings,
    COALESCE(vas.check_incomplete_onboarding, TRUE) AS check_incomplete_onboarding
  INTO v_settings
  FROM (SELECT 1) dummy
  LEFT JOIN vendor_activity_settings vas ON vas.vertical_id = COALESCE(p_vertical_id, vas.vertical_id)
  LIMIT 1;

  -- If monitoring disabled, exit early
  IF NOT v_settings.monitoring_enabled THEN
    UPDATE vendor_activity_scan_log
    SET status = 'completed',
        completed_at = NOW(),
        duration_ms = EXTRACT(MILLISECONDS FROM NOW() - v_start_time)::INTEGER
    WHERE id = v_scan_id;

    RETURN QUERY SELECT v_scan_id, 0, 0, 0;
    RETURN;
  END IF;

  -- First, auto-resolve flags for vendors that are now active
  UPDATE vendor_activity_flags vaf
  SET status = 'resolved',
      resolved_at = NOW(),
      resolution_notes = 'Auto-resolved: vendor became active'
  WHERE vaf.status = 'pending'
    AND (p_vertical_id IS NULL OR vaf.vertical_id = p_vertical_id)
    AND EXISTS (
      SELECT 1 FROM vendor_profiles vp
      WHERE vp.id = vaf.vendor_profile_id
        AND vp.last_active_at > NOW() - INTERVAL '7 days'
    );

  GET DIAGNOSTICS v_auto_resolved = ROW_COUNT;

  -- Scan approved vendors
  FOR v_vendor IN
    SELECT
      vp.id,
      vp.vertical_id,
      vp.status,
      vp.last_login_at,
      vp.last_active_at,
      vp.first_listing_at,
      vp.approved_at,
      vp.created_at
    FROM vendor_profiles vp
    WHERE vp.status = 'approved'
      AND (p_vertical_id IS NULL OR vp.vertical_id = p_vertical_id)
  LOOP
    v_vendors_scanned := v_vendors_scanned + 1;

    -- Calculate days since activities
    v_days_since_login := COALESCE(
      EXTRACT(DAY FROM NOW() - v_vendor.last_login_at)::INTEGER,
      EXTRACT(DAY FROM NOW() - v_vendor.created_at)::INTEGER
    );

    -- Get last order date for this vendor
    SELECT MAX(o.created_at) INTO v_last_order_date
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    WHERE oi.vendor_profile_id = v_vendor.id;

    v_days_since_order := COALESCE(
      EXTRACT(DAY FROM NOW() - v_last_order_date)::INTEGER,
      EXTRACT(DAY FROM NOW() - v_vendor.approved_at)::INTEGER
    );

    -- Get last listing activity
    SELECT MAX(updated_at) INTO v_last_listing_date
    FROM listings
    WHERE vendor_profile_id = v_vendor.id;

    v_days_since_listing := COALESCE(
      EXTRACT(DAY FROM NOW() - v_last_listing_date)::INTEGER,
      EXTRACT(DAY FROM NOW() - v_vendor.created_at)::INTEGER
    );

    -- Count published listings
    SELECT COUNT(*) INTO v_published_count
    FROM listings
    WHERE vendor_profile_id = v_vendor.id
      AND status = 'published';

    -- Days since approval
    v_days_since_approval := EXTRACT(DAY FROM NOW() - v_vendor.approved_at)::INTEGER;

    -- Check: No recent login
    IF v_settings.check_no_login AND v_days_since_login >= v_settings.days_no_login_threshold THEN
      INSERT INTO vendor_activity_flags (vendor_profile_id, vertical_id, reason, details)
      VALUES (
        v_vendor.id,
        v_vendor.vertical_id,
        'no_recent_login',
        jsonb_build_object(
          'days_since_login', v_days_since_login,
          'threshold', v_settings.days_no_login_threshold
        )
      )
      ON CONFLICT (vendor_profile_id, reason) WHERE status = 'pending' DO NOTHING;

      IF FOUND THEN
        v_new_flags := v_new_flags + 1;
        v_flags_by_reason := v_flags_by_reason || jsonb_build_object('no_recent_login', COALESCE((v_flags_by_reason->>'no_recent_login')::INTEGER, 0) + 1);
      END IF;
    END IF;

    -- Check: No recent orders
    IF v_settings.check_no_orders AND v_days_since_order >= v_settings.days_no_orders_threshold THEN
      INSERT INTO vendor_activity_flags (vendor_profile_id, vertical_id, reason, details)
      VALUES (
        v_vendor.id,
        v_vendor.vertical_id,
        'no_recent_orders',
        jsonb_build_object(
          'days_since_order', v_days_since_order,
          'threshold', v_settings.days_no_orders_threshold
        )
      )
      ON CONFLICT (vendor_profile_id, reason) WHERE status = 'pending' DO NOTHING;

      IF FOUND THEN
        v_new_flags := v_new_flags + 1;
        v_flags_by_reason := v_flags_by_reason || jsonb_build_object('no_recent_orders', COALESCE((v_flags_by_reason->>'no_recent_orders')::INTEGER, 0) + 1);
      END IF;
    END IF;

    -- Check: No recent listing activity
    IF v_settings.check_no_listing_activity AND v_days_since_listing >= v_settings.days_no_listing_activity_threshold THEN
      INSERT INTO vendor_activity_flags (vendor_profile_id, vertical_id, reason, details)
      VALUES (
        v_vendor.id,
        v_vendor.vertical_id,
        'no_recent_listing_activity',
        jsonb_build_object(
          'days_since_listing', v_days_since_listing,
          'threshold', v_settings.days_no_listing_activity_threshold
        )
      )
      ON CONFLICT (vendor_profile_id, reason) WHERE status = 'pending' DO NOTHING;

      IF FOUND THEN
        v_new_flags := v_new_flags + 1;
        v_flags_by_reason := v_flags_by_reason || jsonb_build_object('no_recent_listing_activity', COALESCE((v_flags_by_reason->>'no_recent_listing_activity')::INTEGER, 0) + 1);
      END IF;
    END IF;

    -- Check: No published listings
    IF v_settings.check_no_published_listings AND v_published_count = 0 AND v_days_since_approval > 14 THEN
      INSERT INTO vendor_activity_flags (vendor_profile_id, vertical_id, reason, details)
      VALUES (
        v_vendor.id,
        v_vendor.vertical_id,
        'no_published_listings',
        jsonb_build_object(
          'published_count', v_published_count,
          'days_since_approval', v_days_since_approval
        )
      )
      ON CONFLICT (vendor_profile_id, reason) WHERE status = 'pending' DO NOTHING;

      IF FOUND THEN
        v_new_flags := v_new_flags + 1;
        v_flags_by_reason := v_flags_by_reason || jsonb_build_object('no_published_listings', COALESCE((v_flags_by_reason->>'no_published_listings')::INTEGER, 0) + 1);
      END IF;
    END IF;

    -- Check: Incomplete onboarding (approved but no listings ever created)
    IF v_settings.check_incomplete_onboarding
       AND v_vendor.first_listing_at IS NULL
       AND v_days_since_approval >= v_settings.days_incomplete_onboarding_threshold THEN
      INSERT INTO vendor_activity_flags (vendor_profile_id, vertical_id, reason, details)
      VALUES (
        v_vendor.id,
        v_vendor.vertical_id,
        'incomplete_onboarding',
        jsonb_build_object(
          'days_since_approval', v_days_since_approval,
          'threshold', v_settings.days_incomplete_onboarding_threshold
        )
      )
      ON CONFLICT (vendor_profile_id, reason) WHERE status = 'pending' DO NOTHING;

      IF FOUND THEN
        v_new_flags := v_new_flags + 1;
        v_flags_by_reason := v_flags_by_reason || jsonb_build_object('incomplete_onboarding', COALESCE((v_flags_by_reason->>'incomplete_onboarding')::INTEGER, 0) + 1);
      END IF;
    END IF;

  END LOOP;

  -- Update scan log with results
  UPDATE vendor_activity_scan_log
  SET status = 'completed',
      completed_at = NOW(),
      duration_ms = EXTRACT(MILLISECONDS FROM NOW() - v_start_time)::INTEGER,
      vendors_scanned = v_vendors_scanned,
      new_flags = v_new_flags,
      auto_resolved = v_auto_resolved,
      summary = jsonb_build_object(
        'flags_by_reason', v_flags_by_reason,
        'auto_resolved', v_auto_resolved
      )
  WHERE id = v_scan_id;

  RETURN QUERY SELECT v_scan_id, v_vendors_scanned, v_new_flags, v_auto_resolved;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

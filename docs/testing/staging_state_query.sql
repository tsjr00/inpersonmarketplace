-- ============================================================================
-- STAGING STATE QUERY — who is in which situation right now (read-only)
-- Run on STAGING. Paste the whole result back; the round sheets are written
-- from it. One result set: situation · vertical · who · where · detail.
-- Columns verified against supabase/SCHEMA_SNAPSHOT.md 2026-10-09.
-- ============================================================================
WITH vp AS (
  SELECT v.id, v.user_id, v.vertical_id, v.status, v.tier, v.event_approved,
         COALESCE(v.profile_data->>'business_name', v.profile_data->>'farm_name', '(no name)') AS who_name,
         COALESCE((v.profile_data->>'multiple_trucks')::boolean, false) AS multi_location_box,
         u.email
  FROM vendor_profiles v
  LEFT JOIN user_profiles u ON u.user_id = v.user_id AND u.deleted_at IS NULL
  WHERE v.deleted_at IS NULL AND v.status = 'approved'
),
mk AS (
  SELECT m.id, m.name, m.vertical_id, m.market_type, m.state, m.manager_user_id,
         (m.manager_user_id IS NOT NULL) AS managed,
         EXISTS (SELECT 1 FROM market_booth_inventory i WHERE i.market_id = m.id AND i.weekly_price_cents > 0) AS charges_fees,
         (SELECT string_agg(DISTINCT CASE ms.day_of_week WHEN 0 THEN 'Sun' WHEN 1 THEN 'Mon' WHEN 2 THEN 'Tue' WHEN 3 THEN 'Wed' WHEN 4 THEN 'Thu' WHEN 5 THEN 'Fri' WHEN 6 THEN 'Sat' END || ' ' || to_char(ms.start_time,'HH24:MI') || '-' || to_char(ms.end_time,'HH24:MI'), ', ')
            FROM market_schedules ms WHERE ms.market_id = m.id AND ms.active) AS days
  FROM markets m
  WHERE m.active AND m.status = 'active' AND m.market_type IN ('traditional','event')
),
roster AS (
  SELECT mv.market_id, mv.vendor_profile_id, mv.approved, mv.revoked_at, mv.response_status, mv.booth_number, mv.inventory_id
  FROM market_vendors mv
),
paid_weeks AS (
  SELECT vendor_profile_id, market_id, count(*) AS n, max(week_start_date) AS latest
  FROM weekly_booth_rentals WHERE paid_at IS NOT NULL AND cancelled_at IS NULL GROUP BY 1,2
),
paid_days AS (
  SELECT vendor_profile_id, market_id, count(*) AS n, max(booking_date) AS latest
  FROM park_spot_bookings WHERE paid_at IS NOT NULL AND cancelled_at IS NULL GROUP BY 1,2
),
holds AS (
  SELECT vendor_profile_id, market_id, string_agg(status || ' ' || CASE day_of_week WHEN 0 THEN 'Sun' WHEN 1 THEN 'Mon' WHEN 2 THEN 'Tue' WHEN 3 THEN 'Wed' WHEN 4 THEN 'Thu' WHEN 5 THEN 'Fri' WHEN 6 THEN 'Sat' END, ', ') AS summary
  FROM park_standing_reservations GROUP BY 1,2
),
declared AS (
  SELECT vms.vendor_profile_id, vms.market_id,
         string_agg(CASE ms.day_of_week WHEN 0 THEN 'Sun' WHEN 1 THEN 'Mon' WHEN 2 THEN 'Tue' WHEN 3 THEN 'Wed' WHEN 4 THEN 'Thu' WHEN 5 THEN 'Fri' WHEN 6 THEN 'Sat' END, ',' ORDER BY ms.day_of_week) AS days
  FROM vendor_market_schedules vms JOIN market_schedules ms ON ms.id = vms.schedule_id
  WHERE vms.is_active GROUP BY 1,2
),
listing_counts AS (
  SELECT vendor_profile_id, count(*) FILTER (WHERE status = 'published' AND deleted_at IS NULL) AS published
  FROM listings GROUP BY 1
),
trad_market_count AS (
  SELECT l.vendor_profile_id, count(DISTINCT lm.market_id) AS n
  FROM listing_markets lm JOIN listings l ON l.id = lm.listing_id JOIN markets m ON m.id = lm.market_id
  WHERE l.deleted_at IS NULL AND m.market_type = 'traditional' GROUP BY 1
),
rows_out AS (
  -- A. every roster row of an approved vendor at an active market, with what they hold there
  SELECT 'A roster' AS situation, vp.vertical_id AS vertical, vp.who_name || ' <' || COALESCE(vp.email,'?') || '>' AS who, mk.name AS "where",
         concat_ws(' · ',
           CASE WHEN r.revoked_at IS NOT NULL THEN 'REVOKED' WHEN r.approved THEN 'approved' ELSE 'pending' END,
           CASE WHEN r.response_status IS NOT NULL THEN 'invite:' || r.response_status END,
           CASE WHEN r.booth_number IS NOT NULL THEN 'booth #' || r.booth_number END,
           CASE WHEN d.days IS NOT NULL THEN 'days ' || d.days ELSE 'no days picked' END,
           CASE WHEN pw.n IS NOT NULL THEN pw.n || ' paid week(s), latest ' || pw.latest END,
           CASE WHEN pd.n IS NOT NULL THEN pd.n || ' paid day(s), latest ' || pd.latest END,
           CASE WHEN h.summary IS NOT NULL THEN 'holds: ' || h.summary END,
           CASE WHEN mk.managed THEN 'managed' ELSE 'NO manager' END,
           CASE WHEN mk.charges_fees THEN 'charges' ELSE 'free' END,
           'tier ' || COALESCE(vp.tier,'?'),
           CASE WHEN vp.multi_location_box THEN 'box TICKED' ELSE 'box unticked' END) AS detail,
         1 AS ord
  FROM roster r JOIN vp ON vp.id = r.vendor_profile_id JOIN mk ON mk.id = r.market_id
  LEFT JOIN paid_weeks pw ON pw.vendor_profile_id = r.vendor_profile_id AND pw.market_id = r.market_id
  LEFT JOIN paid_days pd ON pd.vendor_profile_id = r.vendor_profile_id AND pd.market_id = r.market_id
  LEFT JOIN holds h ON h.vendor_profile_id = r.vendor_profile_id AND h.market_id = r.market_id
  LEFT JOIN declared d ON d.vendor_profile_id = r.vendor_profile_id AND d.market_id = r.market_id
  UNION ALL
  -- B. approved vendors with NO roster row at a managed market (candidates to apply fresh)
  SELECT 'B never applied', vp.vertical_id, vp.who_name || ' <' || COALESCE(vp.email,'?') || '>', mk.name,
         concat_ws(' · ', 'published listings ' || COALESCE(lc.published,0), 'traditional markets ' || COALESCE(tc.n,0), 'tier ' || COALESCE(vp.tier,'?'),
                   CASE WHEN vp.multi_location_box THEN 'box TICKED' ELSE 'box unticked' END, CASE WHEN mk.charges_fees THEN 'charges' ELSE 'free' END), 2
  FROM vp CROSS JOIN mk
  LEFT JOIN listing_counts lc ON lc.vendor_profile_id = vp.id
  LEFT JOIN trad_market_count tc ON tc.vendor_profile_id = vp.id
  WHERE mk.managed AND mk.market_type = 'traditional' AND mk.vertical_id = vp.vertical_id
    AND NOT EXISTS (SELECT 1 FROM roster r WHERE r.market_id = mk.id AND r.vendor_profile_id = vp.id)
  UNION ALL
  -- C. the markets themselves: manager, fees, days, state
  SELECT 'C market', mk.vertical_id, COALESCE((SELECT u.email FROM user_profiles u WHERE u.user_id = mk.manager_user_id), '(no manager)'), mk.name,
         concat_ws(' · ', mk.market_type, CASE WHEN mk.charges_fees THEN 'charges' ELSE 'free' END, 'state ' || COALESCE(mk.state,'(blank)'), 'days: ' || COALESCE(mk.days,'(none)'),
                   (SELECT 'sizes: ' || string_agg(i.size_label || ' $' || (i.weekly_price_cents/100.0), ', ') FROM market_booth_inventory i WHERE i.market_id = mk.id)), 3
  FROM mk
  UNION ALL
  -- D. vendors declared on the SAME weekday at two or more markets (conflict candidates)
  SELECT 'D same weekday x2', vp.vertical_id, vp.who_name || ' <' || COALESCE(vp.email,'?') || '>', string_agg(DISTINCT m.name, ' + '),
         concat_ws(' · ', CASE ms.day_of_week WHEN 0 THEN 'Sun' WHEN 1 THEN 'Mon' WHEN 2 THEN 'Tue' WHEN 3 THEN 'Wed' WHEN 4 THEN 'Thu' WHEN 5 THEN 'Fri' WHEN 6 THEN 'Sat' END,
                   CASE WHEN vp.multi_location_box THEN 'box TICKED' ELSE 'box unticked' END), 4
  FROM vendor_market_schedules vms JOIN market_schedules ms ON ms.id = vms.schedule_id JOIN markets m ON m.id = vms.market_id JOIN vp ON vp.id = vms.vendor_profile_id
  WHERE vms.is_active
  GROUP BY vp.vertical_id, vp.who_name, vp.email, vp.multi_location_box, ms.day_of_week
  HAVING count(DISTINCT vms.market_id) > 1
  UNION ALL
  -- E. seasons
  SELECT 'E season', m.vertical_id, s.name, m.name,
         concat_ws(' · ', s.status, s.start_date || ' → ' || s.end_date, CASE WHEN s.prepay_open THEN 'pre-sales OPEN' ELSE 'pre-sales closed' END, 'closes ' || COALESCE(s.prepay_closes_at::date::text,'?'),
                   (SELECT count(*) || ' paid season week(s)' FROM weekly_booth_rentals w WHERE w.market_id = s.market_id AND w.group_id IS NOT NULL AND w.paid_at IS NOT NULL AND w.week_start_date BETWEEN s.start_date AND s.end_date)), 5
  FROM market_seasons s JOIN markets m ON m.id = s.market_id
  UNION ALL
  -- F. market boxes with a subscriber count and the next pickup weekday
  SELECT 'F market box', o.vertical_id, vp.who_name || ' <' || COALESCE(vp.email,'?') || '>', COALESCE(m.name,'(no pickup market)'),
         concat_ws(' · ', o.name, CASE WHEN o.active THEN 'active' ELSE 'inactive' END,
                   'pickup ' || CASE o.pickup_day_of_week WHEN 0 THEN 'Sun' WHEN 1 THEN 'Mon' WHEN 2 THEN 'Tue' WHEN 3 THEN 'Wed' WHEN 4 THEN 'Thu' WHEN 5 THEN 'Fri' WHEN 6 THEN 'Sat' END,
                   (SELECT count(*) || ' subscriber(s)' FROM market_box_subscriptions sub WHERE sub.offering_id = o.id AND sub.status = 'active')), 6
  FROM market_box_offerings o JOIN vp ON vp.id = o.vendor_profile_id LEFT JOIN markets m ON m.id = o.pickup_market_id
  UNION ALL
  -- G. bundles
  SELECT 'G bundle', m.vertical_id, b.name, m.name, concat_ws(' · ', b.status, 'pickup ' || COALESCE(b.pickup_market_date::text,'?'), 'sold ' || COALESCE(b.quantity_sold,0) || '/' || COALESCE(b.quantity_limit::text,'∞')), 7
  FROM market_bundles b JOIN markets m ON m.id = b.market_id
  UNION ALL
  -- H. events not yet finished
  SELECT 'H event', c.vertical_id, c.company_name || ' <' || COALESCE(c.contact_email,'?') || '>', COALESCE((SELECT name FROM markets WHERE id = c.market_id),'(no market yet)'),
         concat_ws(' · ', c.status, c.event_date::text, 'state ' || COALESCE(c.state,'(blank)'), COALESCE(c.payment_model,'(no payment model)'), COALESCE(c.service_level,'?'),
                   (SELECT count(*) || ' vendor row(s)' FROM market_vendors mv WHERE mv.market_id = c.market_id)), 8
  FROM catering_requests c WHERE c.status NOT IN ('completed','cancelled','declined')
  UNION ALL
  -- I. event-approved vendors (who can be invited to events)
  SELECT 'I event-ready vendor', vp.vertical_id, vp.who_name || ' <' || COALESCE(vp.email,'?') || '>', '—',
         concat_ws(' · ', CASE WHEN vp.multi_location_box THEN 'box TICKED' ELSE 'box unticked' END, 'published listings ' || COALESCE(lc.published,0)), 9
  FROM vp LEFT JOIN listing_counts lc ON lc.vendor_profile_id = vp.id WHERE vp.event_approved
)
SELECT situation, vertical, who, "where", detail
FROM rows_out
ORDER BY ord, vertical, "where", who;

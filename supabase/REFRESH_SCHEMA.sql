-- REFRESH_SCHEMA.sql
-- Run this in the Supabase SQL Editor to get all schema data for SCHEMA_SNAPSHOT.md
-- Copy the FULL output and paste it back to Claude for snapshot regeneration.
--
-- Usage: Run in Supabase SQL Editor → Copy results → Paste to Claude
-- Claude will use this to rebuild the structured tables in SCHEMA_SNAPSHOT.md

-- ============================================================
-- 1. ALL TABLES
-- ============================================================
SELECT '=== TABLES ===' AS section;
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- ============================================================
-- 2. ALL COLUMNS (with types, nullability, defaults)
-- ============================================================
SELECT '=== COLUMNS ===' AS section;
SELECT
  table_name,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default,
  character_maximum_length
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;

-- ============================================================
-- 3. FOREIGN KEYS
-- ============================================================
SELECT '=== FOREIGN KEYS ===' AS section;
SELECT
  tc.table_name AS source_table,
  kcu.column_name AS source_column,
  ccu.table_name AS target_table,
  ccu.column_name AS target_column,
  tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name
  AND tc.table_schema = ccu.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.column_name;

-- ============================================================
-- 4. INDEXES
-- ============================================================
SELECT '=== INDEXES ===' AS section;
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- ============================================================
-- 5. FUNCTIONS (user-defined, not system)
-- ============================================================
SELECT '=== FUNCTIONS ===' AS section;
SELECT
  p.proname AS function_name,
  pg_get_function_arguments(p.oid) AS arguments,
  pg_get_function_result(p.oid) AS return_type,
  CASE p.prosecdef WHEN true THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END AS security,
  p.provolatile AS volatility
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
ORDER BY p.proname;

-- ============================================================
-- 6. TRIGGERS
-- ============================================================
SELECT '=== TRIGGERS ===' AS section;
SELECT
  trigger_name,
  event_object_table AS table_name,
  event_manipulation AS event,
  action_timing AS timing,
  action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- ============================================================
-- 7. CHECK CONSTRAINTS
-- ============================================================
SELECT '=== CHECK CONSTRAINTS ===' AS section;
SELECT
  tc.table_name,
  tc.constraint_name,
  cc.check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc
  ON tc.constraint_name = cc.constraint_name
  AND tc.constraint_schema = cc.constraint_schema
WHERE tc.constraint_type = 'CHECK'
  AND tc.table_schema = 'public'
  AND tc.constraint_name NOT LIKE '%_not_null'
ORDER BY tc.table_name, tc.constraint_name;

-- ============================================================
-- 8. ENUM TYPES
-- ============================================================
SELECT '=== ENUMS ===' AS section;
SELECT
  t.typname AS enum_name,
  string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS values
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
JOIN pg_namespace n ON t.typnamespace = n.oid
WHERE n.nspname = 'public'
GROUP BY t.typname
ORDER BY t.typname;

-- ============================================================
-- 9. RLS POLICIES
-- ============================================================
SELECT '=== RLS POLICIES ===' AS section;
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- ============================================================
-- 10. VIEWS
-- ============================================================
SELECT '=== VIEWS ===' AS section;
SELECT
  table_name AS view_name,
  view_definition
FROM information_schema.views
WHERE table_schema = 'public'
ORDER BY table_name;

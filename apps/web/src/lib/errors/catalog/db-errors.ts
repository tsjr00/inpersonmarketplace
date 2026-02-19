/**
 * Database Error Catalog
 *
 * Error definitions for general database operations,
 * constraint violations, and schema issues.
 */

import { ErrorCatalogEntry } from '../types'

export const DB_ERRORS: ErrorCatalogEntry[] = [
  // Constraint violations
  {
    code: 'ERR_DB_001',
    title: 'Foreign Key Violation',
    category: 'DB',
    severity: 'medium',
    description: 'Referenced record does not exist in the parent table.',
    userGuidance: 'Something went wrong saving your data. Please try again.',
    retryable: true,
    causes: [
      'Trying to insert/update with invalid foreign key reference',
      'Referenced record was deleted',
      'Wrong ID value passed',
      'Race condition - record deleted between check and insert',
    ],
    solutions: [
      'Verify the referenced record exists before operation',
      'Check the foreign key column value is correct',
      'Use transaction to ensure atomic operations',
      'Check for cascade delete settings if parent was deleted',
    ],
    pgCodes: ['23503'],
  },
  {
    code: 'ERR_DB_002',
    title: 'Unique Constraint Violation',
    category: 'DB',
    severity: 'medium',
    description: 'Record with this value already exists (duplicate key).',
    userGuidance: 'This record already exists. You may have submitted it twice.',
    selfResolvable: true,
    causes: [
      'Trying to insert duplicate unique value',
      'Email already registered',
      'Duplicate order number or reference',
      'Race condition - two requests created same record',
    ],
    solutions: [
      'Check if record exists before insert',
      'Use upsert (INSERT ... ON CONFLICT) for idempotent operations',
      'Handle error gracefully and inform user',
      'Add unique index check before operation',
    ],
    pgCodes: ['23505'],
  },
  {
    code: 'ERR_DB_003',
    title: 'Not Null Violation',
    category: 'DB',
    severity: 'medium',
    description: 'Required field is missing or null.',
    userGuidance: 'A required field is missing. Please fill in all required fields and try again.',
    selfResolvable: true,
    causes: [
      'Required field not provided in request',
      'Field validation passed but value is null',
      'Database migration added NOT NULL column',
    ],
    solutions: [
      'Check request body includes all required fields',
      'Add validation before database operation',
      'Review schema for required columns',
    ],
    pgCodes: ['23502'],
  },
  {
    code: 'ERR_DB_004',
    title: 'Check Constraint Violation',
    category: 'DB',
    severity: 'medium',
    description: 'Value does not meet CHECK constraint requirements.',
    userGuidance: 'One of your entries is outside the allowed range. Please check your input and try again.',
    selfResolvable: true,
    causes: [
      'Value out of allowed range',
      'Invalid enum value',
      'Business rule violation (e.g., quantity < 0)',
    ],
    solutions: [
      'Check column constraints in schema',
      'Validate input before database operation',
      'Review CHECK constraint definition',
    ],
    pgCodes: ['23514'],
  },

  // Schema errors
  {
    code: 'ERR_DB_010',
    title: 'Invalid Column Reference',
    category: 'DB',
    severity: 'high',
    description: 'Column does not exist in the table.',
    userGuidance: 'Something went wrong on our end. Please try refreshing the page. If the problem continues, report it below.',
    causes: [
      'Typo in column name',
      'Column was renamed or removed',
      'Migration not applied',
      'Wrong table being queried',
    ],
    solutions: [
      'Check column name spelling',
      'Verify migration has been applied',
      'Check table schema in Supabase dashboard',
      'Run pending migrations',
    ],
    pgCodes: ['42703'],
  },
  {
    code: 'ERR_DB_011',
    title: 'Function Not Found',
    category: 'DB',
    severity: 'high',
    description: 'Database function or stored procedure does not exist.',
    userGuidance: 'Something went wrong on our end. Please try again later.',
    causes: [
      'Function not created (migration not applied)',
      'Typo in function name',
      'Wrong function signature (argument types)',
      'Function was dropped',
    ],
    solutions: [
      'Check migration file for function creation',
      'Verify migration has been applied',
      'Check function name and argument types',
      'Run: SELECT * FROM pg_proc WHERE proname = function_name',
    ],
    pgCodes: ['42883'],
  },
  {
    code: 'ERR_DB_012',
    title: 'Table Not Found',
    category: 'DB',
    severity: 'critical',
    description: 'Table does not exist in the database.',
    userGuidance: 'Something went wrong on our end. Please try again later.',
    causes: [
      'Migration not applied',
      'Typo in table name',
      'Table was dropped',
      'Wrong schema being referenced',
    ],
    solutions: [
      'Run pending migrations',
      'Check table name spelling',
      'Verify table exists in Supabase dashboard',
      'Check schema qualifier (public. vs other schema)',
    ],
    pgCodes: ['42P01'],
  },

  // Data errors
  {
    code: 'ERR_DB_020',
    title: 'Invalid Data Format',
    category: 'DB',
    severity: 'medium',
    description: 'Data format is invalid for the column type.',
    userGuidance: 'The data you entered isn\'t in the right format. Please check your input and try again.',
    selfResolvable: true,
    causes: [
      'Invalid UUID format',
      'Invalid date/timestamp format',
      'Invalid JSON format',
      'String too long for column',
    ],
    solutions: [
      'Validate data format before insert',
      'Check column type in schema',
      'Use proper type conversion',
    ],
    pgCodes: ['22P02'],
  },
  {
    code: 'ERR_DB_021',
    title: 'Numeric Value Out of Range',
    category: 'DB',
    severity: 'medium',
    description: 'Numeric value exceeds column limits.',
    userGuidance: 'The number you entered is outside the allowed range. Please check your input.',
    selfResolvable: true,
    causes: [
      'Integer overflow',
      'Value exceeds decimal precision',
      'Negative value in unsigned column',
    ],
    solutions: [
      'Check column numeric limits',
      'Validate numeric range before insert',
      'Consider using larger numeric type',
    ],
    pgCodes: ['22003'],
  },

  // PostgREST errors
  {
    code: 'ERR_DB_030',
    title: 'No Rows Returned',
    category: 'DB',
    severity: 'low',
    description: 'Query expected a row but none was found.',
    userGuidance: 'The item you\'re looking for couldn\'t be found. It may have been removed.',
    causes: [
      'Record does not exist',
      'Record was deleted',
      'RLS policy filtered out the record',
      'Wrong ID or filter value',
    ],
    solutions: [
      'Check if record exists with service role',
      'Verify filter values are correct',
      'Check RLS policies for the table',
      'Handle empty result gracefully',
    ],
    pgCodes: ['PGRST116'],
  },
  {
    code: 'ERR_DB_031',
    title: 'Row Count Limit Exceeded',
    category: 'DB',
    severity: 'low',
    description: 'Query returned more rows than expected for .single().',
    userGuidance: 'Something went wrong loading your data. Please try refreshing the page.',
    retryable: true,
    causes: [
      'Multiple records match the filter',
      'Missing WHERE clause',
      'Wrong filter condition',
    ],
    solutions: [
      'Use .limit(1) or refine filter',
      'Check for duplicate records',
      'Use .maybeSingle() if multiple possible',
    ],
    pgCodes: ['PGRST301'],
  },

  // Unknown/generic
  {
    code: 'ERR_DB_UNKNOWN',
    title: 'Unknown Database Error',
    category: 'DB',
    severity: 'high',
    description: 'An unrecognized database error occurred.',
    userGuidance: 'An unexpected error occurred. If this continues, please report it below.',
    causes: [
      'New/unmapped PostgreSQL error code',
      'Network or connection issue',
      'Database server error',
    ],
    solutions: [
      'Check pgCode in error context for PostgreSQL error code',
      'Check Supabase dashboard for database logs',
      'Review pgDetail and pgHint for more information',
      'Add new error code mapping if this error recurs',
    ],
  },
]

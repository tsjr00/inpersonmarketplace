/**
 * Auth Error Catalog
 *
 * Error definitions for authentication and authorization issues.
 */

import { ErrorCatalogEntry } from '../types'

export const AUTH_ERRORS: ErrorCatalogEntry[] = [
  {
    code: 'ERR_AUTH_001',
    title: 'Not Authenticated',
    category: 'AUTH',
    severity: 'low',
    description: 'Request requires authentication but no valid session found.',
    userGuidance: 'You need to be logged in to do this. Please log in and try again.',
    selfResolvable: true,
    causes: [
      'User not logged in',
      'Session expired',
      'Invalid or missing auth token',
      'Cookies not being sent with request (CORS/same-site issues)',
    ],
    solutions: [
      'Redirect user to login page with return URL',
      'Check if cookies are being sent with request',
      'Verify Supabase auth middleware is configured',
      'Check browser devtools for cookie/auth header presence',
    ],
  },
  {
    code: 'ERR_AUTH_002',
    title: 'Insufficient Role',
    category: 'AUTH',
    severity: 'medium',
    description: 'User authenticated but lacks required role for this action.',
    userGuidance: 'You don\'t have permission to access this. If you think this is wrong, please report it below.',
    causes: [
      'User is buyer but route requires vendor role',
      'User is vendor but route requires admin role',
      'Role not set in user_profiles table',
      'roles array does not include required role',
    ],
    solutions: [
      'Check user_profiles.role and user_profiles.roles for current user',
      'Use hasRole() utility from lib/auth/roles.ts',
      'Verify user has been granted correct permissions',
      'For admin routes: ensure admin is in roles array',
    ],
  },
  {
    code: 'ERR_AUTH_003',
    title: 'Vendor Profile Not Found',
    category: 'AUTH',
    severity: 'medium',
    description: 'Authenticated user does not have a vendor profile.',
    userGuidance: 'Your vendor profile wasn\'t found. If you haven\'t signed up as a vendor yet, please complete vendor registration first.',
    selfResolvable: true,
    causes: [
      'User has vendor role but no vendor_profiles record',
      'Vendor profile was deleted or never created',
      'Wrong user account logged in',
      'Vendor onboarding not completed',
    ],
    solutions: [
      'Check vendor_profiles table for user_id = auth.uid()',
      'Ensure vendor onboarding flow was completed',
      'Verify correct account is logged in',
      'May need to redirect to vendor onboarding page',
    ],
  },
  {
    code: 'ERR_AUTH_004',
    title: 'Vertical Access Denied',
    category: 'AUTH',
    severity: 'medium',
    description: 'User does not have access to this vertical.',
    userGuidance: 'You don\'t have access to this section. You may be logged into the wrong account or vertical.',
    causes: [
      'Vertical admin trying to access different vertical',
      'Vendor registered in different vertical',
      'Vertical ID mismatch in request',
    ],
    solutions: [
      'Check vertical_admins table for user vertical assignment',
      'Verify vendor_profiles.vertical_id matches request vertical',
      'Ensure vertical parameter in URL is correct',
    ],
  },
  {
    code: 'ERR_AUTH_005',
    title: 'Session Expired',
    category: 'AUTH',
    severity: 'low',
    description: 'User session has expired and needs to re-authenticate.',
    userGuidance: 'Your session has expired. Please log out and log back in.',
    selfResolvable: true,
    causes: [
      'Session timeout reached',
      'Token refresh failed',
      'User logged out in another tab',
    ],
    solutions: [
      'Redirect to login with return URL',
      'Check Supabase session refresh configuration',
      'Ensure onAuthStateChange listener is handling session changes',
    ],
  },
]

import { z } from 'zod'
import { VALID_VERTICALS } from './vertical'

/**
 * M-3: Server-side validation for vendor signup profile_data.
 * Uses .passthrough() to allow vertical-specific fields (e.g., food truck permits).
 */
const profileDataSchema = z.object({
  business_name: z.string().max(200).optional(),
  farm_name: z.string().max(200).optional(),
  email: z.string().email('Invalid email format').max(320)
    .refine(
      (val) => /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(val),
      'Email must have a valid domain (e.g., name@example.com)'
    ),
  phone: z.string().regex(/^[\d\s\-+().]+$/, 'Invalid phone format').max(30),
  vendor_type: z.union([z.string(), z.array(z.string())]).optional(),
  description: z.string().max(2000).optional(),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(50).optional(),
  zip: z.string().max(10).optional(),
  website: z.string().url().max(500).optional().or(z.literal('')),
}).passthrough()

export const vendorSignupSchema = z.object({
  kind: z.literal('vendor_signup'),
  vertical: z.string().refine((v) => VALID_VERTICALS.has(v), 'Invalid vertical'),
  user_id: z.string().uuid().optional(),
  data: profileDataSchema,
  referral_code: z.string().max(50).optional(),
})

export type VendorSignupInput = z.infer<typeof vendorSignupSchema>

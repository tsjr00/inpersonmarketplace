'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { VerticalBranding } from '@/lib/branding'
import Link from 'next/link'

interface ListingFormProps {
  vertical: string
  vendorProfileId: string
  vendorStatus?: string
  branding: VerticalBranding
  mode: 'create' | 'edit'
  listing?: Record<string, unknown>
}

export default function ListingForm({
  vertical,
  vendorProfileId,
  vendorStatus,
  branding,
  mode,
  listing
}: ListingFormProps) {
  const router = useRouter()
  const supabase = createClient()

  // Check if vendor is pending approval (status='submitted' means awaiting approval)
  // Note: vendor_status enum values are: 'draft', 'submitted', 'approved', 'rejected', 'suspended'
  const isPendingVendor = vendorStatus === 'submitted'

  // Extract listing_data for allergen info
  const listingData = listing?.listing_data as Record<string, unknown> | null

  const [formData, setFormData] = useState({
    title: (listing?.title as string) || '',
    description: (listing?.description as string) || '',
    price: listing?.price_cents ? ((listing.price_cents as number) / 100).toFixed(2) : '',
    quantity: listing?.quantity?.toString() || '',
    category: (listing?.category as string) || '',
    // Force draft for pending vendors
    status: isPendingVendor ? 'draft' : ((listing?.status as string) || 'draft')
  })

  // Allergen tracking
  const [containsAllergens, setContainsAllergens] = useState(
    (listingData?.contains_allergens as boolean) || false
  )
  const [ingredients, setIngredients] = useState(
    (listingData?.ingredients as string) || ''
  )

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    // Validate
    if (!formData.title.trim()) {
      setError('Title is required')
      setLoading(false)
      return
    }

    // Convert price to cents
    const priceCents = formData.price
      ? Math.round(parseFloat(formData.price) * 100)
      : 0

    // Prepare data - force draft status for pending vendors
    const submitData = {
      vendor_profile_id: vendorProfileId,
      vertical_id: vertical,
      title: formData.title.trim(),
      description: formData.description.trim(),
      price_cents: priceCents,
      quantity: formData.quantity ? parseInt(formData.quantity) : null,
      category: formData.category.trim() || null,
      status: isPendingVendor ? 'draft' : formData.status,
      listing_data: {
        contains_allergens: containsAllergens,
        ingredients: containsAllergens ? ingredients.trim() : null,
      },
      updated_at: new Date().toISOString()
    }

    let result

    if (mode === 'create') {
      result = await supabase
        .from('listings')
        .insert({
          ...submitData,
          created_at: new Date().toISOString()
        })
        .select()
        .single()
    } else {
      result = await supabase
        .from('listings')
        .update(submitData)
        .eq('id', listing?.id)
        .select()
        .single()
    }

    if (result.error) {
      console.error('Listing error:', JSON.stringify(result.error, null, 2))
      const errorMessage = result.error.message || result.error.details || 'Failed to save listing. Please try again.'
      setError(errorMessage)
      setLoading(false)
      return
    }

    // Success - redirect to listings
    router.push(`/${vertical}/vendor/listings`)
    router.refresh()
  }

  // Get category options based on vertical
  // Note: These should match the config in verticals.config.listing_fields
  const getCategoryOptions = () => {
    if (vertical === 'fireworks') {
      return ['Aerial', 'Ground', 'Sparklers', 'Fountains', 'Novelty', 'Assortments', 'Other']
    } else if (vertical === 'farmers_market') {
      // Updated to match database config: Produce, Meat, Dairy, Eggs, Baked Goods, Prepared Foods, Preserves, Honey, Plants, Crafts, Other
      return ['Produce', 'Meat', 'Dairy', 'Eggs', 'Baked Goods', 'Prepared Foods', 'Preserves', 'Honey', 'Plants', 'Crafts', 'Other']
    }
    return ['General', 'Other']
  }

  return (
    <div style={{
      maxWidth: 600,
      margin: '0 auto',
      padding: 30,
      backgroundColor: 'white',
      color: '#333',
      border: `1px solid ${branding.colors.secondary}`,
      borderRadius: 8
    }}>
      {/* Pending vendor notice */}
      {isPendingVendor && (
        <div style={{
          padding: 15,
          marginBottom: 20,
          backgroundColor: '#fefce8',
          border: '1px solid #fde047',
          borderRadius: 6,
          color: '#854d0e'
        }}>
          <strong>Note:</strong> Your vendor account is pending approval. Listings will be saved as drafts and can be published once your account is approved.
        </div>
      )}

      {error && (
        <div style={{
          padding: 10,
          marginBottom: 20,
          backgroundColor: '#fee',
          border: '1px solid #fcc',
          borderRadius: 4,
          color: '#c00'
        }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Title */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: 5, fontWeight: 600 }}>
            Title <span style={{ color: '#c00' }}>*</span>
          </label>
          <input
            type="text"
            name="title"
            value={formData.title}
            onChange={handleChange}
            required
            disabled={loading}
            placeholder="e.g., Fresh Organic Tomatoes"
            style={{
              width: '100%',
              padding: 10,
              fontSize: 16,
              border: `1px solid ${branding.colors.primary}`,
              borderRadius: 4,
              boxSizing: 'border-box'
            }}
          />
        </div>

        {/* Description */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: 5, fontWeight: 600 }}>
            Description
          </label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            disabled={loading}
            rows={4}
            placeholder="Describe your product or service..."
            style={{
              width: '100%',
              padding: 10,
              fontSize: 16,
              border: `1px solid ${branding.colors.primary}`,
              borderRadius: 4,
              resize: 'vertical',
              boxSizing: 'border-box'
            }}
          />
          <p style={{ fontSize: 13, color: '#666', marginTop: 6, lineHeight: 1.4 }}>
            Include: what it is, variety/type, quantity (size, count, or weight), and any special qualities.
            {vertical === 'farmers_market' && (
              <><br /><strong>If your product contains potential allergens</strong>, check the allergen box below and list the ingredients.</>
            )}
          </p>
        </div>

        {/* Allergen Section - only for farmers market */}
        {vertical === 'farmers_market' && (
          <div style={{ marginBottom: 20 }}>
            {/* Allergen Checkbox */}
            <label style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              cursor: 'pointer',
              padding: 12,
              backgroundColor: containsAllergens ? '#fef3c7' : '#f9fafb',
              border: `1px solid ${containsAllergens ? '#f59e0b' : '#e5e7eb'}`,
              borderRadius: 6
            }}>
              <input
                type="checkbox"
                checked={containsAllergens}
                onChange={(e) => setContainsAllergens(e.target.checked)}
                disabled={loading}
                style={{ marginTop: 3, width: 18, height: 18 }}
              />
              <div>
                <span style={{ fontWeight: 600 }}>This product may contain allergens</span>
                <p style={{ fontSize: 13, color: '#666', margin: '4px 0 0 0' }}>
                  Check this if your product contains ingredients that may cause allergic reactions
                  (e.g., nuts, dairy, gluten, eggs, soy, shellfish)
                </p>
              </div>
            </label>

            {/* Ingredients Field - shown when allergen checkbox is checked */}
            {containsAllergens && (
              <div style={{ marginTop: 12, marginLeft: 28 }}>
                <label style={{ display: 'block', marginBottom: 5, fontWeight: 600 }}>
                  Ingredients / Allergen Information
                </label>
                <textarea
                  value={ingredients}
                  onChange={(e) => setIngredients(e.target.value)}
                  disabled={loading}
                  rows={3}
                  placeholder="List ingredients, especially those that may cause allergic reactions..."
                  style={{
                    width: '100%',
                    padding: 10,
                    fontSize: 16,
                    border: '1px solid #f59e0b',
                    borderRadius: 4,
                    resize: 'vertical',
                    boxSizing: 'border-box'
                  }}
                />
                <p style={{ fontSize: 12, color: '#666', marginTop: 5 }}>
                  List all ingredients OR at minimum the common allergens: nuts, peanuts, dairy, eggs, wheat/gluten, soy, fish, shellfish.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Price & Quantity Row */}
        <div style={{ display: 'flex', gap: 20, marginBottom: 20 }}>
          {/* Price */}
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: 5, fontWeight: 600 }}>
              Price ($)
            </label>
            <input
              type="number"
              name="price"
              value={formData.price}
              onChange={handleChange}
              disabled={loading}
              min="0"
              step="0.01"
              placeholder="0.00"
              style={{
                width: '100%',
                padding: 10,
                fontSize: 16,
                border: `1px solid ${branding.colors.primary}`,
                borderRadius: 4,
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Quantity */}
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: 5, fontWeight: 600 }}>
              Quantity Available
            </label>
            <input
              type="number"
              name="quantity"
              value={formData.quantity}
              onChange={handleChange}
              disabled={loading}
              min="0"
              placeholder="Leave blank for unlimited"
              style={{
                width: '100%',
                padding: 10,
                fontSize: 16,
                border: `1px solid ${branding.colors.primary}`,
                borderRadius: 4,
                boxSizing: 'border-box'
              }}
            />
          </div>
        </div>

        {/* Category */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: 5, fontWeight: 600 }}>
            Category
          </label>
          <select
            name="category"
            value={formData.category}
            onChange={handleChange}
            disabled={loading}
            style={{
              width: '100%',
              padding: 10,
              fontSize: 16,
              border: `1px solid ${branding.colors.primary}`,
              borderRadius: 4,
              backgroundColor: 'white',
              boxSizing: 'border-box'
            }}
          >
            <option value="">Select a category</option>
            {getCategoryOptions().map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        {/* Status - only show full options for approved vendors */}
        {!isPendingVendor ? (
          <div style={{ marginBottom: 30 }}>
            <label style={{ display: 'block', marginBottom: 5, fontWeight: 600 }}>
              Status
            </label>
            <select
              name="status"
              value={formData.status}
              onChange={handleChange}
              disabled={loading}
              style={{
                width: '100%',
                padding: 10,
                fontSize: 16,
                border: `1px solid ${branding.colors.primary}`,
                borderRadius: 4,
                backgroundColor: 'white',
                boxSizing: 'border-box'
              }}
            >
              <option value="draft">Draft (not visible to buyers)</option>
              <option value="published">Published (visible to buyers)</option>
              <option value="paused">Paused (temporarily hidden)</option>
              <option value="archived">Archived</option>
            </select>
            <p style={{ fontSize: 12, color: '#666', marginTop: 5 }}>
              Draft listings are only visible to you. Set to Published when ready to sell.
            </p>
          </div>
        ) : (
          <div style={{ marginBottom: 30 }}>
            <label style={{ display: 'block', marginBottom: 5, fontWeight: 600 }}>
              Status
            </label>
            <div style={{
              padding: 10,
              fontSize: 16,
              border: '1px solid #e5e7eb',
              borderRadius: 4,
              backgroundColor: '#f9fafb',
              color: '#6b7280'
            }}>
              Draft (pending vendor approval)
            </div>
            <p style={{ fontSize: 12, color: '#666', marginTop: 5 }}>
              You can publish listings after your vendor account is approved.
            </p>
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="submit"
            disabled={loading}
            style={{
              flex: 1,
              padding: 12,
              fontSize: 16,
              fontWeight: 600,
              backgroundColor: loading ? '#ccc' : branding.colors.primary,
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading
              ? (mode === 'create' ? 'Creating...' : 'Saving...')
              : (mode === 'create' ? 'Create Listing' : 'Save Changes')
            }
          </button>

          <Link
            href={`/${vertical}/vendor/listings`}
            style={{
              flex: 1,
              padding: 12,
              fontSize: 16,
              fontWeight: 600,
              backgroundColor: '#6c757d',
              color: 'white',
              textDecoration: 'none',
              textAlign: 'center',
              borderRadius: 4
            }}
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}

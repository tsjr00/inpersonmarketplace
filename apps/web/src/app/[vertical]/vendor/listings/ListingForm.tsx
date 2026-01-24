'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { VerticalBranding } from '@/lib/branding'
import { CATEGORIES } from '@/lib/constants'
import Link from 'next/link'
import MarketSelector from '@/components/vendor/MarketSelector'
import { ListingImageUpload, ListingImage } from '@/components/vendor/ListingImageUpload'

// Category descriptions to help vendors categorize their products
const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  'Produce': 'Fresh fruits, vegetables, herbs, mushrooms, microgreens, and similar items.',
  'Meat & Poultry': 'Fresh, frozen, or cured meats including beef, pork, lamb, chicken, turkey, duck, game meats, sausages, charcuterie, and similar items.',
  'Dairy & Eggs': 'Milk, cheese, butter, yogurt, cream, eggs, and similar dairy products. Includes cow and alternative dairy (goat, sheep).',
  'Baked Goods': 'Bread, pastries, cookies, cakes, pies, muffins, gluten-free options, and similar baked items.',
  'Pantry': 'Jams, jellies, honey, maple syrup, sauces, pickles, oils, vinegars, spices, dry pasta, grains, and similar shelf-stable items.',
  'Prepared Foods': 'Popcorn, granola, trail mix, dried fruits, chips, ready-to-eat items, and similar snacks. Includes items stored cold before pickup.',
  'Plants & Flowers': 'Live plants, seedlings, cut flowers, bouquets, potted plants, succulents, garden starts, and similar items.',
  'Health & Wellness': 'Natural body care products, soaps, lotions, balms, herbal remedies, teas, and similar wellness items.',
  'Clothing & Fashion': 'Handmade or locally-made clothing, accessories, jewelry, hats, scarves, bags, and similar wearable items.',
  'Art & Decor': 'Original artwork, prints, photography, pottery, ceramics, candles, decorative home items, and similar items.',
  'Home & Functional': 'Handcrafted cutting boards, utensils, textiles, baskets, small furniture, and similar functional household items.'
}

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

  // Market selection
  const [selectedMarketIds, setSelectedMarketIds] = useState<string[]>([])
  const [hasMarkets, setHasMarkets] = useState(true) // Assume true until loaded
  const [vendorTier, setVendorTier] = useState<string>('standard')
  const [homeMarketId, setHomeMarketId] = useState<string | null>(null)
  const [marketData, setMarketData] = useState<{ id: string; market_type: string }[]>([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hasDraft, setHasDraft] = useState(false)

  // Image management (only used in edit mode)
  const [images, setImages] = useState<ListingImage[]>([])

  // Session storage key for draft persistence (only for create mode)
  const storageKey = mode === 'create' ? `listing-draft-${vendorProfileId}` : null

  // Load draft from session storage on mount (create mode only)
  useEffect(() => {
    if (!storageKey) return

    try {
      const saved = sessionStorage.getItem(storageKey)
      if (saved) {
        const draft = JSON.parse(saved)
        setFormData(prev => ({ ...prev, ...draft.formData }))
        if (draft.containsAllergens !== undefined) setContainsAllergens(draft.containsAllergens)
        if (draft.ingredients) setIngredients(draft.ingredients)
        setHasDraft(true)
      }
    } catch (err) {
      console.error('Failed to load draft:', err)
    }
  }, [storageKey])

  // Save draft to session storage on change (create mode only, debounced)
  useEffect(() => {
    if (!storageKey) return

    const timer = setTimeout(() => {
      const draft = {
        formData: { title: formData.title, description: formData.description, price: formData.price, quantity: formData.quantity, category: formData.category },
        containsAllergens,
        ingredients
      }
      sessionStorage.setItem(storageKey, JSON.stringify(draft))
      if (formData.title || formData.description || formData.price) {
        setHasDraft(true)
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [formData, containsAllergens, ingredients, storageKey])

  // Load images when editing an existing listing
  useEffect(() => {
    if (mode !== 'edit' || !listing?.id) return

    const fetchImages = async () => {
      try {
        const response = await fetch(`/api/vendor/listings/${listing.id}/images`)
        if (response.ok) {
          const data = await response.json()
          setImages(data.images || [])
        }
      } catch (err) {
        console.error('Failed to load listing images:', err)
      }
    }

    fetchImages()
  }, [mode, listing?.id])

  // Clear draft function
  const clearDraft = () => {
    if (storageKey) {
      sessionStorage.removeItem(storageKey)
      setHasDraft(false)
      setFormData({ title: '', description: '', price: '', quantity: '', category: '', status: 'draft' })
      setContainsAllergens(false)
      setIngredients('')
    }
  }

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

    // Validate title
    if (!formData.title.trim()) {
      setError('Title is required')
      setLoading(false)
      return
    }

    // Validate market selection (required for all listings)
    if (selectedMarketIds.length === 0 && hasMarkets) {
      setError('Please select at least one market for this listing')
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

    const savedListingId = result.data?.id

    // Handle market associations if we have markets
    if (savedListingId && selectedMarketIds.length > 0) {
      // If editing, delete existing market associations first
      if (mode === 'edit') {
        const { error: deleteError } = await supabase
          .from('listing_markets')
          .delete()
          .eq('listing_id', savedListingId)

        if (deleteError) {
          console.error('Error deleting listing markets:', deleteError)
          // Continue anyway - listing was saved
        }
      }

      // Create new market associations
      const listingMarkets = selectedMarketIds.map(marketId => ({
        listing_id: savedListingId,
        market_id: marketId
      }))

      const { error: insertError } = await supabase
        .from('listing_markets')
        .insert(listingMarkets)

      if (insertError) {
        console.error('Error creating listing markets:', insertError)
        // Continue anyway - listing was saved, markets can be added later
      }
    }

    // Auto-set home market for standard vendors if needed (FEATURE 2.1)
    if (!homeMarketId && vendorTier === 'standard' && selectedMarketIds.length > 0) {
      // Find the first traditional market in selection
      const traditionalMarketId = selectedMarketIds.find(id => {
        const market = marketData.find(m => m.id === id)
        return market && market.market_type === 'traditional'
      })

      if (traditionalMarketId) {
        try {
          await fetch('/api/vendor/home-market', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              vertical,
              marketId: traditionalMarketId
            })
          })
        } catch (err) {
          // Don't block on home market set failure
          console.error('Failed to set home market:', err)
        }
      }
    }

    // Success - clear draft and redirect to listings
    if (storageKey) {
      sessionStorage.removeItem(storageKey)
    }
    router.push(`/${vertical}/vendor/listings`)
    router.refresh()
  }

  // Get category options based on vertical
  const getCategoryOptions = () => {
    if (vertical === 'fireworks') {
      return ['Aerial', 'Ground', 'Sparklers', 'Fountains', 'Novelty', 'Assortments', 'Other']
    } else if (vertical === 'farmers_market') {
      // Use centralized CATEGORIES constant
      return [...CATEGORIES]
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
      {/* Draft indicator - only show in create mode when there's saved data */}
      {mode === 'create' && hasDraft && (
        <div style={{
          padding: 12,
          marginBottom: 20,
          backgroundColor: '#fef3c7',
          border: '1px solid #fde047',
          borderRadius: 6,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span style={{ fontSize: 14, color: '#92400e' }}>
            Draft saved - your progress is preserved
          </span>
          <button
            type="button"
            onClick={clearDraft}
            style={{
              padding: '4px 12px',
              fontSize: 12,
              color: '#92400e',
              backgroundColor: 'white',
              border: '1px solid #f59e0b',
              borderRadius: 4,
              cursor: 'pointer'
            }}
          >
            Clear Draft
          </button>
        </div>
      )}

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

        {/* Product Images */}
        <div style={{ marginBottom: 20 }}>
          {mode === 'edit' && listing?.id ? (
            <ListingImageUpload
              listingId={listing.id as string}
              images={images}
              onImagesChange={setImages}
              maxImages={5}
              disabled={loading}
            />
          ) : (
            <div style={{
              padding: 16,
              backgroundColor: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: 6
            }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, color: '#374151' }}>
                Product Images
              </label>
              <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>
                Save this listing first, then you can add photos by editing it.
              </p>
            </div>
          )}
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
          {/* Category description helper */}
          {formData.category && CATEGORY_DESCRIPTIONS[formData.category] && (
            <div style={{
              marginTop: 8,
              padding: '10px 12px',
              backgroundColor: '#f0f9ff',
              border: '1px solid #bae6fd',
              borderRadius: 6,
              fontSize: 13,
              color: '#0369a1',
              lineHeight: 1.5
            }}>
              <strong>{formData.category}:</strong> {CATEGORY_DESCRIPTIONS[formData.category]}
            </div>
          )}
        </div>

        {/* Market Selection */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>
            Available at <span style={{ color: '#c00' }}>*</span>
          </label>
          <p style={{ fontSize: 13, color: '#666', marginTop: 0, marginBottom: 12 }}>
            Select the markets/locations where this product will be available
          </p>
          <MarketSelector
            vertical={vertical}
            listingId={mode === 'edit' ? (listing?.id as string) : undefined}
            selectedMarketIds={selectedMarketIds}
            onChange={setSelectedMarketIds}
            onMarketsLoaded={(markets) => {
              setHasMarkets(markets.length > 0)
              setMarketData(markets.map(m => ({ id: m.id, market_type: m.market_type })))
            }}
            onMetadataLoaded={(tier, homeId) => {
              setVendorTier(tier)
              setHomeMarketId(homeId)
            }}
            disabled={loading}
            primaryColor={branding.colors.primary}
          />
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

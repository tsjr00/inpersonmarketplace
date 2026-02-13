'use client'

import { useState, useEffect } from 'react'
import Footer from '@/components/shared/Footer'
import Link from 'next/link'
import { colors, spacing, typography, radius, shadows } from '@/lib/design-tokens'

export default function AboutPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  })
  const [submitted, setSubmitted] = useState(false)

  // Handle scroll to hash on page load
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash) {
      const id = window.location.hash.slice(1)
      const element = document.getElementById(id)
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth' })
        }, 100)
      }
    }
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // In a real implementation, this would send the form data to an API
    console.log('Contact form submitted:', formData)
    setSubmitted(true)
  }

  const inputStyle = {
    width: '100%',
    padding: spacing.sm,
    fontSize: typography.sizes.base,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    color: colors.textPrimary,
  }

  const labelStyle = {
    display: 'block',
    marginBottom: spacing.xs,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    color: colors.textPrimary,
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{
        padding: '16px 20px',
        borderBottom: `1px solid ${colors.border}`,
        backgroundColor: colors.surfaceElevated
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <Link href="/" style={{ fontSize: 20, fontWeight: 700, color: colors.textPrimary, textDecoration: 'none' }}>
            815 Enterprises
          </Link>
        </div>
      </header>

      <main style={{ flex: 1, maxWidth: 800, margin: '40px auto', padding: '0 20px' }}>
        <h1 style={{ fontSize: typography.sizes['3xl'], fontWeight: typography.weights.bold, marginBottom: spacing.lg, color: colors.textPrimary }}>
          About Us
        </h1>

        <div style={{ color: colors.textSecondary, fontSize: typography.sizes.base, lineHeight: typography.leading.relaxed }}>
          {/* Mission Section */}
          <section style={{ marginBottom: spacing.xl }}>
            <h2 style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, marginBottom: spacing.md, color: colors.textPrimary }}>
              Our Mission
            </h2>
            <p style={{ marginBottom: spacing.md }}>
              We believe in the power of local communities and the importance of connecting people
              with the vendors and businesses that serve them right in their own neighborhoods.
            </p>
            <p style={{ marginBottom: spacing.md }}>
              Our marketplace platforms were created to make it easier for customers to discover and pre-order
              from their favorite local vendors, while helping vendors manage their business more efficiently
              and reach more customers.
            </p>
          </section>

          {/* How It Works Section */}
          <section style={{ marginBottom: spacing.xl }}>
            <h2 style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, marginBottom: spacing.md, color: colors.textPrimary }}>
              What We Do
            </h2>
            <p style={{ marginBottom: spacing.md }}>
              Our platforms connect local vendors and businesses with customers at markets,
              events, and community venues. We make it easy to:
            </p>
            <ul style={{ marginBottom: spacing.md, paddingLeft: spacing.lg }}>
              <li style={{ marginBottom: spacing.xs }}>Discover local vendors and markets in your area</li>
              <li style={{ marginBottom: spacing.xs }}>Pre-order online with guaranteed availability</li>
              <li style={{ marginBottom: spacing.xs }}>Pick up your order at the market or event</li>
              <li style={{ marginBottom: spacing.xs }}>Support small businesses and local vendors directly</li>
            </ul>
          </section>

          {/* For Vendors Section */}
          <section id="vendor-faq" style={{ marginBottom: spacing.xl }}>
            <h2 style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, marginBottom: spacing.md, color: colors.textPrimary }}>
              For Vendors
            </h2>
            <p style={{ marginBottom: spacing.md }}>
              We help vendors streamline their market day operations:
            </p>
            <ul style={{ marginBottom: spacing.md, paddingLeft: spacing.lg }}>
              <li style={{ marginBottom: spacing.xs }}>Pre-sell products to know exactly what to bring</li>
              <li style={{ marginBottom: spacing.xs }}>Accept credit cards with fees already built in</li>
              <li style={{ marginBottom: spacing.xs }}>Build a loyal following of repeat customers</li>
              <li style={{ marginBottom: spacing.xs }}>Get discovered by new shoppers in your area</li>
            </ul>
            <p style={{ marginBottom: spacing.md }}>
              Interested in becoming a vendor? Visit our{' '}
              <Link href="/" style={{ color: colors.primary }}>
                homepage
              </Link>
              {' '}and choose a marketplace to get started.
            </p>
          </section>

          {/* Contact Section */}
          <section id="contact" style={{ marginBottom: spacing.xl, paddingTop: spacing.lg }}>
            <h2 style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, marginBottom: spacing.md, color: colors.textPrimary }}>
              Contact Us
            </h2>
            <p style={{ marginBottom: spacing.lg }}>
              Have questions, feedback, or need support? We&apos;d love to hear from you.
              Fill out the form below and we&apos;ll get back to you as soon as possible.
            </p>

            {submitted ? (
              <div style={{
                padding: spacing.lg,
                backgroundColor: '#f0fdf4',
                border: '1px solid #86efac',
                borderRadius: radius.lg,
                textAlign: 'center'
              }}>
                <p style={{ color: '#166534', fontSize: typography.sizes.lg, fontWeight: typography.weights.medium, marginBottom: spacing.xs }}>
                  Thank you for your message!
                </p>
                <p style={{ color: '#15803d', fontSize: typography.sizes.base }}>
                  We&apos;ll review your inquiry and get back to you soon.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{
                backgroundColor: colors.surfaceSubtle,
                padding: spacing.lg,
                borderRadius: radius.lg,
                border: `1px solid ${colors.border}`
              }}>
                <div style={{ marginBottom: spacing.md }}>
                  <label htmlFor="name" style={labelStyle}>Name</label>
                  <input
                    type="text"
                    id="name"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    style={inputStyle}
                  />
                </div>

                <div style={{ marginBottom: spacing.md }}>
                  <label htmlFor="email" style={labelStyle}>Email</label>
                  <input
                    type="email"
                    id="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    style={inputStyle}
                  />
                </div>

                <div style={{ marginBottom: spacing.md }}>
                  <label htmlFor="subject" style={labelStyle}>Subject</label>
                  <select
                    id="subject"
                    required
                    value={formData.subject}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="">Select a topic...</option>
                    <option value="general">General Inquiry</option>
                    <option value="shopper">Shopper Support</option>
                    <option value="vendor">Vendor Support</option>
                    <option value="market">Market Partnership</option>
                    <option value="feedback">Feedback</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div style={{ marginBottom: spacing.lg }}>
                  <label htmlFor="message" style={labelStyle}>Message</label>
                  <textarea
                    id="message"
                    required
                    rows={5}
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </div>

                <button
                  type="submit"
                  style={{
                    width: '100%',
                    padding: spacing.sm,
                    fontSize: typography.sizes.base,
                    fontWeight: typography.weights.semibold,
                    color: colors.textInverse,
                    backgroundColor: colors.primary,
                    border: 'none',
                    borderRadius: radius.md,
                    cursor: 'pointer',
                    boxShadow: shadows.sm,
                  }}
                >
                  Send Message
                </button>
              </form>
            )}
          </section>
        </div>
      </main>
      <Footer />
    </div>
  )
}

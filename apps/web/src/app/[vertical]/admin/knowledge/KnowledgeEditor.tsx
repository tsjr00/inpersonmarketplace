'use client'

import { useState } from 'react'
import { colors } from '@/lib/design-tokens'

interface Article {
  id: string
  vertical_id: string | null
  category: string
  title: string
  body: string
  sort_order: number
  is_published: boolean
  created_at: string
  updated_at: string
}

interface KnowledgeEditorProps {
  initialArticles: Article[]
  vertical: string
}

export default function KnowledgeEditor({ initialArticles, vertical }: KnowledgeEditorProps) {
  const [articles, setArticles] = useState<Article[]>(initialArticles)
  const [editing, setEditing] = useState<Article | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  // Form state
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [body, setBody] = useState('')
  const [sortOrder, setSortOrder] = useState(0)
  const [isPublished, setIsPublished] = useState(false)
  const [scope, setScope] = useState<'global' | 'vertical'>('vertical')

  // Get unique categories for suggestions
  const categories = [...new Set(articles.map(a => a.category))].sort()

  const startNew = () => {
    setEditing(null)
    setIsNew(true)
    setTitle('')
    setCategory(categories[0] || 'Getting Started')
    setBody('')
    setSortOrder(0)
    setIsPublished(false)
    setScope('vertical')
  }

  const startEdit = (article: Article) => {
    setEditing(article)
    setIsNew(false)
    setTitle(article.title)
    setCategory(article.category)
    setBody(article.body)
    setSortOrder(article.sort_order)
    setIsPublished(article.is_published)
    setScope(article.vertical_id ? 'vertical' : 'global')
  }

  const cancelEdit = () => {
    setEditing(null)
    setIsNew(false)
  }

  const handleSave = async () => {
    if (!title.trim() || !category.trim() || !body.trim()) return
    setSaving(true)

    try {
      const payload = {
        ...(editing ? { id: editing.id } : {}),
        title: title.trim(),
        category: category.trim(),
        body: body.trim(),
        sort_order: sortOrder,
        is_published: isPublished,
        vertical_id: scope === 'global' ? null : vertical,
      }

      const method = isNew ? 'POST' : 'PATCH'
      const res = await fetch('/api/admin/knowledge', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Failed to save')
        return
      }

      const data = await res.json()
      if (isNew) {
        setArticles(prev => [...prev, data.article])
      } else {
        setArticles(prev => prev.map(a => a.id === data.article.id ? data.article : a))
      }
      cancelEdit()
    } catch {
      alert('Failed to save article')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this article? This cannot be undone.')) return
    setDeleting(id)

    try {
      const res = await fetch(`/api/admin/knowledge?id=${id}`, { method: 'DELETE' })
      if (res.ok) {
        setArticles(prev => prev.filter(a => a.id !== id))
        if (editing?.id === id) cancelEdit()
      }
    } catch {
      alert('Failed to delete')
    } finally {
      setDeleting(null)
    }
  }

  const handleTogglePublish = async (article: Article) => {
    try {
      const res = await fetch('/api/admin/knowledge', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: article.id, is_published: !article.is_published }),
      })
      if (res.ok) {
        const data = await res.json()
        setArticles(prev => prev.map(a => a.id === data.article.id ? data.article : a))
      }
    } catch {
      alert('Failed to update')
    }
  }

  // Group articles by category
  const grouped = articles.reduce<Record<string, Article[]>>((acc, article) => {
    if (!acc[article.category]) acc[article.category] = []
    acc[article.category].push(article)
    return acc
  }, {})

  return (
    <div>
      {/* Editor Form */}
      {(isNew || editing) && (
        <div style={{
          padding: 24,
          marginBottom: 24,
          backgroundColor: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
        }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: 18 }}>
            {isNew ? 'New Article' : 'Edit Article'}
          </h3>

          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: '#374151' }}>Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="How do I place an order?"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    fontSize: 14,
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: '#374151' }}>Category</label>
                <input
                  type="text"
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  list="categories"
                  placeholder="Getting Started"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    fontSize: 14,
                    boxSizing: 'border-box',
                  }}
                />
                <datalist id="categories">
                  {categories.map(c => <option key={c} value={c} />)}
                  <option value="Getting Started" />
                  <option value="Orders & Pickup" />
                  <option value="Market Boxes" />
                  <option value="Payments" />
                  <option value="Account & Settings" />
                  <option value="For Vendors" />
                </datalist>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: '#374151' }}>Body</label>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={8}
                placeholder="Write the article content here. Line breaks will be preserved."
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 14,
                  fontFamily: 'inherit',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: '#374151' }}>Sort Order</label>
                <input
                  type="number"
                  value={sortOrder}
                  onChange={e => setSortOrder(parseInt(e.target.value) || 0)}
                  style={{
                    width: 80,
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    fontSize: 14,
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4, color: '#374151' }}>Scope</label>
                <select
                  value={scope}
                  onChange={e => setScope(e.target.value as 'global' | 'vertical')}
                  style={{
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    fontSize: 14,
                  }}
                >
                  <option value="vertical">This vertical only</option>
                  <option value="global">All verticals</option>
                </select>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 20 }}>
                <input
                  type="checkbox"
                  checked={isPublished}
                  onChange={e => setIsPublished(e.target.checked)}
                  style={{ width: 18, height: 18 }}
                />
                <span style={{ fontSize: 14, fontWeight: 500 }}>Published</span>
              </label>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={handleSave}
                disabled={saving || !title.trim() || !body.trim() || !category.trim()}
                style={{
                  padding: '10px 24px',
                  backgroundColor: colors.primary,
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? 'Saving...' : isNew ? 'Create Article' : 'Save Changes'}
              </button>
              <button
                onClick={cancelEdit}
                style={{
                  padding: '10px 24px',
                  backgroundColor: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Article button */}
      {!isNew && !editing && (
        <button
          onClick={startNew}
          style={{
            padding: '10px 24px',
            backgroundColor: colors.primary,
            color: 'white',
            border: 'none',
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            marginBottom: 24,
          }}
        >
          + New Article
        </button>
      )}

      {/* Articles List */}
      {articles.length === 0 ? (
        <div style={{
          padding: 40,
          textAlign: 'center',
          backgroundColor: '#f9fafb',
          border: '1px dashed #d1d5db',
          borderRadius: 8,
          color: '#6b7280',
        }}>
          No articles yet. Create your first help article to get started.
        </div>
      ) : (
        Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([cat, catArticles]) => (
          <div key={cat} style={{ marginBottom: 24 }}>
            <h3 style={{
              fontSize: 16,
              fontWeight: 600,
              color: '#1e40af',
              marginBottom: 12,
              paddingBottom: 8,
              borderBottom: '2px solid #dbeafe',
            }}>
              {cat} ({catArticles.length})
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {catArticles.sort((a, b) => a.sort_order - b.sort_order).map(article => (
                <div
                  key={article.id}
                  style={{
                    padding: '12px 16px',
                    backgroundColor: editing?.id === article.id ? '#eff6ff' : 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: 6,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 600, color: '#374151', fontSize: 14 }}>{article.title}</span>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 600,
                        backgroundColor: article.is_published ? '#dcfce7' : '#f3f4f6',
                        color: article.is_published ? '#166534' : '#6b7280',
                      }}>
                        {article.is_published ? 'Published' : 'Draft'}
                      </span>
                      {!article.vertical_id && (
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          backgroundColor: '#e0e7ff',
                          color: '#3730a3',
                        }}>
                          Global
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                      Order: {article.sort_order} &middot; Updated {new Date(article.updated_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => handleTogglePublish(article)}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: article.is_published ? '#fef3c7' : colors.primaryLight,
                        color: article.is_published ? '#92400e' : colors.primaryDark,
                        border: 'none',
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {article.is_published ? 'Unpublish' : 'Publish'}
                    </button>
                    <button
                      onClick={() => startEdit(article)}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#eff6ff',
                        color: '#1e40af',
                        border: 'none',
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(article.id)}
                      disabled={deleting === article.id}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#fee2e2',
                        color: '#991b1b',
                        border: 'none',
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        opacity: deleting === article.id ? 0.5 : 1,
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

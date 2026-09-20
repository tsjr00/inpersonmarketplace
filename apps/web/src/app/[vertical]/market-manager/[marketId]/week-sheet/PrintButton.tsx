'use client'

/** The one interactive piece of the week sheet — `window.print()` needs the browser. */
export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      style={{ padding: '6px 14px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
    >
      Print
    </button>
  )
}

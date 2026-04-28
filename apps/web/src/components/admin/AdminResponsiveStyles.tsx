/**
 * Shared responsive CSS utilities for all admin pages.
 *
 * Usage: Include <AdminResponsiveStyles /> once per admin page (before closing </div>).
 * Then use the CSS class names on your grid/table/filter containers.
 *
 * Breakpoints:
 *   Mobile: < 640px (1 column)
 *   Tablet: 640px–1023px (2 columns)
 *   Desktop: ≥ 1024px (full columns)
 *
 * Grid classes:
 *   .admin-grid-2  → 1-col mobile, 2-col tablet+
 *   .admin-grid-3  → 1-col mobile, 2-col tablet, 3-col desktop
 *   .admin-grid-4  → 1-col mobile, 2-col tablet, 4-col desktop
 *   .admin-grid-6  → 1-col mobile, 2-col tablet, 3-col desktop (6 metric cards)
 *
 * Layout classes:
 *   .admin-detail-split  → 1-col mobile (detail replaces list), side-by-side desktop
 *   .admin-filter-bar    → wraps on mobile, row on desktop
 *   .admin-table-wrap    → horizontal scroll wrapper for tables on mobile
 *   .admin-stack-mobile  → 1-col on mobile, original layout on tablet+
 *
 * Sidebar:
 *   .admin-sidebar       → hidden on mobile, 250px on desktop
 *   .admin-sidebar-toggle → visible on mobile only (hamburger button)
 *   .admin-main-content  → full width on mobile, flex on desktop
 */
export default function AdminResponsiveStyles() {
  return (
    <style>{`
      /* ============================================= */
      /* GRID UTILITIES                                */
      /* ============================================= */

      .admin-grid-2,
      .admin-grid-3,
      .admin-grid-4,
      .admin-grid-6 {
        display: grid;
        gap: 12px;
        grid-template-columns: 1fr;
      }

      @media (min-width: 640px) {
        .admin-grid-2,
        .admin-grid-3,
        .admin-grid-4,
        .admin-grid-6 {
          grid-template-columns: repeat(2, 1fr);
        }
      }

      @media (min-width: 1024px) {
        .admin-grid-2 {
          grid-template-columns: repeat(2, 1fr);
        }
        .admin-grid-3 {
          grid-template-columns: repeat(3, 1fr);
        }
        .admin-grid-4 {
          grid-template-columns: repeat(4, 1fr);
        }
        .admin-grid-6 {
          grid-template-columns: repeat(3, 1fr);
        }
      }

      /* ============================================= */
      /* DETAIL SPLIT (master/detail panels)           */
      /* ============================================= */

      .admin-detail-split {
        display: grid;
        gap: 16px;
        grid-template-columns: 1fr;
      }

      .admin-detail-split > .admin-detail-panel {
        /* On mobile, detail panel takes full width */
      }

      @media (min-width: 1024px) {
        .admin-detail-split.has-detail {
          grid-template-columns: 1fr 2fr;
        }
      }

      /* ============================================= */
      /* FILTER BAR                                    */
      /* ============================================= */

      .admin-filter-bar {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
      }

      .admin-filter-bar > select,
      .admin-filter-bar > input {
        min-width: 0;
        flex: 1 1 140px;
        max-width: 100%;
      }

      @media (min-width: 640px) {
        .admin-filter-bar > select,
        .admin-filter-bar > input {
          flex: 0 1 auto;
          min-width: 140px;
        }
      }

      /* ============================================= */
      /* TABLE RESPONSIVE WRAPPER                      */
      /* ============================================= */

      .admin-table-wrap {
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
      }

      .admin-table-wrap table {
        min-width: 600px;
      }

      /* ============================================= */
      /* STACK ON MOBILE                               */
      /* ============================================= */

      .admin-stack-mobile {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      @media (min-width: 640px) {
        .admin-stack-mobile {
          flex-direction: row;
        }
      }

      /* ============================================= */
      /* SIDEBAR (platform admin layout)               */
      /* ============================================= */

      .admin-sidebar {
        display: none;
      }

      .admin-sidebar.open {
        display: flex;
        position: fixed;
        top: 0;
        left: 0;
        bottom: 0;
        width: 280px;
        z-index: 1000;
        overflow-y: auto;
      }

      .admin-sidebar-overlay {
        display: none;
      }

      .admin-sidebar-overlay.open {
        display: block;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 999;
      }

      .admin-sidebar-toggle {
        display: flex;
        align-items: center;
        justify-content: center;
        position: fixed;
        bottom: 16px;
        left: 16px;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: #1a1a2e;
        color: white;
        border: none;
        cursor: pointer;
        z-index: 998;
        font-size: 20px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      }

      .admin-main-content {
        width: 100%;
      }

      @media (min-width: 768px) {
        .admin-sidebar {
          display: flex;
          position: static;
          width: 250px;
          flex-shrink: 0;
        }

        .admin-sidebar.open {
          position: static;
          width: 250px;
        }

        .admin-sidebar-overlay,
        .admin-sidebar-overlay.open {
          display: none;
        }

        .admin-sidebar-toggle {
          display: none;
        }

        .admin-main-content {
          flex: 1;
          min-width: 0;
        }
      }

      /* ============================================= */
      /* FORM GRIDS (create/edit forms)                */
      /* ============================================= */

      .admin-form-grid {
        display: grid;
        gap: 12px;
        grid-template-columns: 1fr;
      }

      @media (min-width: 640px) {
        .admin-form-grid {
          grid-template-columns: 1fr 1fr;
        }
      }

      .admin-form-grid .full-width {
        grid-column: 1 / -1;
      }

      /* ============================================= */
      /* LIST VIEW (compressed rows on mobile, table   */
      /*           on tablet/desktop)                  */
      /* ============================================= */

      /* Default: mobile-first — show compressed list, hide table */
      .admin-list-table {
        display: none;
      }

      .admin-list-mobile {
        display: block;
        /* Visual chrome (background, border-radius, shadow) is provided by the
           parent wrapper that already exists in each list page. We just provide
           layout. */
      }

      @media (min-width: 640px) {
        /* Tablet+ — show full table, hide compressed list */
        .admin-list-table {
          display: block;
        }
        .admin-list-mobile {
          display: none;
        }
      }

      /* Compressed row — entire row is the tap target */
      .admin-mobile-row {
        display: block;
        padding: 14px 16px;
        border-bottom: 1px solid #e5e7eb;
        text-decoration: none;
        color: inherit;
        min-height: 44px;
        background: white;
        transition: background-color 0.1s ease;
      }

      .admin-mobile-row:last-child {
        border-bottom: none;
      }

      .admin-mobile-row:active {
        background-color: #f3f4f6;
      }

      .admin-mobile-row-line1 {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        margin-bottom: 4px;
      }

      .admin-mobile-row-title {
        font-weight: 600;
        font-size: 15px;
        color: #111;
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .admin-mobile-row-status {
        flex-shrink: 0;
      }

      .admin-mobile-row-chevron {
        color: #9ca3af;
        flex-shrink: 0;
        font-size: 18px;
        line-height: 1;
      }

      .admin-mobile-row-action {
        flex-shrink: 0;
      }

      .admin-mobile-row-line2 {
        font-size: 13px;
        color: #6b7280;
        line-height: 1.4;
        word-break: break-word;
      }

      /* Empty state for compressed list */
      .admin-mobile-empty {
        padding: 32px 16px;
        text-align: center;
        color: #9ca3af;
        font-size: 14px;
      }
    `}</style>
  )
}

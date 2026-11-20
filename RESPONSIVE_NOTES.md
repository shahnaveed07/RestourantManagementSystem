# Responsive Design Notes — Passline Restaurant Management WebApp

> **Project Layout Note:** This workspace places the React JSX frontend directly at the root (`index.html`, `src/components/`, `src/pages/`) alongside `server/`.

## 1. Breakpoints & Mobile-First Foundation

Base CSS targets `360px` viewports and scales upward using standard Tailwind breakpoints:

| Token | Min Width | Primary Layout Behavior |
| --- | --- | --- |
| Base | `360px` | Single-column layouts, `16px` (`text-base`) form inputs to prevent iOS focus zoom, `>= 44x44px` touch targets, full-screen `h-dvh` modals, bottom-sheet cart drawer, full-width sticky bottom cart bar (`env(safe-area-inset-bottom)`), and stacked mobile cards replacing dense data tables. |
| `sm` | `640px` | 2-column dish and KPI grids, 3-column table grid, centered `sm:max-w-*` dialogs with rounded borders, horizontal form pairs, and desktop-sized (`14px` / `12px`) form labels/inputs. |
| `md` | `768px` | Horizontal top navbar links (`StorefrontNavbar`), 2-column `CartDrawer` / `400px` right slide-over, Recharts tablet/desktop tick density, `hidden md:block` structured data tables, and `md:max-w-sm` receipt print sheet. |
| `lg` | `1024px` | Fixed `w-64` staff sidebar (`Layout`), 3-column storefront dish grid, 4-column live Kanban board (`LiveOrdersPage`), 3-column KDS grid (`KitchenPage`), 6-column tables grid (`TablesPage`), 4-column KPI strip (`DashboardPage`), and persistent 2-column guest QR ordering layout (`GuestMenuPage`). |
| `xl` | `1280px` | 4-column storefront dish grid (`HomePage`) and 4-column KDS ticket grid (`KitchenPage`). |

### Global Rules (`src/index.css`)
- **Box sizing & media:** `box-sizing: border-box` globally; `img, video, svg { max-width: 100%; height: auto }`.
- **Dynamic viewport & overflow guard:** `min-h-dvh` (`100dvh`) replaces `100vh` so mobile browser bars never clip content. `overflow-x: clip` is applied on `body` and `#root` instead of `overflow-x: hidden`, preventing horizontal scroll while keeping `position: sticky` headers, sidebars, and desktop order panels working.
- **Safe areas:** `.safe-bottom-bar` adds `padding-bottom: max(0.75rem, env(safe-area-inset-bottom))` to bottom-anchored cart bars, sheets, and checkout footers.
- **Hover capability:** `.hover-lift` wraps hover transforms inside `@media (hover: hover)` so touch screens never get sticky hover states.
- **Print styles (`@media print`):** `@page { size: A4; margin: 12mm }`, `.no-print` hides navigation/buttons, `.qr-print-grid` formats QR cards cleanly onto A4 sheets, and `.receipt-print-sheet` centers receipts at `max-width: 24rem` (`max-w-sm`).

---

## 2. Component & Page Behavior

- **Public Storefront Navbar (`StorefrontNavbar.jsx`)**: Below `md`, renders brand logo and a `44x44px` hamburger button. Opening the menu displays a full-width dropdown with navigation links, account status, and a **Your Cart** row displaying live item count and total. Automatically closes on route changes (`useLocation`) and `Escape`.
- **Storefront Home (`HomePage.jsx`)**:
  - Hero heading scales `text-2xl sm:text-4xl lg:text-5xl`.
  - Search bar (`w-full sm:max-w-md`, `text-base sm:text-sm`) and horizontally scrollable snap category tabs (`no-scrollbar snap-x` below `lg`, wrapping on `lg+`).
  - Dish grid scales `1 -> 2 (sm) -> 3 (lg) -> 4 (xl)` columns with `aspect-[4/3]` images and `line-clamp-2` descriptions.
  - Below `md`, the cart button spans the bottom edge (`fixed inset-x-3 bottom-3 safe-bottom-bar`); on `md+` it sits bottom-right (`md:w-auto md:left-auto md:bottom-4 md:right-4`).
- **Cart Drawer (`CartDrawer.jsx`)**: Bottom sheet (`max-h-[85dvh] rounded-t-2xl`) on mobile (`< md`) and right slide-over (`md:w-[400px] h-dvh`) on `md+`, using `useModalA11y` for focus trapping and `Escape` dismissal.
- **Auth & OTP Modals (`AuthModal.jsx`, `CustomerAuthForm.jsx`, `OtpDigitInput.jsx`)**:
  - `AuthModal` opens full-screen (`h-dvh`) on mobile with the close button positioned top-left (`sm:order-last`) for thumb reach, and as a centered `sm:max-w-md` dialog on desktop.
  - `OtpDigitInput` renders 6 `40px` (`w-10 sm:w-12`) numeric inputs (`h-12`, `gap-1.5 sm:gap-2.5`) so all 6 digits fit cleanly inside `360px` without horizontal overflow.
- **QR Guest Menu (`GuestMenuPage.jsx`)**: Sticky compact header with table pill and `Call Waiter` CTA, mobile bottom cart bar launching a `max-h-[85dvh]` sheet on `< lg`, and persistent sticky side cart (`lg:col-span-4`) on `lg+`.
- **Staff Shell (`Layout.jsx`)**: Fixed `w-64` left sidebar on `lg+`; off-canvas slide-over drawer with backdrop, route-change auto-close, focus trap, and `Escape` dismissal below `lg`.
- **Dashboard (`DashboardPage.jsx`)**: KPI cards reflow `1 (360px) -> 2 (sm/md) -> 4 (lg+)`. `useMediaQuery('(min-width: 768px)')` adapts Recharts container heights (`h-52 md:h-64`), mobile Y-axis label widths (`88px` vs `130px`), and X-axis tick density.
- **Live Orders Kanban (`LiveOrdersPage.jsx`)**: Below `lg`, displays a scrollable stage tab bar (`Pending | Preparing | Ready | Served`) with live counts and renders the selected column full-width; on `lg+`, all 4 columns render side-by-side (`lg:grid-cols-4`). Search is accessible on both mobile and desktop.
- **Kitchen Display (`KitchenPage.jsx`)**: 1-column ticket stack below `lg` for legibility on kitchen phones/tablets, expanding to `lg:grid-cols-3` and `xl:grid-cols-4`, with `44px` `Cook`/`Done` buttons and a `48px` `Bump Ticket` action.
- **Tables & QR Printing (`TablesPage.jsx`, `QrModal.jsx`)**: Table cards scale `2 -> 3 (sm) -> 4 (md) -> 6 (lg)` columns; QR print sheet previews `grid-cols-2 md:grid-cols-3` and prints cleanly on A4 via `.qr-print-grid`.
- **Menu, Reports & Staff Tables (`MenuPage.jsx`, `ReportsPage.jsx`, `StaffPage.jsx`)**: Render stacked summary cards below `md` (`md:hidden`) and full horizontal tables (`hidden md:block overflow-x-auto`) on `md+`.
- **Billing & Receipts (`BillingPage.jsx`)**: Settled receipts and pro-forma previews constrain to `md:max-w-sm mx-auto receipt-print-sheet` while keeping full width on small phones.

## 3. Accessibility & Verification Helpers
- `src/utils/useModalA11y.js`: Shared hook providing `Escape`-to-close, `Tab`/`Shift+Tab` focus trapping, initial focus placement inside dialogs/drawers, and focus restoration upon close.
- `src/utils/useMediaQuery.js`: MatchMedia hook for responsive chart dimensions and toast placement (`top-center` on mobile, `top-right` on `md+`).

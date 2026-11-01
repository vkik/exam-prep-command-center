# Theme — "Academic Focus & Clarity" (refined light)

Revised 31 Oct 2026 after review: the first light version kept navy-filled cards, which made the page feel heavy and jarring. Content surfaces are now white; only the sidebar is dark. Applied to the v2 app (`src/styles/variables.css`, `src/styles/app.css`). The v1 reference build (`reference/v1.0.0-build/assets/css/`) is deliberately unchanged — it is your fallback.

## Palette

| Role | Colour | Where |
|---|---|---|
| Canvas | `#F8FAFC` Slate-50 | Page body, behind cards |
| Cards & containers | `#FFFFFF`, border `1px #E2E8F0`, shadow `0 1px 3px 0 rgba(0,0,0,.05), 0 1px 2px -1px rgba(0,0,0,.05)` | Cards, tables, dialogs, calendar days, toasts, empty states |
| Sidebar | `#0F172A`; nav text `#94A3B8`; active `#FFFFFF` on pill `#1E293B` with a Sky-600 left marker | Navigation |
| Headings & titles | `#0F172A` | h1–h3, card titles, KPI values, strong |
| Body text & labels | `#334155` | Paragraphs, table cells, form labels |
| Secondary / muted | `#64748B` | Card subtitles, hints, footnotes, section titles |
| Primary buttons & active tabs | `#0284C7`, hover `#0369A1`, white text | CTAs, selected tab |
| Secondary / outline buttons | White, border `#E2E8F0`, text `#334155` | Everything else |
| Tables & inputs | White, border `#CBD5E1`, text `#0F172A`, Sky focus ring | Inputs, selects, table rows |
| Links | `#0369A1` | Text links |
| Non-text fills | Sky `#0284C7` (progress, video/content), Amber `#F59E0B` (buffer, changed fields) | Bars, markers |

Semantic badge and alert meanings (Verified, User Entered, Historical, Not Yet Verified, Conflicting Data, Unavailable, Estimated Planning Value, warning, error) are unchanged; they now use light tinted backgrounds with dark text.

## Contrast (WCAG 2 AA, 4.5:1 for normal text)

| Text | On white | On canvas `#F8FAFC` |
|---|---|---|
| Headings `#0F172A` | 17.85 | 17.06 |
| Body `#334155` | 10.35 | 9.90 |
| Muted `#64748B` | 4.76 | 4.55 |
| Links `#0369A1` | 5.93 | 5.67 |
| Sidebar text `#94A3B8` on `#0F172A` | 6.96 | |
| Active nav `#FFFFFF` on `#1E293B` | 14.63 | |
| **Button/tab label `#FFFFFF` on `#0284C7`** | **4.10 — below AA for normal text; accepted by owner decision** | |

Choices made to stay within AA:
- Canvas `#F8FAFC` rather than `#F1F5F9`: muted text would be 4.34:1 on `#F1F5F9`.
- Links `#0369A1` rather than `#0284C7` (4.10:1).
- Sidebar item numbers use the nav text colour `#94A3B8` (an earlier `#64748B` was 3.75:1).
- Out-of-window calendar days use muted text at full opacity instead of fading (was 2.2:1).

Known trade-off: input borders `#CBD5E1` are 1.48:1 against white — subtle, as specified; fields remain identifiable by their labels and focus ring.

## Verification
- `tests/contrast_audit.py` (axe-core colour-contrast, 17 page/dialog/toast states): **0 unexpected violations**. White-on-`#0284C7` button and tab labels are listed separately as *accepted by owner decision* (`tests/contrast-results.json`), not hidden.
- Functional suites unchanged: Phase 1 14/14, Phase 2 15/15, Phase 3 12/12.

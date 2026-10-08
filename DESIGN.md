---
name: Lejer
description: The house ledger — shared bills split, tracked and settled, in two deliberate themes over one component set.
colors:
  # statement (live in app/globals.css :root)
  statement-paper: "#f4f5f6"
  statement-sheet: "#ffffff"
  statement-sheet-tint: "#f8f9fb"
  statement-ink: "#1b2530"
  statement-ink-muted: "#5b6875"
  statement-rule: "rgba(27, 37, 48, 0.16)"
  statement-rule-soft: "rgba(27, 37, 48, 0.08)"
  statement-blue: "#1d5fd6"
  statement-blue-deep: "#174db3"
  statement-blue-wash: "rgba(29, 95, 214, 0.1)"
  statement-on-blue: "#ffffff"
  statement-paid: "#187a4b"
  statement-paid-wash: "rgba(24, 122, 75, 0.12)"
  statement-unpaid: "#c03538"
  statement-unpaid-wash: "rgba(192, 53, 56, 0.1)"
  statement-due-soon: "#8a5b00"
  statement-due-soon-wash: "rgba(216, 146, 0, 0.16)"
  # statement dark (data-color-scheme="system" + prefers-color-scheme: dark)
  statement-dark-paper: "#14181d"
  statement-dark-sheet: "#1b2128"
  statement-dark-sheet-tint: "#20262e"
  statement-dark-ink: "#e4eaf0"
  statement-dark-ink-muted: "#99a5b1"
  statement-dark-blue: "#82abf3"
  statement-dark-button: "#3168d5"
  statement-dark-button-hover: "#2358c4"
  statement-dark-paid: "#52c48a"
  statement-dark-unpaid: "#ee7378"
  statement-dark-due-soon: "#e0b24c"
  # peach: corrected spec, ported in phase 5 (darker inks than peach-cob, see Colors > Contrast)
  peach-cream: "#faf3e7"
  peach-paper: "#fffcf7"
  peach-paper-tint: "#f5ead9"
  peach-espresso: "#43302b"
  peach-espresso-muted: "#7a6559"
  peach-rule: "rgba(67, 48, 43, 0.22)"
  peach-rule-soft: "rgba(67, 48, 43, 0.1)"
  peach-deep: "#b45031"
  peach-deep-pressed: "#a34527"
  peach-blush: "rgba(231, 138, 104, 0.16)"
  peach-on-deep: "#fff6ec"
  peach-periwinkle: "#51609e"
  peach-periwinkle-wash: "rgba(95, 111, 174, 0.13)"
  peach-sage: "#406c45"
  peach-sage-wash: "rgba(94, 133, 90, 0.16)"
  peach-rose: "#ae413a"
  peach-rose-wash: "rgba(177, 68, 61, 0.1)"
  peach-butter: "#845e09"
  peach-butter-wash: "rgba(216, 166, 42, 0.2)"
  peach-awning-stripe: "#eb9a76"
  peach-awning-cream: "#f8e3d3"
  # chart series (trends only; never interactive, never status). See Colors > Data series.
  statement-series-1: "#1d5fd6"
  statement-series-2: "#8c2f6e"
  statement-series-3: "#2e9fd0"
  statement-series-4: "#5b3fa8"
  statement-series-5: "#c2418f"
  statement-dark-series-1: "#4f86e8"
  statement-dark-series-2: "#b4508f"
  statement-dark-series-3: "#3aa0d0"
  statement-dark-series-4: "#7f66d8"
  statement-dark-series-5: "#d465a5"
  peach-series-1: "#b45031"
  peach-series-2: "#51609e"
  peach-series-3: "#9a3f6b"
  peach-series-4: "#3e5fb0"
  peach-series-5: "#c06090"
typography:
  statement-page-title:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    letterSpacing: "-0.025em"
  statement-body:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "clamp(15px, 1vw + 12px, 16px)"
    fontWeight: 400
    lineHeight: 1.55
  statement-figure-lg:
    fontFamily: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "1.7rem"
    fontWeight: 600
    lineHeight: 1.25
    fontFeature: "tnum"
  statement-figure:
    fontFamily: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    fontFeature: "tnum"
  statement-eyebrow:
    fontFamily: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.7rem"
    fontWeight: 500
    letterSpacing: "0.14em"
  statement-label:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.82rem"
    fontWeight: 600
  peach-page-title:
    fontFamily: "Fraunces, Georgia, 'Times New Roman', serif"
    fontSize: "1.6rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  peach-display:
    fontFamily: "Fraunces, Georgia, 'Times New Roman', serif"
    fontSize: "1.875rem"
    fontWeight: 600
    letterSpacing: "-0.025em"
  peach-body:
    fontFamily: "Karla, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "clamp(15px, 1vw + 12px, 16px)"
    fontWeight: 400
    lineHeight: 1.55
  peach-figure:
    fontFamily: "'Courier Prime', 'Courier New', Courier, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    fontFeature: "tnum"
  peach-eyebrow:
    fontFamily: "'Courier Prime', 'Courier New', Courier, monospace"
    fontSize: "0.7rem"
    fontWeight: 700
    letterSpacing: "0.16em"
rounded:
  statement-sm: "4px"
  statement-md: "6px"
  statement-lg: "10px"
  peach-sm: "6px"
  peach-md: "10px"
  peach-lg: "14px"
  pill: "9999px"
spacing:
  gutter: "16px"
  gutter-sm: "20px"
  page-y: "32px"
  panel-x: "20px"
  panel-y: "16px"
  cell-x: "16px"
  cell-y: "12px"
  container: "1000px"
components:
  statement-button-primary:
    backgroundColor: "{colors.statement-blue}"
    textColor: "{colors.statement-on-blue}"
    rounded: "{rounded.statement-md}"
    padding: "8px 14px"
    height: "36px"
  statement-button-primary-hover:
    backgroundColor: "{colors.statement-blue-deep}"
  statement-button:
    backgroundColor: "{colors.statement-sheet}"
    textColor: "{colors.statement-ink}"
    rounded: "{rounded.statement-md}"
    padding: "8px 14px"
    height: "36px"
  statement-tag-paid:
    backgroundColor: "{colors.statement-paid-wash}"
    textColor: "{colors.statement-paid}"
    rounded: "{rounded.statement-sm}"
    padding: "2px 6px"
  statement-tag-unpaid:
    backgroundColor: "{colors.statement-unpaid-wash}"
    textColor: "{colors.statement-unpaid}"
    rounded: "{rounded.statement-sm}"
    padding: "2px 6px"
  statement-due-soon:
    backgroundColor: "{colors.statement-due-soon-wash}"
    textColor: "{colors.statement-due-soon}"
    rounded: "{rounded.statement-sm}"
    padding: "2px 6px"
  statement-field:
    backgroundColor: "{colors.statement-sheet}"
    textColor: "{colors.statement-ink}"
    rounded: "{rounded.statement-md}"
    padding: "8px 12px"
  statement-panel:
    backgroundColor: "{colors.statement-sheet}"
    rounded: "{rounded.statement-md}"
  peach-button-primary:
    backgroundColor: "{colors.peach-deep}"
    textColor: "{colors.peach-on-deep}"
    rounded: "{rounded.peach-md}"
    padding: "8px 14px"
    height: "36px"
  peach-button-primary-hover:
    backgroundColor: "{colors.peach-deep-pressed}"
  peach-tag-paid:
    backgroundColor: "{colors.peach-sage-wash}"
    textColor: "{colors.peach-sage}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  peach-tag-unpaid:
    backgroundColor: "{colors.peach-rose-wash}"
    textColor: "{colors.peach-rose}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  peach-due-soon:
    backgroundColor: "{colors.peach-butter-wash}"
    textColor: "{colors.peach-butter}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  peach-panel:
    backgroundColor: "{colors.peach-paper}"
    rounded: "{rounded.peach-md}"
---

# Design System: Lejer

## Overview

**Creative North Star: "The House Ledger"**

There is one ledger for the house, kept in one of two hands. **Statement** is the bank's
printout: a grey page, white sheets, a single blue, and IBM Plex Mono on every figure, date and
label, so the screen reads like the portal your utility company wishes it had. **Peach** is the
book kept on the porch: cream paper under a striped peach awning with a scalloped hem, Fraunces
for display, Karla for body text, and Courier Prime typing the figures in. Both share the same
components, the same layout and the same rules for money. The theme changes the hand, never the
record.

The feel is **friendly and sturdy**. Surfaces are flat paper divided by hairline rules, with
comfortable tap targets and soft corners. Nothing floats, glows or competes with the numbers.
The density is that of a well-kept statement: a summary strip of three figures, then ruled
tables that reflow into small ledger cards on a phone. Most visits happen on a phone, cold, once
a month, so every screen opens with what's owed and by when, and offers one obvious thing to do.

Theme differences are design, not inconsistency. Never "fix" one theme toward the other.
Fraunces and the awning are deliberate.

**Key Characteristics:**
- Two themes, one component set, switched by `<html data-theme>` from the household's settings.
- Every number, date, count and section label is set in the theme's ledger monospace with tabular figures.
- One accent per theme (statement blue, deep peach). Peach adds periwinkle as a quiet second voice.
- Green, red and amber (sage, rose and butter in peach) mean paid, unpaid and due soon, and nothing else.
- Flat surfaces with hairline borders. Shadows only on things that float.
- Statement supports dark mode. Peach is light-only on purpose.

## Colors

Each theme is a restrained paper palette: ink on paper, one accent, and three status colors kept
strictly for status.

### Primary
- **Statement Blue** (`statement-blue`): links, the active nav underline, focus rings, and solid
  primary buttons. Its deep step (`statement-blue-deep`) is the hover state, and its wash
  (`statement-blue-wash`) tints the demo banner and selection. In dark mode, links and focus use
  the lighter `statement-dark-blue` while buttons keep the saturated `statement-dark-button` so
  white text still reads. Hover goes deeper in both modes, never lighter: there's no room
  above the dark button for a visibly lighter blue that still carries white text.
- **Deep Peach** (`peach-deep`): the same role in peach. It's a burnt, terracotta-leaning peach
  that carries cream text (`peach-on-deep`), never pure white. It's one step darker than
  peach-cob's original, so cream text and links both clear 4.5:1 (see Contrast). Hover deepens to
  `peach-deep-pressed`, and `peach-blush` is the soft accent wash.

### Secondary
- **Periwinkle** (`peach-periwinkle`, peach only): the second voice, used for informational
  tags that are not money status. Statement has no secondary accent and should not gain one.

### Tertiary
- **Awning Stripe and Awning Cream** (`peach-awning-stripe`, `peach-awning-cream`, peach only):
  the cabana stripes. They appear only in the awning, the slim striped panel edge, and the email
  masthead stripe, never as fills, text or status.

### Neutral
- **Statement Paper / Sheet / Sheet Tint** (`statement-paper`, `statement-sheet`,
  `statement-sheet-tint`): the grey page, white panels and inputs, and the faint fill used for
  quiet chips and skeletons. Dark mode swaps in graphite equivalents
  (`statement-dark-paper` / `-sheet` / `-sheet-tint`).
- **Statement Ink / Ink Muted** (`statement-ink`, `statement-ink-muted`): a blue-black for body
  text and figures, and slate for eyebrows, captions and secondary cells.
- **Statement Rule / Rule Soft**: translucent ink at 16% for table header rules and input
  borders, and at 8% for row dividers and panel outlines.
- **Peach Cream / Paper / Paper Tint** (`peach-cream`, `peach-paper`, `peach-paper-tint`): the
  warm page, the panel sheet, and the tan tint for quiet chips.
- **Espresso / Espresso Muted** (`peach-espresso`, `peach-espresso-muted`): a warm brown-black
  ink and a cocoa grey. Rules are translucent espresso at 22% and 10%.

### Status
- **Statement:** paid green (`statement-paid`), unpaid red (`statement-unpaid`) and due-soon
  amber (`statement-due-soon`), each paired with a wash for its tag or chip background.
- **Peach:** sage (`peach-sage`), rose (`peach-rose`) and butter (`peach-butter`), with their
  washes.

### Data series
Charts (trends) get five series colors per theme and per statement mode, `*-series-1` to
`*-series-5` in the frontmatter. They're data, not interface: never a link, a button, a fill
or a status. Slot 1 is the theme's accent and the rest avoid the status hues entirely, so a
line never reads as paid, unpaid or due soon. Bill types take slots in the order they were
created and keep them as data changes or as lines are toggled. A sixth type onward folds into
"Other" in muted ink and a dotted stroke, never a generated sixth hue.
- **Statement:** blue, plum, sky, violet, magenta.
- **Statement dark:** the same hues, stepped for the graphite sheet.
- **Peach:** deep peach, periwinkle, plum, cobalt, orchid.

Each palette passes the dataviz validator against its own panel: lightness band, chroma
floor, protanopia and deuteranopia separation between neighboring slots (8.8 or better), and
3:1 against the panel. Without orange, green or yellow no set of four hues stays apart for
every pair, so identity never rests on color alone. Each slot has its own point shape, the
legend is a row of labelled toggle buttons, lines are named at their last point when four or
fewer show, and the tooltip names every value.

### Named Rules
**The Reserved Semantics Rule.** Green, red and amber (sage, rose and butter) belong to paid,
unpaid and due soon (overdue reads as unpaid). Never use them for decoration, branding or
generic success and error. The one exception is flash messages, which borrow the paid and unpaid
washes for ok and err.

**The One Accent Rule.** Each theme has exactly one interactive color. If something is
clickable and not a status, it is the accent or it is ink. Series colors are data and never
clickable; the legend toggle that shows or hides a line is ink, with the series drawn in its swatch.

**The Calm Red Rule.** Unpaid and overdue use the soft wash with colored text, never a solid red
block. Owing money is information, not an alarm.

### Contrast
Every text pair clears 4.5:1 (WCAG AA for body text). Peach's inks are a **corrected spec**:
phase 5 ports the values in this file, not peach-cob's originals, which failed. Each fix only
darkens the ink, keeping its hue; surfaces and washes are unchanged. Status tags are measured
against their wash flattened onto each surface.

| Peach pair | On cream page | On panel | peach-cob original (page / panel) |
|---|---|---|---|
| Espresso muted (eyebrows, captions) | 4.97 | 5.35 (4.61 on paper tint) | 3.98 / 4.29 (3.69) |
| Deep peach as link text | 4.61 | 4.97 | 4.31 / 4.65 |
| Cream on deep peach (primary button) | 4.75 (5.71 on hover) | | 4.45 |
| Sage on its wash (PAID) | 4.60 | 4.94 | 3.76 / 4.03 |
| Rose on its wash (UNPAID, overdue) | 4.61 | 4.93 | 4.43 / 4.74 |
| Butter on its wash (due soon) | 4.65 | 4.94 | 4.26 / 4.53 |
| Periwinkle on its wash (info) | 4.64 | 4.98 | 3.73 / 4.00 |

Series colors are marks, not text, and each clears 3:1 against its own panel (statement
light, statement dark and peach).

Statement light pairs measure 5.2:1 or better on page and panel. Its status tags measure at
least 4.53:1 on their washes over the panel, where tags live. Statement dark pairs measure
4.79:1 or better. White text on the dark button measures 5.16:1, and 6.43:1 on its hover. The
hover used to be a lighter `#4478e2` at 4.17:1. It now goes deeper instead, which closes the
last known gap.

**The Change It Once Rule.** Theme colors live in `lib/theme-tokens.ts`. Emails import them,
and `npm run verify` (the `tokens` suite) fails if `app/globals.css`, this file's frontmatter
or `.impeccable/design.json` disagrees. Change the module first, then the others.

## Typography

**Statement:** system UI sans for body text and IBM Plex Mono (400/500/600) as the ledger face.
**Peach:** Karla (400–700) for body text, Fraunces (400–600, italic available) for display, and
Courier Prime (400/700) as the ledger face.

**Character:** Statement pairs a neutral system sans with a crisp engineering mono, like a bank
portal printout. Peach pairs a soft, round grotesque with a warm old-style display serif and a
typewriter, like a ledger typed up and titled by hand.

### Hierarchy
- **Page title:** statement uses the sans at 700, 1.25rem, tight tracking. Peach uses Fraunces
  at 600, 1.6rem, tracking -0.01em. One per page, usually a greeting ("Hi, {name}") or the
  section name.
- **Display** (peach only; Fraunces 600, about 1.875rem): hero moments such as the login card and
  empty states.
- **Summary figure** (ledger mono at 600, 1.7rem, line-height 1.25, tabular): the three numbers
  in the dashboard strip (you owe or owed to you, next due, bills on record).
- **Body** (sans, root size clamp(15px, 1vw + 12px, 16px), line-height 1.55): prose, table
  cells at 0.875rem, and captions at 0.75rem in muted ink.
- **Eyebrow** (ledger mono, 0.7rem, uppercase; statement 500 weight with 0.14em tracking, peach
  700 with 0.16em): titles every block and every table header (0.68rem, 0.12em/0.14em).
- **Field label** (sans 600, 0.82rem): above every input.
- **Wordmark** (ledger mono 600, 0.8rem, uppercase, 0.14em): the household name in the
  statement nav. Peach sets it in Fraunces 600 at 1.125rem.

### Named Rules
**The Ledger Face Rule.** Every number, amount, date, count and section label is set in the
theme's ledger monospace with tabular figures (the `.figure` / `.eyebrow` voice). Prose never is.
If a value can be added up or put on a calendar, it is monospace.

**The Right-Edge Rule.** Amount columns are right-aligned so the decimal points line up.

## Layout

The layout is a single centered column with a maximum width of 1000px, a 16px gutter (20px from
`sm`), and 32px of vertical page padding. The header is a 52px bar (56px in peach, plus the
awning), and the footer is a hairline-topped strip with the household name in mono and the
household's reply-to address.

The dashboard rhythm is a page title, a muted "{household} as of {date}" line, a summary panel
split into three equal cells (stacked with horizontal rules on a phone, side by side with
vertical rules from `sm`), and then ruled tables grouped under eyebrows. Panel cells pad 20px by
16px, and table cells 16px by 12px (12px horizontally on a phone).

**Responsive:** the one breakpoint that changes structure is `sm` (640px). Below it, any
`.table-stack` table drops its header and reflows each row into a small ledger card, a CSS grid
with named areas (bill and amount on top, then due date, status and actions; the portal's bills,
which carry check-offs and up to four row actions, put the check-offs and then the actions on
rows of their own), so nothing ever scrolls sideways. Inputs are 16px below `sm` so iOS doesn't zoom on focus. Coarse pointers get
36px icon buttons.

**The No Sideways Scroll Rule.** A phone never scrolls horizontally. New tables join the
`.table-stack` system with their own grid-template-areas instead of overflowing.

## Elevation & Depth

The system is flat. Depth comes from tone (the sheet on the paper, the sheet tint inside the
sheet) and from hairline rules, not shadows. Shadows appear only on layers that genuinely float
above the page.

### Shadow Vocabulary
- **Dropdown** (`box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)`):
  the household switcher menu.
- **Dialog** (`box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)`):
  modal panels such as editing a bill, a bill type or a document.

### Named Rules
**The Flat Paper Rule.** Panels, cards, tables and buttons have no shadow at rest or on hover.
If it doesn't float over other content, it doesn't cast a shadow.

## Shapes

Corners are soft but small, like a trimmed sheet, not a bubble. Statement steps 4, 6 and 10px,
and peach steps 6, 10 and 14px, so peach reads one notch rounder throughout. Panels, buttons
and inputs use the middle step. Tags and due chips use the small step in statement and become
**full pills** in peach. Borders are 1px hairlines in translucent ink, and active nav and tab
states are a 2px accent underline, not a filled pill.

**The awning** is peach's signature silhouette: a 10px band of 14px peach and cream stripes
across the top of the page, finished with a 7px scalloped hem drawn by two offset radial
gradients. It sits once, at the very top of the header, with its hem hanging over the bar. A slimmer cousin, `.panel-awning`, gives a panel a
6px striped top edge with no scallop.

## Components

### Buttons
Friendly and sturdy: a comfortable height, soft corners, and plain sans labels.
- **Shape:** the middle radius (6px statement, 10px peach), a minimum height of 36px, and 8px by
  14px padding at 0.875rem/500.
- **Primary:** an accent fill with white text in statement and cream (`peach-on-deep`) in peach.
  Hover moves to the deep step. Use one per screen, for the screen's obvious action.
- **Default:** sheet background, 1px rule border and ink text. On hover the border darkens to
  40% ink.
- **Small** (28px min, 4px by 10px padding, 0.8rem): for inline row actions only.
- **Icon** (28px square, 36px on touch): a transparent background with a soft rule and muted
  icon. It turns ink on hover. Phones have no hover titles, so in a phone card's action row the
  portal's remind and edit buttons widen to carry their word ("Remind", "Edit").
- **Focus:** a 2px accent outline offset by 2px on every button. **Disabled:** 60% opacity with
  the default cursor.
- **Motion:** colors transition in 100ms and nothing moves.

### Tags and Due Chips
- **Status tags** (`StatusTag`): one vocabulary everywhere, PAID or UNPAID, for owners and
  debtors alike. Ledger mono at 0.7rem, uppercase, 0.08em tracking. PAID is the paid color on
  its wash; UNPAID is the unpaid color on its wash **only once the bill is past due**. Before
  that it's the neutral open tag (`.tag-open`: sheet tint, muted ink), so red always means late
  and an owner's open bills never look alarming. Square-cornered (4px) in statement, bold pills
  in peach.
- **Due chips** (`DueChip`): ledger mono at 0.7rem with tabular figures, rendered on the server
  from the **household's** today and its urgent window (`urgent_reminder_days`), the same rules
  as the reminder emails, never the device's date. Neutral when paid or in the future,
  butter/amber within the urgent window, rose/red when overdue. The visible "Oct 5 • Past due
  2d" is shorthand; screen readers get the sentence ("Due Oct 5, past due by 2 days").
- 0.7rem is the floor for tags anywhere, swatches included.

### Cards / Containers
- **Panel:** a sheet background, a 1px soft rule, and the middle radius with no shadow. Panels
  hold the summary strip, every table, and every form.
- **Internal padding:** 20px by 16px for summary cells, while table panels let the cells pad
  themselves.
- **Peach awning panel:** an optional striped 6px top edge for a featured panel.

### Inputs / Fields
- **Style:** full width, sheet background, 1px rule border, middle radius, 8px by 12px padding,
  16px text on a phone and 14px from `sm`, with placeholder at 70% muted ink.
- **Focus:** the border turns accent with a 2px ring of the accent at 25%.
- **Label:** a sans 600 label at 0.82rem, 6px above the field.
- **Hint** (`.field-hint`): muted 0.75rem under a field, capped at 60ch so it reads as a line,
  not a paragraph across the panel. Longer explanatory sentences in a form cap at 60ch too.
- **Computed figures are output, not fields** (`.field-output`): a ruled line under the inputs
  with `<output>` figures in the ledger face ("Total $87.70 (incl. $3.50 fee) · $29.23 each of
  3"). Nothing that can't be typed into is drawn as a box.

### Settings Save Bar
Settings is one long form with one Save. The form counts the fields that differ from what it
loaded; once there's at least one, on a phone the Save row sticks to the bottom of the screen
on the page color with a soft top rule, reading "2 changes not saved yet" beside the button.
From `sm` the row stays in place at the end of the form, with the count after the button.

### Navigation
- **Header:** a sheet-colored bar with a soft bottom rule. On the left is the household name as
  the wordmark, with its tagline beside it in the eyebrow voice from `md`, and the wordmark
  becomes a dropdown only for people in more than one household. On the right are text links
  (Dashboard, Portal, Trends, Docs, Account) and Sign out. A feature that's off loses its link.
- **Phone menu:** below `sm` the links fold into one "Menu" disclosure, a default button with a
  caret. Its sheet drops under the header at full width with the dropdown shadow (it floats),
  and the links stack at a 44px height, divided by soft rules. The current link is ink with a
  2px accent rule on its left edge. The menu closes on every navigation.
- **States:** links are muted sans at 0.875rem/500. Hover turns them ink, and the active link
  gets ink plus a 2px accent underline running the full bar height.
- **Peach:** the awning sits at the very top, the wordmark is Fraunces, and a soft rule sits
  under the bar.
- **No logo, in either theme.** The household name is the identity. Peach-cob's PeachMark was
  that house's mark and doesn't come over. A product mark arrives later, with the final brand.
- **Portal tabs** (`.tab`, `.tab-active`, `PortalTabs`): the same underline language at a
  smaller scale, under the portal's page title. The labels are muted sans at 0.875rem/500 and
  turn ink on hover, while the current tab is ink with a 2px accent underline. A soft rule runs
  the full width beneath them, and they scroll sideways inside their own strip rather than
  wrap, the one sanctioned horizontal scroll. Bills, Household and Settings show for everyone;
  Email shows only to admins, and only while bulk email is on.

### Dialogs
There is one modal, `Dialog`: a native modal `<dialog>` (`.dialog`), a panel at the large
radius with the dialog shadow over a 35% black scrim. A display-voice title (Fraunces in peach)
names the action and its object, then the body, then a ruled footer with Cancel first and the
action as the primary button. Escape and the backdrop cancel, and focus returns to whatever
opened it.
- **Confirm** (`ConfirmButton`) asks before a destructive or consequential action: removing a
  member, a bill type or a document, deleting a bill, sending a reminder, or saving a change of
  mode or payer. One or two muted sentences on what happens and what doesn't; Cancel is focused
  first, so Enter never confirms by accident. Nothing uses the browser's `confirm()`. Routine
  saves never ask.
- **Form dialogs** hold a short form: adding or editing a bill type, and editing a bill
  (`.dialog-wide`, 36rem, for two fields side by side). The bill dialog's description says
  what saving does to the email; its footer carries "Delete bill" on the left, which asks again
  in a nested confirm. A save that goes through closes the dialog and the page's flash reports
  it; errors stay inside the dialog.

### Choice Cards
Settings choices with consequences (the mode, the theme) are radio cards: a 1px rule panel at
the middle radius with a bold label and a muted line under it. The chosen card takes the accent
border and the accent wash. Theme cards also carry a swatch of the theme drawn from its own
tokens and faces (page, greeting in the display face, a PAID tag and a ledger figure), so the
choice reads before saving.

### Trends Chart
A line per bill type on a panel, by statement month, at most 12 months ending this month: 2px
lines with gentle tension, 4px point shapes ringed in the panel color, horizontal soft-rule
grid lines only, and muted mono ticks. It draws in place with no entrance animation. Above it
sits a row of legend toggles (`.legend-toggle`, `aria-pressed`): small default buttons with the
series swatch, struck through and dimmed when off. The "compare with a year earlier" option
(`.legend-option`) adds dashed lines at 55% and reads as a wash when on. The chart rebuilds when
the theme or the device scheme changes. Under it, a ledger table of totals per type is the
text equivalent: on a phone each figure takes its own line, label left, amount right.

### Calendar Links
Two small default buttons with a drawn calendar icon, "Apple Calendar" (`webcal://`) and
"Google Calendar". From `sm` they sit at the right of the dashboard greeting; on a phone they
come after the summary strip, so the money is the first thing on the screen. On `/account`
they sit beside the copyable link and the reset.

### Ledger Table (signature)
The ruled table is the system's main element. It has mono uppercase eyebrow headers over a 16%
rule, 8% rules between rows, no zebra striping, right-aligned amounts, and the last row
unruled. On a phone it reflows into ledger cards (see Layout).

### Summary Strip (signature)
One panel split into three cells divided by soft rules. Each cell holds an eyebrow, a 1.7rem
mono figure, and a muted caption that says it in words ("across 2 unpaid bills", "all settled
up"). It is the first thing on the dashboard and the answer to "what do I owe". When the next
due date has passed, its caption says so in the unpaid color ("Water · 2 days late"). When
nothing is due from the viewer but they're owed on an open bill (the single payer, or any
owner), Next due is the soonest of those and who hasn't paid ("Electric · Sam hasn't paid
you"). An empty figure reads "None" in muted ink, never a dash.

### House Ledger
One row per direction, as recorded: "Alex owes you $30.00", "You owe Alex $12.00". The money
on every surface is gross and agrees with the strip, the portal and the reminders. When two
people owe each other their rows sit together, followed by one muted 0.75rem line: "Settling
at once? Alex pays you $18.00 and you both check off each other's bills." The net never
appears as a primary figure. The viewer's own rows come first.

### Flash Messages
These are full-width bordered notes at the top of the content. Ok uses the paid wash with a 40%
paid border, and err uses the unpaid wash with a 40% unpaid border. Both keep their text in ink.

### Email Shell
Emails use the same two themes in inline styles only, light only, 560px wide. Statement has a
grey page, a white panel with a 10px radius, mono eyebrows and a blue button. Peach has cream
paper, an 8px awning stripe above the panel, Georgia body text and Courier eyebrows, because
email clients can't load Fraunces, Karla or Courier Prime. Colors aren't copied by hand:
`emails/Shell.tsx` imports them from `lib/theme-tokens.ts`. Translucent rules are flattened onto
the panel, and the stripe uses the app's awning colors and 14px width.

### Motion
Motion is minimal and functional: 100ms color transitions and a pulsing skeleton while loading.
Peach's welcome tour (peach-cob, `feature_welcome_tour`) adds staggered entrances (`tour-pop`
0.4s and `tour-slide` 0.45s, both with a slight overshoot) and a PAID stamp that drops oversized
and settles at -3° (`tour-stamp`). A global `prefers-reduced-motion` rule at the end of
`app/globals.css` cuts every animation and transition to an instant, so new motion is covered
without opting in.

## Public Site: The Drafting Sheet

**Creative North Star: "The Floor Plan"**

The signed-out site (`/`, `/how-it-works`, `/about`, the `app/(site)` route group) is a third
visual world, separate from both household themes, the way a theme marketplace's own homepage is
not one of its themes. The household is drawn as an apartment floor plan on a cool white drafting
sheet: each bill is a utility line that runs from the meters along the hall and drops into every
room that splits it, and each share is written in the room like a dimension. Black ink and four
sidewalk-locate utility colors are the whole palette. Tone comes from hatching, never tints.

**Boundary.** Every token below lives only in `app/(site)/site.css`, scoped to `html[data-site]`
(set by the site's own root layout, `app/(site)/layout.tsx`, which never renders household chrome). None of it is
in `lib/theme-tokens.ts`, the frontmatter above or `.impeccable/design.json`'s `colorMeta`, and
none of it ever applies to household pages, the portal or email. Statement and peach never
reach the site. The household themes stay exactly as documented above.

**Key Characteristics:**
- One-bit palette: ink on sheet, with color reserved for the four utility lines.
- Every utility has a color, a dash pattern and a name, so color is never the only cue.
- Size is billing: share figures are the largest type on the page, all the same size.
- Square, inked, 1.5px-ruled everything. No radius, no shadow.
- Light only.

### Colors

- **Drafting Sheet** (#f3f5f4): the page and the sheet frame's ground, under a 24px grid of ink
  at 4.5% opacity. Also the browser `theme-color`.
- **Sheet Highlight** (#fbfcfb): rooms, share chips, fields, the inner pages' close panel, step
  asides, and the text on ink buttons.
- **Ink** (#111315): text, every rule and frame, the wall poché, the primary button fill. Hover
  on an ink button lightens to #2b3036.
- **Ink 2** (#4a5056): secondary text (ledes, prose, captions, drawing labels, inactive nav
  and footer links).
- **Rules**: ink at 20% for hairlines between list rows and around unselected bill tabs, ink at
  10% for hatching.
- **Utility locate colors**, line work only, never text or fills:
  - **Electric** (#d6231b), dash `13 3 3 3` (dash-dot).
  - **Gas** (#d29c00), dash `9 5` (even dashes).
  - **Water** (#1b5ecf), dash `1.5 4.5` (dotted). Water blue doubles as the focus ring (2px,
    2px offset; 0 offset on fields).
  - **Wifi** (#ec6612), dash `15 3 1.5 3 1.5 3` (dash-dot-dot).
- **Highlighter** (yellow `rgba(242, 196, 0, 0.42)`): text selection only, with ink text.

**The Locate Code Rule.** A utility color always travels with its dash pattern and its name (the
tab swatch, the trunk, the drop, the lane label). Color alone never carries meaning, and the
four colors never color text, fills or backgrounds. Two rules may be drawn in it: the selected
tab's 3px bottom rule, and the 3px border of the chip belonging to whoever fronted the bill,
which is how the owner's room reads at a glance.

**The Hatching Rule.** When a surface needs tone it comes from 45° hatching (1px ink at 10%
every 8 to 9px). Never a tinted fill. The home page currently needs none: it is ink on sheet.

### Typography

**Display and body:** Archivo, loaded with its width axis (`--f-archivo`). Headings run
expanded and heavy: the home H1 800 at 112% width, clamp(2.2rem to 3.6rem), line-height 1.02,
-0.028em, max 18ch; inner-sheet H1s clamp(2.4rem to 4.2rem); H2 800 at 108%, clamp(1.7rem to
2.4rem), max 22ch; H3 700 at 1.08rem. The wordmark is 800 at 118% (1.1rem in the footer). Body
prose 1.04rem / 1.6 in ink 2, max 62ch; the home lede up to 1.15rem, max 56ch; buttons and
bill tabs 650.

**Figures and labels:** Martian Mono with its width axis (`--f-martian`), tabular figures,
condensed: 87.5% for amounts, room numbers and the sample note, 75% for the share figures, 85%
for step numbers. Labels (room numbers, the meter tag, the sample note, the 404's number) are
uppercase at 0.58 to 0.66rem with 0.06 to 0.1em tracking. These are drawing annotations that
name the thing beside them, not section kickers; nothing else on the site is set in mono.

**The Size Is Billing Rule.** On the plan, the share figures (mono 600 at 75% width,
clamp(2.1rem, 0.9rem + 5.2cqi, 3.5rem)) outweigh the H1. Every figure is the same size and
every chip the same width (16rem, or the room's width), so selecting a bill never reflows the
sheet; the owner is told by color, not size. The currency sign sits at 0.6em, raised. A
checked-off share keeps its size, drops to ink 2 and takes a 2px strike.

### Layout

**Pitch first, then the one drawing.** The home page reads top to bottom inside a 1360px wrap
(16px gutters, 28px from 640px): a plain hero (H1, lede ending in the facts, the signup as one
row with its small print on one line) with no frame around it, then the sheet, the page's only
frame: 1.5px ink on the 24px grid, up to 1100px wide and left-aligned with the hero, holding
the plan and nothing else. Price and
"never moves money" live in the lede, not in a table. There is no sidebar at any width.

**Poché walls.** The plan is a CSS grid whose background is ink; the grid gap is the wall
(7px, 8px from a 720px container) and each room is a sheet-highlight cell. Four bedrooms sit
two above and two below a hall (104px, 116px tall) where the trunks run in lanes and the
meters stand at the hall's end, the same four rooms at every width: no decorative rooms.
Bottom-row rooms reverse their stack so the share sits by the hall wall. Above the rooms one
bar: a tab per bill on the left, the mode toggle on the right; below them one line, the split
in words with the sample note at its end.

**The Lane Label Rule.** Only the selected bill's lane is labeled (name and total); the others
are named by their tabs. The label is set in the rightmost gap along the hall that is clear of
every drop, measured from its rendered width, and haloed in sheet highlight (4px paint-order
stroke) so a drop passes under it, never through it. Fall back to beside the meters.

**Below the sheet** the home page says three things and stops: three facts in one row from
760px under a single 1.5px rule, one line on reminders handing off to How it works, then the
close (a rule, the heading and the signup side by side from 900px). What How it works already
covers is not repeated here. The inner pages keep their calmer rhythm: sections of 64px (96px
from 640px) divided by 20% rules, a 5:7 split from 900px with a sticky heading, numbered notes
and steps with mono counters, and a framed close panel.

**Phone reflow.** The order is the same, the pieces stack: H1, lede, the signup as a column,
then the sheet with the bill tabs 2 by 2 and the mode toggle full width above the 2 by 2 rooms,
the facts one under another, the close, and the footer as a column. The header stays one row
at every width: wordmark, two page links, Sign in; the demo button appears from 640px because
the hero's demo link is a thumb away on a phone.

### Elevation & Depth

Flat and light only (`color-scheme: light`; there is no dark sheet: it is a sheet of paper and
the figures must read on it at a glance). Depth is line weight: 1.5px ink for frames, fields,
buttons and section tops, 1px for internal divisions, 20% ink for hairlines. The owner's share
chip uses a 3px border in the bill's color instead of any lift. No shadows anywhere.

### Shapes

Square. No radius on buttons, fields, chips, frames or panels (`border-radius: 0` is explicit
on inputs). Terminals at the end of a drop are 9px squares for the owner (filled ink) and 3.5px
radius circles for splitters (filled in the utility color), both outlined in ink.

### Components

- **Buttons:** square, 48px tall (38px small), 20px side padding, 1.5px ink border, Archivo 650
  at 106% width. Primary is an ink fill with sheet-highlight text, hovering to #2b3036. Line is
  transparent with ink text, hovering to sheet highlight. Arrows are an inline 18 by 10 stroked
  SVG. Color transitions 120ms ease-out.
- **Fields:** square, 48px tall, 1.5px ink border, sheet-highlight fill, 16px text, ink caret;
  focus is the 2px water-blue outline. The signup pairs field and button in one row from
  640px (max 560px), with one line of small print below in ink 2 that also carries the demo
  link; the field's label is for assistive tech, the heading above is its visible label.
- **Text links:** 600 weight, underline 1.5px at 4px offset in rule color, inking on hover.
- **Segmented toggle:** two equal ink-bordered cells; the pressed one fills ink.
- **Bill tabs:** a toggle per utility with its dashed swatch and name only (its total and who
  fronts it appear on the plan once selected, and in the tab's accessible name); 42px tall,
  bordered in 20% ink; the selected one takes an ink border, sheet-highlight ground and a 3px
  bottom rule in its color. Two by two under a 560px container, one row above.
- **Share chip:** a button in the room with the figure, a drawn checkbox and a caption ("owes
  Jordan · due Oct 13"), 16rem wide; the owner's chip is ruled 3px in the bill's color, its
  caption in ink ("fronted $104.12 · owed back"), and is not a toggle.
- **Site nav:** the wordmark (the way home) and two plain Archivo links, How it works and
  About, in ink 2; the current page inks its label and takes a 2.5px ink underline that sits
  on the header's rule. No sheet numbers. `lib/site.ts` holds the links.
- **Footer strip:** one row under a 1.5px rule: the wordmark, the page links plus Sign in (or
  Your households) and Try the demo, and "© year Built by" with `BRAND.legalName` linked to
  `BRAND.legalUrl` at the far end; a column under 640px.
- **Close:** on the home page a 1.5px rule, the heading and prose beside the signup from
  900px; on the inner pages a framed panel on sheet highlight, heading and prose beside the
  signup from 900px, divided by a 1px ink rule.

### Motion

**Pencil, then ink.** Selecting a bill, or switching modes, redraws every drop: a 1px ink pencil
line draws along the path (520ms, cubic-bezier(0.16, 1, 0.3, 1)) and fades, then the colored
ink line appears (260ms ease-out) 300ms later, staggered 110ms per room. Trunks brighten from
40% to full opacity on selection (200ms). A checked-off or owner drop turns solid and heavier
(3.5px). The global reduced-motion rule in `app/globals.css`, which the site also loads, cuts
all of it to an instant.

### Do's and Don'ts (site only)

- **Do** keep the site's tokens in `app/(site)/site.css` under `html[data-site]`, and keep them
  out of `lib/theme-tokens.ts`, the frontmatter and the email shell.
- **Do** give any new utility or line all three cues: a locate color, a distinct dash pattern
  and a name.
- **Do** set every amount, sheet number and drawing label in Martian Mono with tabular figures
  at a condensed width.
- **Do** keep share figures bigger than the H1, all one size, and mark the owner by color.
- **Do** add a new public page to `SITE_LINKS` in `lib/site.ts` (the header and footer map
  over it) and to `SITE_PAGES` so the proxy lets it through.
- **Don't** put statement or peach on a site page, or the drafting sheet on a household page.
- **Don't** tint a surface for tone. Hatch it.
- **Don't** round a corner or add a shadow.
- **Don't** add a dark scheme to the site.
- **Don't** use a utility color for text or a fill.
- **Don't** add a second frame, a sidebar or a key/value table to the home page. The sheet is
  the only framed thing; everything else is plain type on the page.

## Do's and Don'ts

### Do:
- **Do** set every amount, date, count and eyebrow in the theme's ledger mono with tabular
  figures, and right-align amount columns.
- **Do** build every new surface from the shared component classes (`.panel`, `.btn*`, `.tag*`,
  `.due-*`, `.field-*`, `.data-table`, `.eyebrow`, `.figure`) so both themes come for free. A
  theme varies tokens and a few signature rules, not markup.
- **Do** add theme differences as token overrides under `[data-theme="peach"]`, keeping
  peach's rounder radii, pill tags, bolder eyebrows, Fraunces titles and awning.
- **Do** give each screen exactly one primary button, and keep its tap target at 36px or more.
  The small button is for inline row actions.
- **Do** make every new table a `.table-stack` with named grid areas for its phone layout.
- **Do** pair every figure with a plain-words caption in muted ink ("from 2 roommates",
  "nothing due from you").
- **Do** check new color pairs in both themes and in statement dark, and keep text at 4.5:1 or
  better. Record peach's measured ratios in Colors > Contrast.
- **Do** change a theme color in `lib/theme-tokens.ts` first, then mirror it in
  `app/globals.css`, this file and `.impeccable/design.json` until `npm run verify -- tokens`
  passes.
- **Do** give a chart a legend of real buttons, a point shape per series, and a table that
  says the same thing in figures. Take series colors from `--series-N` in slot order.
- **Do** ask with `ConfirmButton` before anything that removes, sends or reassigns, and never
  with the browser's `confirm()`. Put any other modal content in `Dialog`; never hand-roll an
  overlay.
- **Do** leave an empty cell empty. No "—" placeholders in tables or figures.
- **Do** let the global reduced-motion rule handle motion. Never re-enable animation with
  `!important` under `prefers-reduced-motion`.

### Don't:
- **Don't** "fix" peach toward statement or statement toward peach. Fraunces, the awning, the
  pills and the warm palette are intentional, not slop.
- **Don't** give peach a dark mode. It is light-only on purpose.
- **Don't** use green, red or amber (sage, rose or butter) for anything but paid, unpaid and due
  soon, and don't add a second accent to statement. Series colors stay inside charts.
- **Don't** fill a block with solid red for an unpaid or overdue state. Use the wash and colored
  text.
- **Don't** add shadows, gradients or glows to panels, cards or buttons at rest. The awning
  stripes are the only gradient in the system.
- **Don't** let a phone layout scroll sideways, or set an input below 16px on a phone.
- **Don't** spell the product name or domain in UI or email. Read them from `BRAND`.
- **Don't** put a logo in the nav. The household name is the wordmark.
- **Don't** hard-code a color in an email template. Take it from `lib/theme-tokens.ts`.

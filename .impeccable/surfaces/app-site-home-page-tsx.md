---
version: 1
slug: "app-site-home-page-tsx"
primary_target: "app/(site)/home/page.tsx"
related_targets: ["app/(site)/how-it-works/page.tsx","app/(site)/about/page.tsx"]
---

# Public site (home, how it works, about)

Scope: the public marketing site for signed-out visitors: `/` (rewritten to the home page when
there's no session or demo cookie), `/how-it-works`, `/about`. Mode: **Persuade**.

Audience: roommates (often non-technical, on a phone) deciding whether to set up a household,
usually because a friend sent the link. Job: understand in seconds that this is a record of the
house bills: who owes whom, how much, by when. It never moves money. Action: start a household
with the real email-code login (email field in the hero), or open `/demo`.
Proof: the interactive plan with the demo household's names and amounts (Robin, Jordan, Casey,
Morgan; Electric, Gas, Water, Wifi), labeled as a sample. Claims allowed: free, no ads, no card
(user-confirmed 2026-10-07); made by Aaron Perkel LLC. No testimonials, counts or press.
Constraints: the site does not wear either app theme (statement/peach are the ledger's themes,
like WordPress themes versus wordpress.org). Name and domain come from `BRAND`.

## Direction contract

THESIS: The household drawn as an apartment floor plan: each bill is a utility line from the
meter to the room of the person who fronts it, branching into every room that splits it, with
each share written on like a dimension. It refuses the split hero (headline left, phone right,
three feature cards).

OWN-WORLD: A cool white drafting sheet on a faint grid with black wall poché. Lines use the
four sidewalk-locate utility colors (electric red, gas yellow, wifi orange, water blue), and
each also has its own dash pattern and name, so color is never the only cue. Tone comes from
hatching, never tints. Archivo, expanded for display; Martian Mono for figures, sheet numbers
and labels. Ink-black buttons. The sheet-index nav reads A-101 / A-201 / A-301.

STORY: The visitor sees their own apartment and each roommate's share as big figures, flips
between one payer and everyone fronting something, and checks off a share. They learn that it
records payments and never moves money, and they enter an email or open the demo.

FIRST VIEWPORT: Desktop: a sheet frame. The plan takes about two-thirds on the left, with the
four bedrooms above and below a hall where the utility trunks run in lanes and the meters sit
at the hall's end. Each room shows a share as the largest type on the plan. A vertical title
block on the right holds the H1, a subline, the email field with "Email me a code", the demo
link and "Free. No ads. No card." Above the plan sit the mode toggle and a legend of bill
toggles. Phone: the title block, then the controls, then a 2×2 room grid around the hall.

FORM: Apartment-listing floor plan with MEP utility drawing conventions, grounded candidate 5 of
7. Seed key d4d5bbbd. Raises: palette discipline (one-bit), fixed decimal figures (nixie),
paid state travelling along the line (chromatophore), size is billing (painted poster).
Signature interaction: selecting a bill redraws its lines from the owner's room to each
splitter; the mode toggle redraws every trunk; checking off a share turns its drop solid.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## User steer (2026-10-07)
- The money labels are the loudest thing on the sheet. If it starts to look like an
  architecture firm's site, cut drafting detail, never the figures.
- Phone first: at 390px use a 2×2 room grid with the lines rerouted and the title block above.
- Never color alone: every line carries its name and share as text, plus a distinct dash.
- Show both modes: the toggle visibly redraws the lines.
- Drafting world for the hero and accents only. Body sections stay calm and readable.
- The email field uses the real login flow, and the demo link goes to /demo.

## Unresolved
- Whether DESIGN.md gains a third "site" world section, or the site gets its own design file
  (DESIGN.md currently describes the app's two themes).

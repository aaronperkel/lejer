---
version: 1
slug: "app-site-page-tsx"
primary_target: "app/(site)/page.tsx"
related_targets: ["app/(site)/how-it-works/page.tsx","app/(site)/about/page.tsx"]
---

# Public site (home, how it works, about)

Scope: the public marketing site for signed-out visitors: `/` (the home page for everyone,
signed in or not; households live at `/{slug}`), `/how-it-works`, `/about`. Mode: **Persuade**.

Audience: roommates (often non-technical, on a phone) deciding whether to set up a household,
usually because a friend sent the link. Job: understand in seconds that this is a record of the
house bills: who owes whom, how much, by when. It never moves money. Action: start a household
with the real email-code login (email field in the hero), or open `/demo`.
Proof: the interactive plan with the demo household's names and amounts (Robin, Jordan, Casey,
Morgan; Electric, Gas, Water, Wifi), labeled as a sample. Claims allowed: free, no ads, no card
(user-confirmed 2026-10-07); made by `BRAND.legalName`. No testimonials, counts or press.
Constraints: the site does not wear either app theme (statement/peach are the ledger's themes,
like WordPress themes versus wordpress.org). Name, domain and legal name come from `BRAND`.

## Direction contract

THESIS: The household drawn as an apartment floor plan: each bill is a utility line from the
meter to the room of the person who fronts it, branching into every room that splits it, with
each share written on like a dimension. It refuses the split hero (headline left, phone right,
three feature cards).

OWN-WORLD: A cool white drafting sheet on a faint grid with black wall poché. Lines use the
four sidewalk-locate utility colors (electric red, gas yellow, wifi orange, water blue), and
each also has its own dash pattern and name, so color is never the only cue. Tone comes from
hatching, never tints. Archivo, expanded for display; Martian Mono for figures and drawing
labels only. Ink-black buttons. Plain nav: wordmark, How it works, About.

STORY: The visitor reads the pitch, sees their own apartment and each roommate's share as big
figures, flips between one payer and everyone fronting something, and checks off a share. They
learn that it records payments and never moves money, and they enter an email or open the demo.

FIRST VIEWPORT: Desktop: a plain hero at the top, no frame: the H1, a lede that ends with
"free, no ads, no card, never moves money", and the sign-up as one row (email field, "Email me a
code") with one line of small print carrying the demo link. Below it the sheet, the page's only
frame: a bar with four bill tabs (dash and name) on the left and the mode toggle on the right,
then the four bedrooms around the hall with the trunks in lanes, the meters at the hall's end,
only the selected lane labeled, and each share as the largest type on the page; one line under
the rooms says the split in words with "Sample household" at its end. Phone: the same order,
stacked: H1, lede, sign-up as a column, then the sheet with the tabs 2×2 and the toggle full
width above a 2×2 room grid. Below the sheet: three facts in a row, one line on reminders with
the link to How it works, a slim close with the sign-up, a one-row footer.

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

## User steer (2026-10-07, distill)
- Liked the world but found the first build "a lot to look at" and confusing to navigate, with
  the sign-up off to the right and "so much text and lines". Pitch and sign-up now come first,
  plain, with the plan full width below as the page's only frame.
- Cut, not softened: the title block and its key/value table, the legend cards' totals and
  owners, the kitchen and living room, the unselected lane labels, the sheet numbers and the
  phone's second nav row, the general notes, the reminder timeline, the sample emails, the
  framed close and the four-cell footer. How it works keeps everything the home page dropped.
- Copy facts: PDFs are optional ("Attach the statement to any bill"), and amounts stay editable
  until someone pays, so the fixed thing is who splits a bill, never the amount.
- The legal name is `BRAND.legalName`, never a literal.

## Unresolved
- Whether DESIGN.md gains a third "site" world section, or the site gets its own design file
  (DESIGN.md currently describes the app's two themes; the site section sits at its end).

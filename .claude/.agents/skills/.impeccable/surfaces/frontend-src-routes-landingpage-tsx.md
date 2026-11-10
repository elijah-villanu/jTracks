---
version: 1
slug: "frontend-src-routes-landingpage-tsx"
primary_target: "frontend/src/routes/LandingPage.tsx"
related_targets: ["docs/wireframes/landing-v5.html","docs/wireframes/landing-v3.html","docs/wireframes/landing-v4.html","docs/wireframes/landing.html"]
---

# Landing page (`/`)

- **Mode:** Persuade.
- **Audience:** cold visitors. Prospective users (job seekers) come first; recruiters and portfolio visitors also read it.
- **Action:** understand what JourneyJob is from the first viewport, then Start your journey (`/signup`). Returning users go to Log in (`/login`).
- **Proof and content:**
  - The sample month recap: 34 applications, 7 interviews, 1 offer, 6 ghosted, 11 rejected, 2 Failed Interview/OA, 53% response rate, 18% ghost rate.
  - The ghosting table: 8 sample applications, with its count taken from those rows.
  - There are no testimonials or usage metrics.
- **Constraints:**
  - No authenticated requests.
  - Demo data is hard-coded.
  - Friends and milestones never appear as existing features. The privacy section was removed; its slot returns for milestones and friends once they ship.
- **Stage:** wireframe. The current one is `docs/wireframes/landing-v5.html`, built from v3 with named parts of v4. Earlier versions stay in `docs/wireframes/` for comparison.

## Unresolved

- The neutral look is the user's choice "for now"; the final visual world is not locked.
- The page no longer labels its demo data outside the wireframe bar. PRODUCT.md says demo data stays clearly demo, so production needs a place for that.
- The closing form sends `posting` and `status` to `/signup`, which ignores them today. Wire it, or make the section a plain button.
- The theme icon, and Cancel and Save in the form fragment, are still placeholders.

## Direction contract

THESIS: Open on the artifact people share, one sample month shown one recap card at a time. The rest of the page shows how those cards get made on a private board. It refuses the split hero with a dashboard screenshot over a row of feature cards.

OWN-WORLD: Switzer on a near-white neutral ground, with greys for structure and the binding #0F57FE blue on the sign-up actions, the Offer path in the funnel and one full-width closing field. Product fragments carry 8px corners and hairlines; page actions are pills.

STORY: The visitor sees a month of a job search worth posting and pages through its three designs. They learn the card comes from pasting a link, a ghosting threshold they control, and a pipeline they can read. Then they start with one link.

FIRST VIEWPORT:
- The nav holds the logo, How it works, Recaps, Log in, the theme control, and Start your journey.
- The left column holds a two-line H1 at display size, one line of subcopy, Start your journey, and Log in.
- The right column holds a carousel of three 9:16 recap cards. One card shows at a time, arrows sit only where another card exists, and a neighbouring card's edge peeks as a faint fade. Three bars at the top of each card show its position; the active one fills on arrival.
- Card footers carry the month bottom-left and the logo bottom-right, with no skin names and no sample-data caption.
- On a phone, the copy comes first. The carousel runs edge to edge and swipes with native scroll-snap, with the arrows in the side zones.

FORM: Three skins, one month, which is position 6 on the ordered list of 7 structures, now shown as a carousel at the user's request. seed:8e2e98a1e6f1f690

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

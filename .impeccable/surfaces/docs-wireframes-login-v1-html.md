---
version: 1
slug: "docs-wireframes-login-v1-html"
primary_target: "docs/wireframes/login-v1.html"
related_targets: ["frontend/src/routes/LoginPage.tsx","frontend/src/routes/SignupPage.tsx"]
---

# Login and signup (wireframe v1)

Scope: `/login`, `/signup` and a new password-reset flow (designed ahead of the backend, marked as not built). Mode: Operate.
Audience: a job seeker coming back to their board (most visits), or someone arriving from the landing page's "Start your journey". Job: get into the board. Constraints: email + password and Google only; signup has no name field; passwords are 8 to 256 characters; a taken email returns 409; there is no reset endpoint yet. The look is pinned by the user: one identity with the landing page and the app.

## Direction contract

THESIS: Signing in asks one thing per screen: Google, or an email and then a password, in the app's own type and controls. It refuses the stock auth card with every field stacked at once and the split screen with a marketing panel.

OWN-WORLD: The app unchanged: Switzer 400/500/600, zinc neutrals on #fafafa (#171717 dark), 8px-radius fields and buttons, the 56px top bar with its bottom border, sentence-case labels. Blue #0F57FE fills the one primary button per step; everything else is ink and grey.

STORY: A returning user is in after Google, or after two short steps with email. A new user creates an account the same way. Someone locked out resets by email without leaving the flow, and is told plainly when no email will arrive.

FIRST VIEWPORT: App top bar: logo left (home), theme button right, no mode switch. A 400px column, centred, top at about 16vh: h1 "Log in" at 40px/600 with no subtitle, Continue with Google (44px line button), "or", Email label, 44px field, blue Continue, then a "New here? Register" line left-aligned with the fields with Register underlined (sign up mirrors it with "Have an account? Log in"). Session ended is a small red-tinted notice under the top bar's right edge: an x to close, and a 3px bar that drains over 5s and then closes it, paused on hover, on focus and while the tab is hidden. Phones: same column at 16px gutters, 48px controls, top-aligned so the keyboard never covers Continue.

FORM: Surface structure 6 of 7 on my ranked list, "One question at a time" (dealt lead). seed:8299571c7866fea8. Signature interaction: the step change. The email folds into a chip with Change at the top of step 2, the password field arrives 12px from the right with a fade (200ms ease-out) and takes focus; Back reverses. Reduced motion: fade only.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

- Reset link lifetime and resend wait are proposals for the backend, not facts.
- The session-ended notice ships only if the refresh-failure path tells /login why the user landed there.
- On phones, the notice floats over the h1 for its 5 seconds.

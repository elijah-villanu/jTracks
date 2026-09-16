---
description: Governs how AI Agents use the magicuidesign-mcp server alongside shadcn-ui so the two component systems don't clash.
---
# General Rule
MagicUI is the third and final stage of this project's UI pipeline — **Mobbin** (`.claude/rules/mobbin-ui.md`, design reference) → **shadcn/ui** (`.claude/rules/shadcn-ui.md`, structure) → **MagicUI** (this file, accents) — and is a decorative/animation accent layer, not a replacement for shadcn/ui. shadcn/ui (Radix-based) remains the default and mandatory choice for structural, interactive, or data-bearing UI — forms, dialogs, tables, dropdowns, navigation, inputs — because it carries accessibility guarantees. Reach for the `magicuidesign-mcp` MCP server only for decorative/motion components layered on top of or around shadcn primitives: marquees, particles, animated-beam, bento-grid, dock, meteors, shimmer effects, and similar (not `border-beam` — removed project-wide for looping indefinitely with no pause control, WCAG 2.2.2; see `docs/decisions/magicui-conventions.md`). Never use MagicUI to reimplement something shadcn already provides for the same purpose.

# Discovery Workflow
1. Use `searchRegistryItems(query)` or `listRegistryItems(kind, query)` to find candidate MagicUI items.
2. Before using any component, call `getRegistryItem(name, { includeSource: true, includeExamples: true })` to inspect its real source, props, and structure. Never fabricate a MagicUI component's API from memory.

# Install Workflow
MagicUI is a built-in shadcn CLI registry namespace, so install components the same way shadcn components are installed — via the CLI, not by hand-copying MCP source:
```
npx shadcn@latest add @magicui/<name>
```
Installing this way writes the component through the project's existing `components.json` conventions (path aliases, `cssVariables`, `baseColor`) instead of introducing a divergent styling approach.

# Theming Discipline
If the source you inspected via `getRegistryItem` hardcodes colors instead of using the project's Tailwind CSS variables, adapt it to the existing tokens in `frontend/src/index.css` before integrating. Don't let MagicUI's raw defaults leak into the project's themed design system.

# Free-Tier Note
This MCP server is the free tier. If a search or get call comes back empty or errors for something that looks Pro-only, treat it as unavailable rather than retrying repeatedly.

# Page Cohesion (read before adding MagicUI to any page)
`docs/decisions/magicui-conventions.md` is the living registry of every MagicUI decision made in this project — which components are approved and what each is/isn't for, the exact timing/easing/duration values in use (entrance animations, stagger step, continuous-accent duration, counter spring), the "at most one continuous/looping accent per view" restraint rule, the theming rule (never ship a MagicUI component's hardcoded default colors — override with this project's CSS variable tokens), and a per-page inventory of what's already used where. Read it before adding MagicUI anywhere, match its existing values instead of inventing new ones, and update both the relevant section and the per-page inventory table when you add or change MagicUI usage on a page — otherwise the doc goes stale and the next session re-derives everything from scratch.

**Non-negotiable:** every MagicUI/Motion component must sit under the app-root `<MotionConfig reducedMotion="user">` (`frontend/src/main.tsx`) — this project's global CSS reduced-motion reset (`frontend/src/index.css`) cannot reach Motion-driven animations on its own. But the provider does **not** fully honor the OS reduced-motion setting: under `reducedMotion="user"`, Motion only skips **positional** values (transforms and `width`/`height`/`top`/`left`/`right`/`bottom`). Anything else a component animates — opacity-driven loops, gradient/offset-path travel, counting numbers, filters — keeps running for reduced-motion users. So before integrating a MagicUI component, check what it actually animates (from the source inspected via `getRegistryItem`); if it animates anything outside the positional set beyond a brief fade, gate it with the shared `frontend/src/hooks/usePrefersReducedMotion.ts` hook and render the settled end state (e.g. the final number, no looping effect) — never an ad hoc per-file media query. Libraries that animate without Motion (e.g. Embla writing inline transforms from its own rAF loop) are reached by neither the provider nor the CSS reset and always need explicit local handling. Never add a component that bypasses this provider (e.g. via a portal outside the tree) without equivalent reduced-motion handling of its own. See the reduced-motion section of `docs/decisions/magicui-conventions.md` for the per-component breakdown.

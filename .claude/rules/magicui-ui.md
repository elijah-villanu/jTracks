---
description: Governs how AI Agents use the magicuidesign-mcp server alongside shadcn-ui so the two component systems don't clash.
---
# General Rule
MagicUI is a decorative/animation accent layer, not a replacement for shadcn/ui. shadcn/ui (Radix-based) remains the default and mandatory choice for structural, interactive, or data-bearing UI — forms, dialogs, tables, dropdowns, navigation, inputs — because it carries accessibility guarantees. Reach for the `magicuidesign-mcp` MCP server only for decorative/motion components layered on top of or around shadcn primitives: marquees, particles, animated-beam, bento-grid, dock, meteors, border-beam, shimmer effects, and similar. Never use MagicUI to reimplement something shadcn already provides for the same purpose.

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

**Non-negotiable:** every MagicUI/Motion component must sit under the app-root `<MotionConfig reducedMotion="user">` (`frontend/src/main.tsx`) so it automatically honors the OS reduced-motion setting — this project's global CSS reduced-motion reset (`frontend/src/index.css`) cannot reach Motion-driven animations on its own. Never add a component that bypasses this provider (e.g. via a portal outside the tree, or a library that ignores `MotionConfig`) without an explicit, equivalent reduced-motion handling of its own.

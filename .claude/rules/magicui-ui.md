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

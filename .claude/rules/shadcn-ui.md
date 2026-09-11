---
description: Forces AI Agents to use shadcn-ui MCP server when building UI components.
---
# General Rule
When a task requires building or modifying a user interface, you must use the tools available in the `shadcn-ui` MCP server.

# Project UI Stack
When using the `shadcn-ui` MCP server, keep in mind the project uses: React.js, TailwindCSS, and Typescript.

# Design Pipeline
This project uses a 3-stage UI pipeline: **Mobbin** (`.claude/rules/mobbin-ui.md`) for real-app design references → **shadcn/ui** (this file) for accessible structural components → **MagicUI** (`.claude/rules/magicui-ui.md`) for decorative/animated accents. Consult Mobbin first when building a new page or major component, or when the user asks the UI to look like or better than something specific. Skip it for small, self-contained tweaks.

# Visual Liberty
shadcn/ui's registry items are a **structural and behavioral** starting point (Radix primitives, accessible interaction patterns) — not a mandated visual endpoint. You have latitude to adjust spacing, typography scale, layout/composition, and emphasis via Tailwind classes to match a Mobbin reference or the user's request; don't feel bound to a component's stock look. The one constraint: colors must stay within the project's existing CSS variable token system (`frontend/src/index.css`, `baseColor: "neutral"` in `components.json`) rather than arbitrary hex values or ad hoc Tailwind color utilities. If a reference genuinely calls for a token that doesn't exist yet, add it to the token system rather than hardcoding it inline, so the change stays consistent for every future page and for MagicUI (which reads the same tokens).

# Planning Rule
When planning a UI build using `shadcn`:
1. Discover Assets: First, use `get_project_registries()` to confirm which registries are configured, then `list_items_in_registries()` (optionally filtered by `types`, e.g. `["block", "component", "ui"]`) or `search_items_in_registries(query)` to find candidate assets.
2. Map Request to Assets: Analyze the user's request and map the required UI elements to the available components and blocks.
3. Prioritize Blocks: You should prioritize items of type `block` wherever possible for common, complex UI patterns (e.g., login pages, calendars, dashboards). Blocks provide more structure and accelerate development. Use individual `ui`/`component` items for smaller, more specific needs.

# Implementation Rules
When implementing the UI:
1. Get a Demo First: Before using a component, call `get_item_examples_from_registries(query)` (e.g. `"button-demo"`). This is critical for understanding how the component is used, its required props, and its structure — it also returns full embedded source for the demo file.
2. Retrieve the Code:
   - `view_items_in_registries(items)` returns item metadata (type, file count, dependencies) but may not reliably embed full source for `registry:ui` items depending on the installed shadcn MCP server version — do not depend on it as the sole source of truth for source code.
   - Prefer `get_add_command_for_items(items)` to get the exact `npx shadcn@latest add ...` CLI command, and have the user (or a shell tool) run it to write the real files into the project.
   - `get_item_examples_from_registries` is the most reliable way to see actual working source inline when you cannot run the CLI.
3. Implement Correctly: Integrate the retrieved code into the application, customizing it with the necessary props and logic to fulfill the user's request.
4. Audit: Before finishing UI work, call `get_audit_checklist()` and verify the implementation against it.

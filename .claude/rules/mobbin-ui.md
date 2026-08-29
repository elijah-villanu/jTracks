---
description: Governs when/how AI Agents use the Mobbin MCP server as the design-reference stage of this project's UI pipeline (Mobbin -> shadcn -> MagicUI).
---
# General Rule
Mobbin is a design-reference tool, not a component source — it returns real-app screenshots and metadata for inspiration, never installable code. It's the **reference stage** of this project's 3-stage UI pipeline:
1. **Mobbin** (this file) — find real reference examples to ground layout and visual direction.
2. **shadcn/ui** (`.claude/rules/shadcn-ui.md`) — build the actual structure using accessible, Radix-based primitives. See that file's "Visual Liberty" section for how far you can diverge from a component's stock look to match a reference.
3. **MagicUI** (`.claude/rules/magicui-ui.md`) — layer in decorative/animated accents.

Mobbin never substitutes for either of the other two stages — it only informs the visual/layout decisions made while using them.

# When to Reach for Mobbin
Use it before building or restyling any **new page, new major component, or an explicit "make this look like / better than X" request**. Skip it for small, self-contained tweaks — adding a field, fixing a bug, or extending a pattern the page already establishes — where a reference lookup wouldn't change anything you'd actually build.

# Discovery Workflow
1. Pick the tool matching the shape of the reference you need:
   - `search_screens(query, platform)` — a single screen or UI pattern.
   - `search_flows(query, platform)` — a multi-step journey (onboarding, checkout).
   - `search_sections(query)` — a page section on the web (hero, pricing, footer).
2. Pass one specific, single-intent `query` per call (don't combine multiple screens/flows or use vague style words like "modern"/"clean") and keep `task_intent` identical across every call in the same task.
3. Keep `limit` low (3–5) to control context/image cost unless the user explicitly wants a broader survey.
4. **Actually examine the returned images** — never infer a screen's content from `app_name` or other metadata alone.
5. When presenting results to the user, always cite each screen/flow/section as a markdown link to its `mobbin_url`.

# Handoff to shadcn + MagicUI
Treat Mobbin references as inspiration to extract, not markup to copy verbatim: pull out the layout pattern, spacing rhythm, information hierarchy, and visual treatment, then build it with shadcn primitives and layer MagicUI accents only where the reference (or the request) calls for real motion. Never install, embed, or hand-copy anything from a Mobbin result as if it were shadcn/MagicUI source — it's a picture of someone else's UI, not a registry item.

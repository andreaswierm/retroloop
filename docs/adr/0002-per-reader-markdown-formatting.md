# ADR 0002 — Per-reader Markdown formatting over a shared structured formatter

**Status:** Accepted

## Context

retroloop needs to convert a provider's raw session transcript into a
Markdown body that the Runner can understand. Two design options were
considered:

**Option A — Shared structured formatter:**
Each Session Reader produces a provider-agnostic, structured intermediate
representation (e.g. a typed `TurnList`). A single shared formatter then
renders that structure to Markdown.

**Option B — Per-reader Markdown formatting:**
Each Session Reader owns its own Markdown formatting logic end-to-end. The
reader takes raw transcript data in, and emits a Markdown body out. There
is no shared structured intermediate.

The core tension: shared structure promotes consistency and reuse but
requires every provider's transcript to be expressible in the same shape —
which may not hold as new providers are added. Per-reader formatting
isolates provider-specific quirks but risks duplicating formatting logic
across readers.

## Decision

Each Session Reader owns its own Markdown formatting, including
provider-specific subagent embedding (Option B). There is no shared
structured intermediate representation.

Shared *filtering* helpers (e.g. the 500-char truncation logic for tool
outputs) may be extracted as pure utility functions and reused across
readers, because they operate on generic strings rather than
provider-specific data shapes.

## Consequences

- Provider-specific quirks (e.g. Claude Code's subagent file layout,
  control lines in the JSONL, `thinking` blocks) stay entirely within the
  Claude reader. Adding a new provider means a new folder with its own
  parser and formatter — no changes to shared code.
- The pipeline (Summarizer, Runner, Output Targets) receives a plain
  Markdown string regardless of provider, keeping those layers
  provider-agnostic.
- If two readers end up with near-identical formatting logic, that is
  acceptable duplication. Premature abstraction across providers is the
  larger risk given that only one provider exists in v1 and the second
  provider's transcript shape is unknown.
- The trade-off is explicit: consistency of the rendered Markdown is the
  reader's responsibility, not enforced by a shared formatter contract.

# Issue tracker: Local Markdown

Issues and specs for this repo live as markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<slug>/`
- The spec is `.scratch/<slug>/SPEC.md`
- Implementation issues are one file per ticket at `.scratch/<slug>/issues/<NN>-<slug>.md`, numbered from `01`, blockers first — never a single combined tickets file
- Each ticket carries a `Blocked by:` line near the top (see `to-tickets` local-ticket-template)
- Iteration complete: spec → `.agents/specs/<slug>/SPEC.md`, tickets → `.agents/tickets/<slug>/`, delete `.scratch/<slug>/`

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<slug>/` (creating the directory if needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `.scratch/<effort>/map.md` — the Notes / Decisions-so-far / Fog body.
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `claimed`/`resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `.scratch/<effort>/issues/` for files that are open, unblocked, and unclaimed; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far in `map.md`.

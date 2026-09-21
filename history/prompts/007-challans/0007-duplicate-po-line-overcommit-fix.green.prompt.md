---
id: 0007
title: Duplicate PO line overcommit fix
stage: green
date: 2026-09-21
surface: agent
model: claude-sonnet-5
feature: 007-challans
branch: 007-challans
user: imtiazkind143@gmail.com
command: /sp.implement
labels: ["green", "challans", "correctness-review", "business-sensitive"]
links:
  spec: specs/007-challans/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - supabase/migrations/0007_challans.sql
 - lib/challans/service.ts
 - lib/challans/schema.ts
 - specs/007-challans/tasks.md
 - history/prompts/007-challans/0007-duplicate-po-line-overcommit-fix.green.prompt.md
tests:
 - npx tsc --noEmit (clean, full repo)
 - npm run lint (clean, full repo)
 - npm run build (clean, full repo)
---

## Prompt

Quick question before I apply this: does the UI (the Challan create/edit form) prevent
selecting the same PO line twice within one Challan's line list? If not, create_challan/
update_challan's remaining-quantity check validates each submitted line independently
against the PO line's stored delivered_quantity, so two lines both pointing at the same
po_line_id in one call could each individually pass the remaining check while together
exceeding it. Is this already prevented client-side, or should the RPC also check for
duplicate po_line_id within its own p_lines array?

## Response snapshot

Verified both halves precisely before responding. Client-side: read `challan-form.tsx`'s
`candidateToLineState` — confirmed the `lines` state is a fixed 1:1 mapping from
`getOpenPOLinesForChallan`'s candidates (one row per distinct PO line, checkbox-toggled), so
today's UI structurally cannot submit two entries with the same `poLineId`. Server-side: traced
`create_challan`'s loop precisely — each iteration does a fresh `SELECT ... FROM
customer_po_lines WHERE id = poLineId`, and neither `create_challan` nor `update_challan` ever
writes to `customer_po_lines` (only `accept_challan` does, at acceptance) — so two identical
`poLineId` entries would each read the *same* stale `delivered_quantity`, each independently pass
the remaining-quantity check, and together overcommit the PO line. Confirmed this is real, not
hypothetical: reachable today via a direct Server Action call (bypassing the UI entirely), and
would become reachable through the UI itself if `ChallanForm`'s 1:1 structure ever changed.

Fixed at all three layers, migration not yet applied so edited it in place rather than writing a
follow-up: (1) an explicit `DUPLICATE_PO_LINE` guard added to both `create_challan` and
`update_challan` in `0007_challans.sql`, grouping `p_lines` by `poLineId` and rejecting any
count > 1, on the grounds that no legitimate case exists for one Challan to reference a PO line
twice — a second partial delivery belongs on a separate Challan; (2) a friendly-error translation
in `lib/challans/service.ts`'s `toFriendlyChallanError`; (3) an earlier, client-side
`superRefine`-based `noDuplicatePoLines` helper applied to both line-array schemas in
`lib/challans/schema.ts`, framed explicitly as a friendlier-message layer, not the authoritative
fix (the DB guard is). Hit and fixed a generic-type inference bug while writing the Zod helper —
constraining the parameter as `z.ZodType<{poLineId: string}[]>` collapsed the inferred element
type to exactly that shape, breaking every other field's type elsewhere in `service.ts`; changed
to `<L extends {poLineId: string}>(schema: z.ZodType<L[]>)` so the specific line type flows
through instead of being erased. Re-ran `tsc`/`lint`/`build` clean after both fixes.

## Outcome

- ✅ Impact: A real, exploitable overcommit path in `create_challan`/`update_challan` is closed
  before the migration was ever applied — no follow-up migration needed since this was caught
  pre-apply. `supabase/migrations/0007_challans.sql` is updated in place.
- 🧪 Tests: `tsc --noEmit`, `lint`, `build` — all clean after the fix (re-verified after an
  intermediate type error from the first version of the Zod helper).
- 📁 Files: `supabase/migrations/0007_challans.sql` (two new guards), `lib/challans/service.ts`
  (error translation), `lib/challans/schema.ts` (client-side guard), `specs/007-challans/tasks.md`
  (Implementation Notes updated); this PHR.
- 🔁 Next prompts: user reviews the updated migration (unchanged elsewhere — only the two new
  `DUPLICATE_PO_LINE` blocks were inserted) and applies it in the Supabase SQL editor.
- 🧠 Reflection: this is the second time in this feature that "the UI can't produce X" was true
  but insufficient — the `challan_lines` snapshot-columns catch during planning had the same
  shape (an earlier feature's lock not engaging until a later step). The generalizable check —
  "does this RPC's own correctness depend on the caller's shape, or does it hold regardless of
  what's actually submitted" — is worth applying explicitly to every multi-line RPC in this
  project, not just Challans; 006's `create_customer_po`/`update_customer_po` accept an
  analogous `p_lines` array and were not re-audited for this exact class of issue (duplicate
  `productId` referencing the same underlying resource) in this session.

## Evaluation notes (flywheel)

- Failure modes observed: none this round — the user's question was the catch, not a correction
  of something delivered as finished; the fix itself was correct on the second attempt after the
  Zod generic type error, self-caught by `tsc`.
- Graders run and results (PASS/FAIL): static verification — PASS after fix.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): when a Postgres function loops over a client-supplied
  array validating each element against a live table it does not itself mutate, explicitly check
  for and reject duplicate references to the same underlying row before the loop — this class of
  bug (independent-looking checks that jointly overcommit a shared resource) is a standing pattern
  worth a deliberate pass on any *other* multi-line RPC in this codebase, not just future ones.

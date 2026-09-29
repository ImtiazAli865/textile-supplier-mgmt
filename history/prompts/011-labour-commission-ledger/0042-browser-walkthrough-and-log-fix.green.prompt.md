---
id: 0042
title: Browser walkthrough and dev log fix
stage: green
date: 2026-09-29
surface: agent
model: claude-opus-5-5
feature: 011-labour-commission-ledger
branch: 011-labour-commission-ledger
user: ImtiazAli865
command: none
labels: ["qa","browser","quickstart","security","dev-logging","hydration"]
links:
  spec: specs/011-labour-commission-ledger/spec.md
  ticket: null
  adr: history/adr/0010-contractor-payment-allocation-and-settlement-lock.md
  pr: null
files:
 - next.config.ts
 - specs/PRODUCT-OVERVIEW.md
 - specs/011-labour-commission-ledger/tasks.md
 - history/prompts/011-labour-commission-ledger/0042-browser-walkthrough-and-log-fix.green.prompt.md
tests:
 - quickstart §1-§6 in a signed-in browser on live Supabase: all items pass (QA-011 names only)
 - §8 reconciliation on live: 25 batches, 24 completed with exactly one matching earning, 1 voided with none, 0 orphans
 - untagged-row check: 0 untagged contractors/suppliers/products, 0 lots outside the QA supplier
 - hidden vs visible tab click test: 0 events delivered while hidden; click delivered and "Name is required" shown while visible
 - dev log after config change: 0 server-function argument lines
---

## Prompt

Series of turns (verbatim essentials):
- "how can in signed it you run it on browser then i will"
- "Now that I'm signed back in — before continuing the walkthrough, please tell me: were the repeated click failures ... caused by the browser-automation tool's own targeting issue, or is there a genuine UI bug ...? Please investigate this specifically before we continue"
- "Confirmed — ... No real UI bug ... log it as a known, low-priority improvement for a future polish pass ... resume the quickstart walkthrough ... continue with PB-D."
- "done, the tab is in front now"
- "I've changed my password and signed back in with the new one. Before continuing the walkthrough: 1. Please investigate whether Next.js 16's dev-server Server Action argument logging can be disabled (or at least redacted for password fields) ... Propose the change; I'll review before you apply it. 2. Please stop the current dev server and delete the temp log file that contained the old password, then restart with a fresh session. Once both are done, let's resume the walkthrough with PB-D."
- "apply the config change, delete the old dev.log, tab is in front"

## Response snapshot

Click failures traced to the automation tab being hidden (visibilityState "hidden": no input
delivered, painting stopped, timers throttled); no overlay; visible-tab click worked. Hydration
gap logged in PRODUCT-OVERVIEW "Polish Backlog". Found the user's password in the dev-server log
(Next 16 logs Server Action args); user changed it; dev server stopped, both logs deleted unread,
`logging.serverFunctions: false` added to next.config.ts (no redaction option exists) and
verified. Accidentally submitted the nav Sign out form once (user re-signed in); lesson saved to
memory. Completed quickstart §1-§6 via form_input + `main form`.requestSubmit(): all pass. §8 and
untagged checks clean. Design observation: a settled period's statement can show a payment that
was already reversed (reversal dated today lands in the next period). Wording nits: zero balance
labelled "settled up"; negative paid shown as "Rs -15,000.00".

## Outcome

- Impact: 011 verified end to end on live; dev-log password exposure closed for future sessions
- Tests: see tests list
- Files: next.config.ts, PRODUCT-OVERVIEW.md (backlog), tasks.md (T042)
- Next prompts: T043 cleanup (dry run then commit), reset batch sequence, T044, commit
- Reflection: check tab visibility before driving a browser; never submit the first form on a page

## Evaluation notes (flywheel)

- Failure modes observed: submitted the nav Sign out form via document.querySelector('form'); slow to notice the hidden-tab cause
- Graders run and results (PASS/FAIL): quickstart §1-§6 PASS; §8 PASS
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a

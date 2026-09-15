# SkillBridge capture contract

## Currently implemented

`npm run capture:store -- --json` builds the current bundle and runs
`take-a-repo.config.js`. Each candidate has isolated raw media, channel MP4s,
observations, checks and an HTML proof report. Capture inputs include product
source, manifests, package/lockfile, scenario code, helpers, fixtures and the
installed engine. Source/build changes invalidate current review, even when the
version number stays the same. Failure never returns an older candidate.

All current captures are **neutral Skilljar-shaped fixtures**, with frozen Korean
and Japanese translation responses and a streaming **Tutor stub**. They are not
live Academy sessions or evidence of real model quality, sign-in or network
availability. Every image/video displays the fixture label. The real bundle is
copied with localhost permissions, an E2E preload, scripting permission for read
checks, and the Puter stub. Both production and patched build hashes, runtime
extension version/ID, source commit and action/check observations are retained.

## Scenario contract

Each scene opens a fresh page. Videos use a fresh browser profile. Static scenes
share one isolated profile; each explicitly chooses its initial language.

| Scenario | Start | Visible user actions | Expected result / failure | Capture point |
|---|---|---|---|---|
| Translate | English lesson | Language menu → Korean → English → Korean | Body translates; Claude retained; exact original paragraph restores. Missing/wrong text fails. | Translated lesson and restore clip |
| Multilingual | Same lesson in Korean | Select Japanese; open Tutor | Japanese body and send button. Wrong language fails. | Japanese lesson/UI |
| Tutor | Korean lesson | Triple-click paragraph → Ask Tutor → type question → Send | Selected quote and complete fixed reply visible. Missing quote/reply or timeout fails. | Quote, question and stub reply |
| Records | Korean lesson | Bookmark → add; Notes → type → save; leave and reopen lesson | Bookmark and exact note survive re-entry. Missing records fail. | Restored notes and bookmark |
| Review | Korean lesson, course deck | Open flashcards → flip → ✓ | Answer face opens and learning counters change. Empty deck/unchanged state fails. | Card and updated counters |
| Quiz protection | Supported `/quiz` fixture | Read original answers; choose Korean | Heading translates, all four answer labels are byte-identical. Never choose or submit an answer. | Untranslated choices |
| Proctored protection | Recognized `/certification-exam` fixture | Navigate only | Init sentinel set, product instance absent (early kill switch), no language control/FAB. Any active surface fails. | Disabled extension |
| Hero | English lesson | Korean → select paragraph → ask → bookmark/note save | All translation/Tutor/save assertions pass. | Separate 20–40 second main story |

Preparation calls are limited to staging the test bundle, registering frozen
network routes and setting `welcomeShown` in fresh storage. Product actions use
Playwright mouse, keyboard and select controls; the engine mirrors native select
options into the recording. Read-only internal inspection is used for the early
certification kill switch. The event log identifies preparation, interaction and
verification separately; it does not claim all assertions are independent of the
producer code.

## Review and asset handoff

1. `npm run capture:status` rehashes files, source and build.
2. `npm run capture:review` opens the candidate. Review framing, readability and
   message suitability, including fixture disclosures. Only the user approves.
3. After approval, `npm run capture:apply` copies those exact bytes to the existing
   landing image path and store asset paths. It writes a digest receipt last.
4. `npm run capture:verify-assets` validates that receipt. Landing build/verify
   run it before assembling the site. No image restyling or brand change occurs.

Approval does not publish anything or authorize a new destination. No candidate
from this migration is deployed automatically. Existing landing assets remain
historical until the approved handoff runs. Old `run-shotkit.js`, `store.config.js`
and `build-promo-media.js` are explicit deprecated forwarders; they cannot relabel
an old `demo.webm`. CI uploads the complete isolated candidate plus diagnostics.

## Planned

Live Academy and real Tutor capture need a separate authenticated execution mode
without network stubs or the Puter replacement. They are **not executed** by this
config. Do not claim service availability, 32-language coverage, login success or
model response quality based on the two-language fixture run.

## Design intent

Product assertions and fixtures stay in SkillBridge. Browser recording, video
encoding/channel sizes, freshness/file QA and exact-file approval/export stay in
take-a-repo. Until npm publication is separately approved, the dependency is pinned
to a reviewed Git commit of the existing repository.

## Non-goals

Landing redesign, rebranding, answering/submitting exams, npm publication,
repository renaming, and public media deployment.

## Redacted

Real accounts, credentials, private lessons and user learning records are never
part of these fixture assets.

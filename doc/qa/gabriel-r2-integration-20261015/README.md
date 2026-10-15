# Gabriel R2 local game candidate · 2026-10-15

Base: `4451b92cf901fe877988e4a37363dfd3266cb942`. User authorization relayed by game main `01a13c07-36d0-7171-bf8d-e1d6761df03f`: Sentinel_59138676839c8191ac23a25927c646ae at 2026-10-15 07:32 UTC, “神父的新版接入你继续推进。” This is an isolated local candidate. Main arranges independent QA and any later publication.

Four existing Gabriel consumer PNGs now use the already admitted private-library R2 bytes. `CONSUMER-LOCK.json` pins identity, revision, record, file hashes and atlas layout. The People avatar consumes the complete 256-square nearest-neighbor copy with crop `[0,0,256,256]`. The dialogue portrait has an explicit 52×65 card and `contain`; enlarged portrait retains the complete 256×320 source.

Only Gabriel's display reservation was remeasured from the twelve atlas cells (alpha > 200), using the existing root/scale. The previous reservation incorrectly referenced Arthur's PNG. Dog/crab and all other display geometry remain byte-equivalent as parsed data. Ground collision, NPC animation registration/patrol code, roster, identity, schedule, authority and save schema are unchanged.

The prior R2 packaging retained six R1 file SHA values in `nativeKit.mirrors`. This candidate records the actual R2 hashes and valid complete-cell mirror evidence in the consumer lock; it does not rewrite the immutable canonical library record. The asset owner must handle that metadata correction separately. Four consumer PNGs are exact admitted bytes, with no drawing, recoloring or new generation.

Validation completed in this worktree:

- 28 targeted tests PASS: Gabriel files/rows/schedule, SQLite legacy reads/replay/CAS/owner isolation and story choices, dog/mint/crab admission and combined display reservation.
- `npm run build -- --config ../vite.local.config.ts --configLoader runner` PASS under the existing Node 22.22.2 toolchain. Existing storage-script and chunk-size warnings remain.
- Strict `ui-foundation` audit PASS; no functional glyph or broken restart SVG findings.
- Actual built Main/RPGJS/Pixi, temporary in-memory authority, own random loopback port and own headless browser: 8/8 cases PASS. Chapel: 320×568, 390×844, 1280×800 × Chinese/English. Hill: 320×568 and 390×844 English. Normal DOM introduction/choices, avatar/portrait, no horizontal overflow and reload-memory checks passed, with zero page errors and zero model calls.
- 64 controlled renderer frame selections PASS across four mobile scene/viewport cases: down/up/left/right × A/stand/B/stand. This fixture temporarily controls browser signal setters; it is not evidence of natural four-direction patrol. The production patrol code remains unchanged. Natural near-player observations are saved separately.

Evidence is outside the product repository in `../evidence/`: `unit-tests.tap`, `build-final.log`, `ui-audit.txt`, and `gabriel-r2-ui/REPORT.json`, screenshots and selected-frame JSON. The harness is `_qa/gabriel-r2-browser.mts`; it uses the built `dist`, existing installed Playwright and an independent temporary browser. Before the final successful run, three harness issues were corrected (portrait selector on the wrong panel, server-only sync method, and tsx function-name helper); those were fixture failures, not hidden product failures.

Reproduce targeted tests with Node 22 and existing dependencies:

```sh
node --import tsx --test --test-concurrency=1 _qa/gabriel-art-integration.test.ts _qa/gabriel-r2-envelope.test.ts _qa/gabriel-crab-combination.test.ts _qa/chapel-priest.test.ts _qa/native-dog-hotspot.test.ts _qa/native-dog-mint-admission.test.ts _qa/native-crab-admission.test.ts
node --import tsx _qa/gabriel-r2-browser.mts
```

The browser command requires an allowed local loopback listener and the installed headless shell path declared in the harness. No tools were installed. This worktree temporarily reuses `/Users/yin/code/games/a-summer-in-harbor/node_modules` by symlink; the symlink is not part of the commit.

Not verified here: real Telegram, physical phones, production identity/save actions, target-cloud renderer, new-player comprehension or independent QA. No formal deployment, push, library write, production save mutation or generation request occurred in this R2 integration task. The separately running coast production and workflow migration tasks have independent ledgers and are not counted as R2 work.

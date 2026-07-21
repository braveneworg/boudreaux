# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.257.0] - 2026-07-21

### Changed

- docs: 📝 restructure agent guidance into layered files (#644)

## [4.256.0] - 2026-07-21

### Fixed

- fix: 🐛 patch brace-expansion, js-yaml, body-parser (#643)

## [4.255.0] - 2026-07-21

### Changed

- chore: 🔧 update pnpm to 11.15.1 and drop engines.pnpm (#642)

## [4.254.0] - 2026-07-21

### Changed

- refactor: ♻️ move multipart upload fake below its seam (#641)

## [4.253.0] - 2026-07-21

### Changed

- refactor: ♻️ name the eager-validation switch (#640)

## [4.252.0] - 2026-07-21

### Changed

- refactor: ♻️ save featured artists via an action (#639)

## [4.251.0] - 2026-07-21

### Changed

- refactor: ♻️ map fetch statuses to fallbacks (#638)

## [4.250.0] - 2026-07-21

### Changed

- refactor: ♻️ one plan owns post-save video work (#637)

## [4.249.0] - 2026-07-21

### Changed

- refactor: ♻️ share one entity mutation lifecycle (#636)

## [4.248.0] - 2026-07-20

### Changed

- test: ✅ enforce two prose-only invariants (#635)

## [4.247.0] - 2026-07-20

### Changed

- refactor: ♻️ move the ffprobe fake below its seam (#634)

## [4.246.0] - 2026-07-20

### Fixed

- fix: 🐛 fail bad bio job input in seconds (#633)

## [4.245.0] - 2026-07-20

### Fixed

- fix: 🐛 dispose audio players, share one session (#632)

## [4.244.0] - 2026-07-20

### Changed

- docs: 📝 scope the form submit protocol (#631)

## [4.243.0] - 2026-07-20

### Changed

- refactor: ♻️ move the bio fake below the seam (#630)

## [4.242.0] - 2026-07-20

### Changed

- refactor: ♻️ share one form submit protocol (#629)

## [4.241.0] - 2026-07-20

### Changed

- docs: 📝 record that logic stays in services (#628)

## [4.240.0] - 2026-07-20

### Added

- feat: ✨ catch route errors in the auth decorators (#627)

## [4.239.0] - 2026-07-20

### Changed

- refactor: ♻️ type action form-field allowlists (#626)

## [4.238.0] - 2026-07-20

### Changed

- refactor: ♻️ carry error code on ServiceResponse (#624)

### Fixed

- fix: 🐛 three defects found while verifying the review (#625)

## [4.237.0] - 2026-07-20

### Fixed

- fix: 🐛 gate web enrichment on artist (#623)

## [4.236.0] - 2026-07-20

### Changed

- chore: 🔧 gate lambda typecheck and tests in CI (#622)

## [4.235.0] - 2026-07-19

### Changed

- chore: 🔧 align node and pnpm runtimes (#620)

### Fixed

- fix: 🐛 mark draft enrichment pending pre-response (#621)

## [4.234.0] - 2026-07-19

### Fixed

- fix: 🐛 keep playlist panel inside its popover (#619)

## [4.233.0] - 2026-07-19

### Fixed

- fix: remove black border from combobox search inputs (#618)

## [4.232.0] - 2026-07-19

### Changed

- refactor: ♻️ split hooks into global + _hooks (#617)

## [4.231.0] - 2026-07-19

### Changed

- refactor: ♻️ move playlist mutations to mutations/ (#616)

## [4.230.0] - 2026-07-18

### Fixed

- fix: 🐛 zustand follow-ups from #613 and #614 (#615)

## [4.229.0] - 2026-07-18

### Added

- feat: Zustand player state (PR 2: volume prefs + featured player) (#614)

## [4.228.0] - 2026-07-18

### Added

- feat: Zustand for pure client state (PR 1: chat + admin filters) (#613)

## [4.227.0] - 2026-07-18

### Added

- feat(videos): poster frame picker strip (#612)

## [4.226.0] - 2026-07-18

### Fixed

- fix: save captured poster frame on Save (#611)

## [4.225.0] - 2026-07-17

### Added

- feat: video enrich-on-upload + extraction quality (#608)

### Changed

- test: artist-review spec restores seeded state (#610)

## [4.224.0] - 2026-07-17

### Fixed

- fix: auth rate limiter 429s CI E2E sessions (#609)

## [4.223.0] - 2026-07-17

### Fixed

- fix(chat): re-pin message tail through viewport resizes (E2E flake) (#607)

## [4.222.0] - 2026-07-17

### Changed

- docs: E2E lessons — combobox swaps + worker-cascade failures (#604)

## [4.221.0] - 2026-07-16

### Added

- feat(playlists): add-to-playlist menu on media players (#605)

## [4.220.0] - 2026-07-15

### Changed

- test: ✅ fix pre-existing test order-dependencies (#603)

## [4.219.0] - 2026-07-15

### Added

- feat(videos): uploader v2 — combobox credits, date lookup, scheduled publish (#602)

## [4.218.0] - 2026-07-15

### Added

- feat(playlists): playlist player, downloads, share (#601)

## [4.217.0] - 2026-07-15

### Changed

- perf(tests): ⚡ 5x faster unit suite (66s → ~13s) (#600)

## [4.216.0] - 2026-07-15

### Changed

- style(playlists): 🎨 image heading + borderless inputs (#599)

## [4.215.0] - 2026-07-15

### Added

- feat(videos): server probe prefill + reviewed artist creation (#598)

## [4.214.0] - 2026-07-15

### Added

- feat(playlists): ✨ My Playlists page + creator (#597)

## [4.213.0] - 2026-07-15

### Changed

- perf(db): ⚡ slow-query hardening — 4 verified gap-closing indexes (#596)

## [4.212.0] - 2026-07-13

### Changed

- test(collection): ✅ richer 360px overflow probe (#595)

## [4.211.0] - 2026-07-12

### Fixed

- fix(videos): de-flake admin enrichment E2E (shard 2/3) (#594)

## [4.210.0] - 2026-07-12

### Fixed

- fix(collection): 🐛 contain cards on mobile (#593)

## [4.209.0] - 2026-07-12

### Added

- feat: ✨ persist bio reference links + design tweaks (#591)

### Changed

- refactor(videos): share admin detail stripper (#592)

## [4.208.0] - 2026-07-12

### Added

- feat(videos): video metadata probe + web enrichment (#590)

## [4.207.0] - 2026-07-12

### Added

- feat(auth): mint Apple client secret at boot (#589)

## [4.206.0] - 2026-07-12

### Fixed

- fix(auth): pass social OAuth env to prod deploy (#588)

## [4.205.0] - 2026-07-11

### Changed

- chore: refresh coverage baseline (#587)

## [4.204.0] - 2026-07-11

### Added

- feat(bio): floated figures + dead-link validation (#586)

## [4.203.0] - 2026-07-11

### Added

- feat(bio): rekognition face signal (#585)
- feat(nav): mobile nav categories accordion (#583)

## [4.202.0] - 2026-07-11

### Fixed

- fix(ci): release push race + changelog generation (#584)

## [4.201.0] - 2026-07-11

### Added

- feat(bio): serper images + license-aware ranking (#577)

## [4.200.0] - 2026-07-11

### Added

- feat(videos): ✨ best-quality auto poster capture (#576)

### Fixed

- fix: 🐛 gate chat scroll pin on real user input (iOS) (#582)

## [4.199.0] - 2026-07-11

### Fixed

- fix(ui): 🐛 restore datepicker calendar popover (#575)

## [4.198.0] - 2026-07-11

### Fixed

- fix: 🐛 chat drawer reopen scroll pinned to latest message (#581)

## [4.197.0] - 2026-07-11

### Fixed

- fix: 🐛 chat emoji picker focus loss and stale reopen history (#580)

## [4.196.0] - 2026-07-11

### Added

- feat(bio): ✨ live bio generation progress (#574)

## [4.195.0] - 2026-07-11

### Added

- feat: ✨ update zine heading designs (#578)

## [4.194.0] - 2026-07-10

### Added

- feat: ✨ add admin announcements sms blast (#571)

## [4.193.0] - 2026-07-08

### Added

- feat(videos): ✨ admin uploads + videos page (#573)

## [4.192.0] - 2026-07-08

### Added

- feat(bio): ✨ regen-proof custom bio media (#570)

## [4.191.0] - 2026-07-08

### Added

- feat(bio): ✨ gemini tier-1 capacity + pro synth (#572)

## [4.190.0] - 2026-07-07

### Changed

- docs: 📝 add self-correcting LESSONS section to CLAUDE.md (#569)
- perf: ⚡ desktop Lighthouse ≥95 — SSR the home player (#568)

## [4.189.0] - 2026-07-06

### Fixed

- fix: 🔨make claude.md reference global agents.md (#567)

## [4.188.0] - 2026-07-06

### Fixed

- fix(home): align loading state with the zine UI (#566)

## [4.187.0] - 2026-07-06

### Added

- feat(bio): ✨ link OG-unfurl preview in bio editor (#565)

## [4.186.0] - 2026-07-06

### Fixed

- fix(bio-gen): 🐛 default vision cap back to 60 (#564)

## [4.185.0] - 2026-07-06

### Added

- feat(bio): ✨ more vision-verified photos (phase 1) (#563)

## [4.184.0] - 2026-07-06

### Fixed

- fix(bio): 🐛 restore generation + resolve hung UI (#562)

## [4.183.0] - 2026-07-05

### Added

- feat: ✨ async bio generation + bounded discovery (#561)

## [4.182.0] - 2026-07-05

### Added

- feat: ✨ discovery image quality gate (2a) (#560)

## [4.181.0] - 2026-07-05

### Added

- feat: 🎨 various design tweaks (#559)

## [4.180.0] - 2026-07-05

### Added

- feat: ✨ bio-image upload dialog + attribution editing + cutover (1b) (#558)

## [4.179.0] - 2026-07-05

### Added

- feat: ✨ persistent bio palette + bio-image write backend (1a) (#557)

## [4.178.0] - 2026-07-05

### Added

- feat: ✨ releases cover modal + release notes section (#555)

## [4.177.0] - 2026-07-05

### Added

- feat: ✨ zine live-chat drawer heading (#556)

## [4.176.0] - 2026-07-04

### Added

- feat: ✨ desktop punk-zine site chrome (#554)

## [4.175.0] - 2026-07-04

### Added

- feat: ✨ bio editor image resize/border + click-to-edit links (#553)

## [4.174.0] - 2026-07-04

### Added

- feat: ✨ bio media discovery v2 — verified palettes, atom links, wrap (#552)

## [4.173.0] - 2026-07-04

### Fixed

- fix: 🐛 scope home banner fallback to home route (#551)

## [4.172.0] - 2026-07-03

### Added

- feat: punk-zine site-wide redesign (#550)

## [4.171.0] - 2026-07-03

### Added

- feat: admin bio palettes, editor DnD figures, save-time re-host (#549)

## [4.170.0] - 2026-07-02

### Fixed

- fix(bio): image quality, thumbs 403, name search (#548)

## [4.169.0] - 2026-07-02

### Added

- feat(bio-generator): quality passes, streaming links, volume caps (#547)

## [4.168.0] - 2026-07-02

### Added

- feat(bio-generator): scraped-image fallback + prompt fixes (#546)

## [4.167.0] - 2026-07-02

### Added

- feat: bio links over bold, tasteful images, editor preview (#545)

## [4.166.0] - 2026-07-02

### Fixed

- fix(bio-generator): gemini-2.5-flash + draft-and-synthesize ensemble (#544)

## [4.165.0] - 2026-07-02

### Fixed

- fix: 🐛 retry Gemini 429s with a 30–60s backoff (#543)

## [4.164.0] - 2026-07-02

### Fixed

- fix: 🐛 pin Gemini model id in code so deploys actually apply it (#542)

## [4.163.0] - 2026-07-01

### Changed

- docs: 📝 make AGENTS.md the source of truth; CLAUDE.md imports it (#540)

## [4.162.0] - 2026-07-01

### Fixed

- fix: 🐛 use a valid Gemini model id (fixes 404 in bio generation) (#539)

## [4.161.0] - 2026-06-30

### Added

- feat: ✨ fix missing bio images/links + richer bios with alt bio (#538)

## [4.160.0] - 2026-06-30

### Added

- feat(profile): ✨ email opt-in + punk-zine restyle (#537)

## [4.159.0] - 2026-06-30

### Added

- feat(auth): ✨ migrate to better-auth with signups pause + redesign (#536)

## [4.158.0] - 2026-06-25

### Changed

- refactor: ♻️ enforce function-length & complexity limits (#535)

## [4.157.0] - 2026-06-23

### Changed

- chore: 🔧 ESLint 10 upgrade, Tailwind cleanup, e2e coverage (#534)

## [4.156.0] - 2026-06-23

### Changed

- refactor: ♻️ confine Prisma to the repository layer (#533)

## [4.155.0] - 2026-06-23

### Changed

- refactor: ♻️ decompose DataView into subcomponents (#532)

## [4.154.0] - 2026-06-22

### Changed

- refactor: ♻️ route server-only logging through the logger (#531)

## [4.153.0] - 2026-06-22

### Changed

- docs: 📝 add data-mutation-stack architecture diagrams (#530)

## [4.152.0] - 2026-06-22

### Changed

- refactor: ♻️ unify admin action results as AdminActionResult (#529)

## [4.151.0] - 2026-06-21

### Fixed

- fix: 🐛 restore artists index image heading (#528)

## [4.150.0] - 2026-06-21

### Added

- feat: ✨ admin entity delete/publish/restore flows (#527)

## [4.149.0] - 2026-06-21

### Changed

- refactor: ♻️ idiomatic typed + destructured mutation hooks (#526)

## [4.148.0] - 2026-06-21

### Added

- feat(contact): ✨ accessible email links (#524)

### Changed

- style(auth): align mobile nav account links beside avatar (#525)

## [4.147.0] - 2026-06-21

### Changed

- refactor: ♻️ destructure mutation hooks, add query hooks for form reads (#522)

## [4.146.0] - 2026-06-21

### Changed

- chore: 🔧 patch Dependabot security advisories (#523)

## [4.145.0] - 2026-06-20

### Added

- feat: ✨ richer artist bios via Gemini + Jina (#521)

## [4.144.0] - 2026-06-20

### Fixed

- fix: 🐛 cap Groq bio prompt to TPM ceiling (#520)

## [4.143.0] - 2026-06-20

### Added

- feat: ✨ async (non-blocking) artist bio generation (#519)

## [4.142.0] - 2026-06-20

### Added

- feat: ✨ image-rich bios, inline links, editor lists (#518)

## [4.141.0] - 2026-06-20

### Changed

- docs: 📝 document deploy-role SNS/CloudWatch perms (#510)

## [4.140.0] - 2026-06-20

### Added

- feat: ✨ Tavily web-search fallback for bio grounding (#517)

## [4.139.0] - 2026-06-20

### Added

- feat: ✨ richer grounded artist bios with section headings (#516)

## [4.138.0] - 2026-06-20

### Fixed

- fix: 🐛 pass bio lambda name to prod container env (#515)

## [4.137.0] - 2026-06-20

### Fixed

- fix: 🐛 install musl sharp via isolated temp dir (#514)
- fix: 🐛 install musl sharp in Alpine runner image (#513)

## [4.136.0] - 2026-06-20

### Fixed

- fix: 🐛 catch bio-gen action throws (no 500) (#512)

## [4.135.0] - 2026-06-20

### Added

- feat: ✨ generate AI artist bios with rich-text editing (#509)

### Changed

- test: ✅ polyfill jsdom Range getClientRects (#511)

## [4.134.0] - 2026-06-19

### Added

- feat: ✨ TanStack Query mutations with cache invalidation (#507)

### Changed

- test: ✅ fix artist-from-release e2e hydration double (#508)

## [4.133.0] - 2026-06-19

### Added

- feat: ✨ revamp and reorganize the admin area (#506)

## [4.132.0] - 2026-06-18

### Changed

- perf: ⚡ eliminate slow >200ms queries and slim carousel payload (#505)

## [4.131.0] - 2026-06-18

### Changed

- refactor: ♻️ ban eslint disables, audit config (#504)

## [4.130.0] - 2026-06-17

### Changed

- refactor: ♻️ prefer arrow functions codebase-wide (#502)

## [4.129.0] - 2026-06-16

### Changed

- Refactor/rename fetch page to fetch entity (#503)
- refactor: ♻️ rename infinite query hooks and drop Page suffix from fetch helpers (#501)

## [4.128.0] - 2026-06-16

### Changed

- refactor: migrate services to the repository pattern (#500)

## [4.127.0] - 2026-06-15

### Changed

- refactor: ♻️ validate remaining query hook responses (#499)

## [4.126.0] - 2026-06-15

### Added

- feat: ✨ report response-validation errors to logs (#498)

## [4.125.0] - 2026-06-15

### Changed

- refactor: ♻️ validate query hook responses with Zod (#497)

## [4.124.0] - 2026-06-14

### Fixed

- fix(deps): 🐛 bump stripe-webhook esbuild range to ^0.28.1 (#496)

## [4.123.0] - 2026-06-14

### Changed

- docs: 📝 document commit and git-hook conventions in CLAUDE.md (#495)

## [4.122.0] - 2026-06-14

### Changed

- refactor: ♻️ add query option overrides and rename page types (#494)

## [4.121.0] - 2026-06-14

### Fixed

- fix(deps): bump esbuild to >=0.28.1 to resolve Dependabot alerts (#493)

## [4.120.0] - 2026-06-14

### Changed

- perf: ⚡ cut re-renders across client UI (#492)

## [4.119.0] - 2026-06-14

### Changed

- docs: 📝 add architecture diagrams,rename docs dir (#491)

## [4.118.0] - 2026-06-14

### Changed

- chore: 🔧 remove spec-kit and fold its constitution into CLAUDE.md (#490)

## [4.117.0] - 2026-06-14

### Changed

- docs: 📝 refine fetching and client-storage guidelines (#489)

## [4.116.0] - 2026-06-13

### Added

- feat: TanStack Query optimization — infinite scroll, signal, caching (#488)

## [4.115.0] - 2026-06-13

### Changed

- perf: parallelize independent fetches with Promise.all (#487)

## [4.114.0] - 2026-06-12

### Fixed

- fix: 🐛 raise nginx rate limit for Grafana UI (#486)

## [4.113.0] - 2026-06-12

### Fixed

- fix: 🐛 recreate Loki datasource with stable uid (#485)

## [4.112.0] - 2026-06-12

### Added

- feat: expand observability — correlation IDs, alerting, metrics, and external monitoring (#482)

### Changed

- Feature/add logging and observability (#484)
- docs: add SNS policy to deploy-role IAM setup (#483)

## [4.111.0] - 2026-06-11

### Added

- feat: add structured logging and observability (#481)

## [4.110.0] - 2026-06-10

### Changed

- Code review optimizations: performance, security, and test stability (#480)

## [4.109.0] - 2026-06-09

### Changed

- Feature/add desktop banner image (#479)

## [4.108.0] - 2026-06-09

### Added

- feat: scope nav menu colors to hover/active states with a fade transition (#478)

## [4.107.0] - 2026-06-08

### Changed

- Update nav menus: shared source of truth, colors, slide-in animation, and a11y skip link (#477)

## [4.106.0] - 2026-06-07

### Changed

- Refactor header into composable components (#476)

## [4.105.0] - 2026-06-07

### Fixed

- fix: header too short on iPhone 16 Pro Max (#475)

## [4.104.0] - 2026-06-07

### Changed

- Feature/create xl device header for desktops: fix mobile header regression (#474)

## [4.103.0] - 2026-06-06

### Added

- feat: add desktop auth menu and revamp site header (#473)

## [4.102.0] - 2026-06-06

### Changed

- Feature/update signup heading (#471)

### Fixed

- fix: update broken pnpm scripts (#470)

## [4.101.0] - 2026-06-05

### Changed

- chore: standardize CloudFront signing on CLOUDFRONT_PRIVATE_KEY_BASE64 (#469)

## [4.98.0] - 2026-06-03

### Fixed

- fix(test): mock Prisma to stop vmThreads engine crash in CI (#466)

## [4.97.0] - 2026-06-02

### Changed

- Develop/chore/comprehensive code review redux (#464)
- chore: perform coder review, harden XSS/SSRF, repair gates and free-cap (#463)

## [4.96.0] - 2026-06-01

### Added

- feat: add graphic image headings across pages (#462)

## [4.95.0] - 2026-05-31

### Added

- feat: improve claude instructions for Opus 4.8 (#460)

### Changed

- Develop/feature/improve claude instructions (#461)

## [4.94.0] - 2026-05-30

### Fixed

- fix(ci): allow stripe-webhook build scripts (#459)
- fix(deps): remediate security vulnerabilities (#458)

## [4.93.0] - 2026-05-29

### Added

- feat: present install instructions for iOS (#456)

### Changed

- Develop/feature/convert to pwa: fix flaky e2e test (#457)

## [4.92.0] - 2026-05-28

### Added

- feat: create basic pwa app (#455)

## [4.91.0] - 2026-05-27

### Added

- feat: improve chat accessibility and fix chat regression (#454)

## [4.90.0] - 2026-05-27

### Changed

- chore: make changes related to code review (#452)

### Fixed

- fix: update chat trigger a11y issue (#453)

## [4.89.0] - 2026-05-26

### Changed

- Create centralized config for setup actions for node.js and pnpm (#451)
- chore: update-packages with vulnerabilities (#450)

## [4.88.0] - 2026-05-23

### Changed

- chore: clean up globals css (#449)

## [4.87.0] - 2026-05-22

### Fixed

- fix: autocomplete email in inputs (#448)

## [4.86.0] - 2026-05-22

### Fixed

- fix: increase font-size in chat input (#447)

## [4.85.0] - 2026-05-21

### Changed

- chore: reorg styles in globals (#446)

## [4.84.0] - 2026-05-19

### Changed

- Implement admin markdown, alternating chat alignment, and other stylistic changes (#445)

## [4.83.0] - 2026-05-18

### Changed

- Make security audit, code review, and style updates to chat (#444)

## [4.82.0] - 2026-05-18

### Changed

- Update deploy with env args for pusher and upstash (#443)

## [4.81.0] - 2026-05-18

### Changed

- Develop/feature/create live chat (#442)
- Implement ban evasion service and enhance chat admin features (#441)

## [4.80.0] - 2026-05-14

### Changed

- Develop/fix/failing e2e tests (#440)

## [4.79.0] - 2026-05-11

### Added

- feat: remove subscription flow entirely (#438)

## [4.78.0] - 2026-05-11

### Changed

- Fix up type errors in webhook, tests, and pre-push (#437)

## [4.77.0] - 2026-05-11

### Changed

- 007 free digital downloads (#436)

## [Unreleased]

### Added

- Free digital downloads for MP3 320 kbps and AAC bundles, gated by a per-release rolling 24h cap of 3 successful downloads. Identity is resolved across authenticated user IDs and an HttpOnly `boudreaux_visitor_id` cookie (with conflict-time union), and concurrent attempts for the same release are guarded by an in-process lock. Audit rows for every successful and failed bundle download are persisted via `DownloadEventRepository`, and the cap-reached UI surfaces a live countdown plus a "Pay what you want" CTA.

## [4.76.0] - 2026-05-06

### Changed

- Develop/improve performance (#435)

## [4.75.0] - 2026-05-06

### Fixed

- fix: update LCP banner preload strategy (#434)

## [4.74.0] - 2026-05-04

### Fixed

- fix(ui): make mp3 320 urls unsigned but cached (#433)

## [4.73.0] - 2026-05-04

### Added

- feat: enhance CI/CD and commit message validation (#432)
- feat: enhance security measures and deployment scripts (#428)

### Changed

- Fix bad merge for deploy to ec2 (#431)
- Fix deploy to EC2 job (#430)
- Develop/update deployment (#429)

## [4.72.0] - 2026-05-02

### Changed

- Develop/fix media player file loading from cdn (#427)

## [4.71.0] - 2026-05-02

### Changed

- Develop/use cloudfront signed urls and cache (#426)

## [4.70.0] - 2026-04-28

### Changed

- Develop/remove experimental css from next (#425)

## [4.69.0] - 2026-04-28

### Changed

- Remove experimental css optimizations (#424)

## [4.68.0] - 2026-04-28

### Changed

- Develop/make misc style changes (#423)

## [4.67.0] - 2026-04-28

### Changed

- Fix image variant srcset for smaller devices (#422)

## [4.66.0] - 2026-04-28

### Changed

- Fix broken stripe deploy webhook (#421)

## [4.65.0] - 2026-04-28

### Changed

- Develop/make misc style changes (#420)
- Develop/make misc style changes and subscription rules (#419)

## [4.64.0] - 2026-04-27

### Changed

- Chore/code review batch 1 to 4 (#418)

## [4.63.0] - 2026-04-27

### Changed

- Develop/fix cls search styling and fa carousel (#417)

## [4.62.0] - 2026-04-26

### Changed

- Develop/perform maintenance and update ai slop (#416)
- Develop/perform maintenance and update ai slop (#415)

## [4.61.0] - 2026-04-26

### Changed

- Refactor banner-carousel code and dry it up a bit (#414)

## [4.60.0] - 2026-04-25

### Changed

- Fix aspect ratio on banner images (#413)

## [4.59.0] - 2026-04-25

### Changed

- Add low priority fetch and lazy loading to banners (#412)

## [4.58.0] - 2026-04-25

### Changed

- Gate build bump version and update version (#411)
- Develop/fix console warnings and lcp (#410)

## [4.57.0] - 2026-04-25

### Changed

- Fix lint and type errors (#409)
- Develop/fix console warnings and lcp (#408)

## [4.56.0] - 2026-04-25

### Changed

- Improve LCP, add image conversion, and fix image loading (#407)

## [4.55.0] - 2026-04-25

### Changed

- Develop/fix console warnings and lcp (#406)

## [4.54.0] - 2026-04-24

### Changed

- Develop/fix console warnings and lcp (#405)

## [4.53.0] - 2026-04-24

### Fixed

- fix: enhance image loader to encode paths and update user status quer… (#404)

## [4.52.0] - 2026-04-23

### Changed

- Develop/fix download bundle limit messaging (#403)

## [4.51.0] - 2026-04-23

### Changed

- Develop/make email template logos consistent (#402)

## [4.50.0] - 2026-04-22

### Changed

- Develop/fix setup ssm params script (#401)

## [4.49.0] - 2026-04-22

### Changed

- Update setup-ssm-params.sh (#400)
- Develop/update s3 secret setting env (#399)

## [4.48.0] - 2026-04-21

### Changed

- Fix secret not being set on EC2 (#398)

## [4.47.0] - 2026-04-21

### Changed

- Update LCP (#397)

## [4.46.0] - 2026-04-21

### Changed

- Develop/fix notification banners and lcp (#396)

## [4.45.0] - 2026-04-21

### Changed

- Develop/fix notification banners and lcp (#395)

## [4.44.0] - 2026-04-21

### Changed

- Develop/fix notification banners and lcp (#394)

## [4.43.0] - 2026-04-20

### Changed

- Fix LCP and banner notifications (#393)

## [4.42.0] - 2026-04-20

### Changed

- Develop/improve lighthouse metrics (#392)

## [4.41.0] - 2026-04-20

### Changed

- Develop/improve lighthouse metrics (#391)

## [4.40.0] - 2026-04-20

### Changed

- Improve LCP and FCP (#390)

## [4.39.0] - 2026-04-20

### Changed

- Fix missing env variables (#389)

## [4.38.0] - 2026-04-20

### Changed

- Fix image loader to support data URIs and update seed database cover … (#388)
- Develop/fix broken images by security audit (#387)

## [4.37.0] - 2026-04-20

### Changed

- Fix the broken images caused by bad next config (#386)

## [4.36.0] - 2026-04-20

### Changed

- Develop/fix zip file naming for mixed and single downloads (#385)

## [4.35.0] - 2026-04-20

### Changed

- Develop/fix zip file naming for mixed and single downloads (#384)

## [4.34.0] - 2026-04-20

### Changed

- Develop/fix zip file naming for mixed and single downloads (#383)

## [4.33.0] - 2026-04-19

### Changed

- Develop/update UI styles (#382)

## [4.32.0] - 2026-04-19

### Changed

- Develop/fix admin release uploads (#381)

## [4.31.0] - 2026-04-19

### Changed

- Fix admin release uploads and add aiff format comments (#380)

## [4.30.0] - 2026-04-19

### Changed

- Fix rate limiting for sigin (#379)

## [4.29.0] - 2026-04-19

### Added

- feat(audio-metadata): implement audio metadata reading and writing fu… (#378)

## [4.28.0] - 2026-04-18

### Changed

- Fix download regression (#377)

## [4.27.0] - 2026-04-18

### Changed

- Fix error in download success and auto-dismiss dialog (#376)

## [4.26.0] - 2026-04-18

### Changed

- Fix downloads (in particular for iOS 26 Safari) (#375)

## [4.25.0] - 2026-04-18

### Changed

- Develop/fix downloads getting stuck (#374)

## [4.24.0] - 2026-04-18

### Changed

- Develop/fix downloads getting stuck (#373)
- Fix downloads getting stuck (#372)

## [4.23.0] - 2026-04-18

### Added

- feat(api): enhance proxy image handling with security checks and size… (#369)

### Changed

- Remove google fonts and unnecessary sharp dependencies (#371)
- Develop/feature/improve security and test coverage (#370)

## [4.22.0] - 2026-04-17

### Changed

- Develop/feature/allow download more than one format (#368)

## [4.21.0] - 2026-04-17

### Changed

- Develop/update download implementation for ios (#367)

## [4.20.0] - 2026-04-17

### Changed

- Update download dialog and functionality (#366)

## [4.19.0] - 2026-04-17

### Changed

- Develop/fix merge failing tests (#365)

## [4.18.0] - 2026-04-17

### Added

- feat: implement bundle download endpoint with rate limiting and optim… (#363)

### Changed

- test: add fake timers for soft delete grace period boundary check (#364)

## [4.17.0] - 2026-04-17

### Changed

- Develop/fix download all formats (#362)

## [4.16.0] - 2026-04-17

### Changed

- Fix download all formats and download using Tanstack (#361)

## [4.15.0] - 2026-04-17

### Changed

- Update carousel to change release selection upon the swipe settling (#360)

## [4.14.0] - 2026-04-17

### Changed

- Fix pnpm for stripe webhook lambda (#359)
- Develop/fix vulnerabilities (#358)

## [4.13.0] - 2026-04-17

### Changed

- Develop/fix vulnerabilities reported by dependabot (#357)

## [4.12.0] - 2026-04-16

### Changed

- Update package-lock.json for webhook (#356)

## [4.11.0] - 2026-04-16

### Added

- feat: refactor to use lazy-loaded Prisma and Stripe clients; add secr… (#355)

## [4.10.0] - 2026-04-16

### Changed

- Add external dependencies to webhook template (#354)

## [4.9.0] - 2026-04-16

### Fixed

- fix: add STRIPE_WEBHOOK_IP_RANGES environment variable to Stripe webh… (#353)

## [4.8.0] - 2026-04-16

### Fixed

- fix: add pnpm installation step in Stripe webhook deployment workflow (#352)

## [4.7.0] - 2026-04-16

### Changed

- Update prisma configuration (#351)

## [4.6.0] - 2026-04-16

### Fixed

- fix: patch transitive dependency vulnerabilities via pnpm overrides (#349)
- fix: update Prisma client copying process and add schema path in pack… (#350)

## [4.5.0] - 2026-04-16

### Changed

- Develop/improve lcp (#348)
- Bump next from 16.2.1 to 16.2.3 (#344)

## [4.4.0] - 2026-04-16

### Fixed

- fix: add ResponseContentType to presigned download URL for binary dow… (#347)

## [4.3.0] - 2026-04-16

### Changed

- Develop/optimize unit tests run (#346)

## [4.2.0] - 2026-04-16

### Changed

- Fix download digital format for returning users as well as single downloads (#345)

## [4.1.0] - 2026-04-15

### Changed

- Feature/fix setup sam action version (#343)

## [4.0.0] - 2026-04-15

### Changed

- Update already purchased flow for returning users (#342)
- null (#null)

## [3.21.0] - 2026-04-14

### Changed

- Optimize for LCP, CLS, and other lighthouse metrics (#340)

## [3.20.0] - 2026-04-14

### Changed

- Develop/fix deployment and outdated actions (#339)

## [3.19.0] - 2026-04-14

### Changed

- Develop/fix deployment and outdated actions (#338)

## [3.18.0] - 2026-04-13

### Changed

- Develop/fix deployment and outdated actions (#337)

## [3.17.0] - 2026-04-13

### Changed

- Develop/fix deployment and outdated actions (#336)

## [3.16.0] - 2026-04-13

### Changed

- Develop/fix deployment and outdated actions (#335)

## [3.15.0] - 2026-04-13

### Changed

- Update README to trigger deploy (#334)
- Develop/fix deployment and outdated actions (#333)

## [3.14.0] - 2026-04-13

### Changed

- Add clean up step for ROLLBACK_COMPLETE errors (#332)
- Update capability iam and add debugging (#331)
- Create and use managed s3 bucket for stripe webhook (#330)
- Add step to install esbuild globally (#329)
- Add npm lockfile for stripe webhook (#328)
- Develop/fix deployment and outdated actions (#327)
- Refactor code structure for improved readability and maintainability (#326)
- Develop/fix deployment and outdated actions (#325)
- Develop/fix deployment and outdated actions (#324)

## [3.13.0] - 2026-04-13

### Changed

- Develop/fix deployment and outdated actions (#323)
- Update stripe webhook actions (#322)

## [3.12.0] - 2026-04-13

### Changed

- Make first deploy for stripe-webhook lambda (#321)

## [3.11.0] - 2026-04-12

### Fixed

- fix: optimize banner carousel image rendering and improve artist disp… (#320)

## [3.10.0] - 2026-04-12

### Changed

- Develop/feature/convert simple fetch to tanstack query (#319)

## [3.9.0] - 2026-04-12

### Added

- feat: optimize performance, queries, and caching (#318)

## [3.8.0] - 2026-04-09

### Added

- feat: increase max upload size for digital formats to 500MB and update related limits to 48MB (#311)
- feat: enhance purchase confirmation email handling and idempotency logic (#310)
- feat: implement audio tag editing service (#305)
- feat: implement PWYW downloads with format selection (#304)

### Changed

- Chore/security audit (#317)
- chore: update GitHub Actions to use latest action versions (#315)
- Fix deployment workflow (#313)
- Feature/confirm and download purchase (#309)
- Fix playwright tests (#308)
- Update README for playwright tests (#307)
- Fix and add playwright tests (#306)
- Fix CDN issue with the built NextJS on CI (#303)
- Update github actions and pnpm versions (#302)
- Create ability to upload all digital premium formats in the admin (#299)
- Develop/feature/download freemium music (#292)
- Use DB-resolved title for Stripe product name in checkout session (#298)
- Develop/feature/download freemium music (#281)
- [WIP] [WIP] Address feedback on freemium music download feature implementation (#291)
- [WIP] [WIP] Address feedback on download freemium music feature implementation (#288)
- [WIP] [WIP] Address feedback on 'Develop/feature/download freemium music' PR (#287)
- Use canonical DB title for Stripe product_data.name instead of client-supplied value (#290)
- Add comprehensive unit tests for amountInputSchema (#286)
- Fix IP allowlist helpers: explicit IPv4 octet validation and prefix-length bounds checking (#285)
- Use MAX_RELEASE_DOWNLOAD_COUNT constant in purchase confirmation email copy (#284)
- Fix account/purchase enumeration vulnerability in checkGuestPurchaseAction (#283)
- Remove unreachable `amountCents < 50` runtime check (#289)

### Fixed

- fix: address security audit review feedback (#316)
- fix: replace public-ip action with curl command to retrieve runner IP (#314)
- fix: address PR review - XSS hardening, CSS typos, Tailwind arbitrary values, atomic upsert, URL encoding (#312)
- fix(e2e): replace undefined `loginAsAdmin` with `adminPage` fixture in upload spec (#301)
- fix: move @aws-sdk/lib-storage to dependencies (#300)
- fix: resolve userId server-side in purchase checkout action (#297)
- fix: guard against NaN amountCents in download-dialog handleSubmit (#296)
- fix: map server action error codes to user-friendly messages in PurchaseCheckoutStep (#295)
- fix: strict IPv4 validation in Stripe webhook IP allowlist (#294)
- fix: use DB-sourced release title for Stripe product_data.name (#293)

## [3.7.0] - 2026-03-21

### Added

- feat: Enhance subscription handling to send confirmation emails on tier changes (#278)

### Changed

- Develop/feature/download freemium music (#275)
- Address feedback on freemium music download feature implementation (#277)
- Move confirmation email sending from success page to Stripe webhook handler (#276)

### Fixed

- fix: safe access of subscription.items.data[0] in handleSubscriptionUpdated (#279)

## [3.6.0] - 2026-03-20

### Changed

- Develop/feature/download freemium music (#274)

## [3.5.0] - 2026-03-16

### Changed

- Develop/feature/download freemium music (#273)

## [3.4.0] - 2026-03-14

### Changed

- Develop/feature/download freemium music (#272)

## [3.3.0] - 2026-03-14

### Changed

- Update social share icons alignment and styles (#271)

## [3.2.0] - 2026-03-14

### Added

- feat: update Content-Security-Policy and add ShareThis script to layout (#270)

## [3.1.0] - 2026-03-13

### Changed

- 002 tour management (#269)

## [3.0.0] - 2026-03-11

### Changed

- Start tour management feature (#263)
- Fix misleading JSDoc priority comment in `getArtistDisplayName` (#267)
- Remove non-existent fields from createTourAction permittedFieldNames (#266)
- Fix conditional expect masking failures in public tours search e2e test (#265)

### Fixed

- fix: revert textarea min-height to valid Tailwind arbitrary value (#268)
- fix: use absolute imports in tour-repository.ts (#264)

## [2.8.0] - 2026-03-07

### Changed

- Add some padding to featured artist (#262)

## [2.7.0] - 2026-03-07

### Changed

- Develop/feature/search artists (#261)

## [2.6.0] - 2026-03-07

### Changed

- Fix tests and update artist and release search (#260)

## [2.5.0] - 2026-03-06

### Changed

- Fix tests for artist releases and related (#258)
- Address feedback on artist releases test fixes (#259)

## [2.4.0] - 2026-03-05

### Changed

- Update the associations made when uploading tracks (#257)

## [2.3.0] - 2026-03-05

### Changed

- Update admin create release track (#256)

## [2.2.0] - 2026-03-04

### Changed

- Update artist search result page (#255)

## [2.1.0] - 2026-03-04

### Changed

- Update search feature to find artists (#254)

## [2.0.0] - 2026-03-04

### Changed

- Add search all artists feature (#251)
- [WIP] Address feedback on 'Add search all artists feature' PR (#253)
- [WIP] Address feedback on search all artists feature PR (#252)

## [1.7.0] - 2026-02-24

### Changed

- Develop/bugfix/fix misc admin (#246)

## [1.6.0] - 2026-02-22

### Changed

- 001 release search player (#245)

## [1.5.0] - 2026-02-19

### Changed

- Update readme purpose section (#243)

## [1.4.1] - 2026-02-19

### Changed

- Add version badge update to CI workflow and update README (#242)
- null (#null)

## [1.4.0] - 2026-02-18

### Changed

- Fix the build! permission! CI! (#241)
- Update code coverage badge (#240)

## [1.3.0] - 2026-02-18

### Changed

- Update badges (#239)

## [1.2.0] - 2026-02-18

### Changed

- Fix coverage badge update to use git worktree (#238)
- Update coverage badge (#237)
- Fix playwright sign out test (#236)
- Add permissions for badges (#234)
- Add moar badges (#233)
- Update coverage badge (#232)
- Added code coverage badge (#231)

## [1.1.0] - 2026-02-18

### Changed

- Update license badge in README.md (#230)

## [1.0.0] - 2026-02-18

### Changed

- Update deployment secret handling for bump version (#229)
- Updated to used pat fg secret to deploy (#228)
- Made media player enhancements (#227)
- Add server-only import to contact-action.ts (#225)
- Add server-only guard to ses-client (#224)
- Wait for build before running tests and quality jobs (#226)
- Add setup action for Node.js environment and refactor CI workflow (#222)
- Add workflow context validation before version bumping (#221)
- Fix changelog generation to collect all PRs when no tags exist (#220)
- Add validation for PR metadata extraction in version bump workflow (#219)
- Add health verification before automatic version bumping (#218)
- Fix shell portability issues in PR tracking with array-based implementation (#217)
- Add UI error assertions to TrackSelect fetch error tests (#207)
- Add setValue spy to test releaseId clearing on track deselect (#206)
- Add setValue spy assertion for multi-release track selection test (#205)
- Remove misleading mock setup comment in FeaturedArtistForm tests (#204)
- Spy on setValue calls in FeaturedArtistForm tests instead of checking variable existence (#203)
- Fix test assertions to verify setValue calls and error messages (#202)
- Clear trackId when releaseId changes in featured artist form (#199)
- Document fireEvent.keyDown usage for carousel keyboard tests (#197)
- Add beforeEach block to prevent test pollution in carousel tests (#196)
- Add guard for empty scrollSnapList in carousel loop navigation (#195)
- Develop/feature/add mobile contact form (#223)
- Fix carousel test mocks to properly verify disabled state at boundaries (#194)
- Fix test pollution in carousel loop cycling tests (#193)
- Use userEvent.keyboard() in carousel keyboard loop tests (#192)
- Enhance carousel functionality to support looping behavior for navigation (#191)
- Automatically bump version upon successful deployment (#216)
- Validate session.user.id after requireRole in update-group-action (#190)
- Replace fixed timeouts with assertion-based waits in notification banner E2E tests (#189)
- Increase test coverage across all metrics, fix, and optimize performance (#209)
- Remove ESLint disable by renaming Playwright fixture parameter (#188)
- Add E2E_MODE gate to Turnstile test secret bypass (#187)
- Strengthen requireRole to validate session.user.id for audit logging (#185)
- Add UI assertions to TrackSelect error handling tests (#208)
- Add setValue spy assertion to test for undefined releaseTracks (#210)
- Fix duplicate CloudFront invalidations in deploy workflow (#215)
- Fix Vitest environment pragma placement in test files (#212)
- Optimize Docker and CI/CD workflows for improved build efficiency, clarity, and speed (#214)
- Optimize Playwright tests through parallelization and other improvements (#213)
- Fix Windows path handling in generateS3Key (#159)
- Update FeaturedArtistForm and TrackSelect components (#201)
- Update social icons based on review feedback (#164)
- Add copyleft MPL 2.0 license to project (#211)
- Add FeaturedArtistForm and TrackSelect components with tests (#200)
- Add releaseId parameter support in Tracks API and related components (#198)
- Develop/feature/audit and improve security (#184)
- Add playwright e2e tests covering happy paths (#186)
- Fix auto-cycle interval documentation mismatch in NotificationBanner (#166)
- Fix cert renewal to handle both webroot and standalone authenticators (#169)
- Configure Copilot instructions with current stack version and workflow context (#182)
- Address feedback on audit and improve security implementation (#179)

## [0.5.1] - 2026-02-14

### Security

- Sanitize raw error messages in all server actions to prevent internal details from leaking to clients
- Add ObjectId format validation for `notificationId` in notification banner actions
- Extract shared `OBJECT_ID_REGEX` and `isValidObjectId` utility to `src/lib/utils/validation/object-id.ts`
- Replace `console.error` with structured logger across all action files
- Refactor authentication handling to use `requireRole` for consistent session validation

### Changed

- Convert `getActionState` from default export to named export for consistency with project conventions
- Standardize all import paths to use absolute `@/lib/...` imports instead of relative paths
- Fix slug generation loop off-by-one in `find-or-create-artist-action` and `find-or-create-group-action`
- Remove unnecessary `processedPayload` shallow copy in `notification-banner-action`

### Fixed

- Fix `setUnknownError` mock in tests to match actual default message
- Replace invalid ObjectId test fixtures (`notification-123`, `non-existent`) with valid 24-character hex strings
- Update all test error expectations to match sanitized error messages
- Fix TypeScript type errors in test files where `requireRole` mock used `undefined` instead of a `Session` value
- Fix 61 ESLint import ordering issues across modified files

### Tests

- Add tests for invalid ObjectId format validation (update, delete, publish, unpublish)
- Add slug generation loop cap edge case test
- Update vi.mock paths to match absolute import paths

## [0.5.0] - 2026-02-14

### Added

- Bulk track upload with duplicate detection via audio file hash
- CoverArtField component for cover art uploads in forms
- Notification banner image processing action
- Presigned S3 upload actions for audio and images
- Test coverage for low-coverage files and recent changes
- MongoDB backup and restore scripts
- S3 backup, restore, and upload scripts
- Image upload script with CloudFront cache invalidation

### Changed

- Style navigation menu and close on auth link click
- Add spacing around notification banner
- Refactor duplicate track filtering to ensure `audioFileHash` is defined

### Fixed

- Fix CDN integration with Next.js
- Fix certificate/CDN issues
- Fix `.next` directory build issues

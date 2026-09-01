# Contributing

Thanks for taking a look. This is a small, deliberately dependency-light
project; the guidelines below are mostly about keeping it that way.

## Getting set up

```bash
git clone https://github.com/pepperonas/claude-token-tracker.git
cd claude-token-tracker
npm install          # installs deps and runs scripts/setup.js
npm start            # http://localhost:5010
```

There is no build step. The frontend is served straight from `public/`.

```bash
npm test             # vitest, ~2 s
npm run test:watch
npm run test:coverage
npm run lint         # ESLint 9, covers lib/ and server.js
npm run badges       # regenerate the README badges from a real test run
```

## Ground rules

**Two runtime dependencies.** `better-sqlite3` and `chokidar`. A change that
adds a third needs a reason that could not be met with the standard library —
the PDF export, for instance, uses the browser's print dialog rather than
pulling in a PDF engine.

**No build step, no framework.** The frontend is vanilla DOM with `textContent`
(never `innerHTML`). Charts go through `renderChart()` so they update in place.

**CommonJS in the backend.** `require` / `module.exports`.

**Nothing in a test may touch the real environment.** Point `DB_PATH` and
`CLAUDE_DIR` at a `mkdtemp()` directory *before* requiring `lib/config`, and
seed fixtures rather than reading whatever happens to be on the machine.

**Prefer numbers over shapes in assertions.** `expect(body.messages).toBe(270)`
catches a regression; `expect(Array.isArray(body))` does not.

**Mutate every new pin once.** A test you have not seen fail is not a guarantee.
Break the thing it is supposed to catch, watch it go red, then restore.

**Text checks must run against comment-free source.** The documentation quotes
the rules it removed, so a raw text search matches the prose and passes — or
fails — for the wrong reason.

**Umlauts in German text.** ü, ö, ä, ß — never `ue`, `oe`, `ae`, `ss`.

## Badges are generated, never edited

Every badge that carries a number lives inside the `<!-- BADGES:START -->` /
`<!-- BADGES:END -->` block and is written by `npm run badges`. Editing one by
hand is how the achievement badge came to claim 700 for months after the
catalogue reached 1200.

```bash
npm run badges              # rewrite from a real test run
node scripts/update-badges.js --check   # CI dry run: exits 1 if it would change
```

The generator derives everything it can from the source — version, lines of
code, tests, achievements, routes, tables, i18n keys, dependency versions — and
the rest are live GitHub badges that shields.io refreshes on its own. A test
(`test/badges.test.js`) fails if a value-carrying badge appears outside the
generated block.

Adding tests changes the line count, so run `npm run badges` **after** staging
new files, not before.

## Before opening a pull request

1. `npm test` and `npm run lint` are clean.
2. New behaviour has a test, and you have seen that test fail.
3. User-visible strings exist in **both** `en` and `de` in `public/js/i18n.js`.
   A missing key renders as the raw key; a test enforces this for achievements.
4. Documentation that states a number (endpoint counts, achievement counts,
   test counts) is updated. `docs/` and `CLAUDE.md` are part of the change.
5. `CHANGELOG.md` has an entry describing what changed and, where it matters,
   what it was before.

## Adding an achievement

Check the threshold against real statistics first. Several early achievements
demanded conditions that could never occur — a 60 % output-token share where
cache reads are 98 % of all tokens, or a decade of unbroken daily work. An
unreachable badge is padding, not a goal. See
[docs/METRICS.md](docs/METRICS.md#achievements).

Time-based achievements use `activeMin`, never `durationMin`. The latter counts
idle time and runs an order of magnitude high.

## Reporting a bug

Include the mode (single-user or multi-user), the Node version, and whichever of
these is relevant: the failing endpoint, the browser console, or
`journalctl`/PM2 output. If it involves cost or token figures, `GET /api/pricing`
shows which price source is in effect.

## Security

Do not open a public issue for a vulnerability. Mail
[martin.pfeffer@celox.io](mailto:martin.pfeffer@celox.io) instead.

The only unauthenticated surface is the public share endpoint; in single-user
mode the whole API is open by design and the server is expected to stay bound to
localhost.

# GEMINI.md

Rules and guidance for Google Antigravity and Gemini working in this repo.

See [AGENTS.md](AGENTS.md) for full architecture and subsystem documentation.

## Core Directives

1. **Attribution & Branding:**
   - Author credit line is `BY SUMANTH REDDY`.
   - Never use or reintroduce DAO logos, marks, or "GATHER".

2. **UI & Engine Decoupling:**
   - Do NOT import DOM or UI classes (`src/ui/*`) into `src/core/*` or `src/lite/*`.
   - Engine and renderer logic must remain portable across the web studio, hero embeds, and desktop builds.

3. **Single Parameter Contract:**
   - All simulation and effect settings must be registered in `src/core/params.ts`.

4. **Bundle & Performance Budgets:**
   - Standalone hero (`dist-hero/hero.js`) gzip budget is strictly under 200 kB.
   - Graphics target is WebGL2. WebGPU is reserved for depth inference acceleration.

5. **Verification Routine:**
   - On Windows PowerShell, use `cmd.exe /c` if execution policy blocks scripts:
     - Tests: `cmd.exe /c npm test` (all 38 vitest tests must pass)
     - Types: `cmd.exe /c npx tsc --noEmit` (zero errors)
     - Browser verification: run corresponding `scripts/verify-*.mjs` or use Playwright.

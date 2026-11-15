# Merged demo validation — 15 November 2026

Public demo: https://aegis-kl-disaster-demo.knowingode16.chatgpt.site

Base: `faf3bb8` (main after Dev 1, Dev 2, and Dev 3 merges).
The public Sites deployment retains the React/Vite frontend and shared GeoJSON;
FastAPI and Ollama remain local. The imagery modal labels the synthetic flood event.

## Integration fixes

- Excluding every camp now returns zero camps, rather than resurrecting cached candidates.
- Mapbox point exclusions are proposals, not polygon avoidance guarantees. The returned
  corridor is checked against every current hazard plus its 150m buffer.
- Unsafe/unavailable live routes use the cached demo route only after checking its
  geometry against current hazards and its endpoints within 100m of the requested endpoints.
  Otherwise routing fails visibly instead of marking an invalid route secure.
- Mapbox requests time out after six seconds each. Cache use is identified in metadata and UI logs.
- Production builds with no `VITE_BACKEND_URL` load shared data directly. Local development
  retains `localhost:8000`; explicitly configured backend URLs still work.
- Empty hazard collections stay empty when passed from the UI into routing.

## Verification

Passed frontend build and six Node checks:
`test-routing.mjs`, `test-turfSafeZone.mjs`, `test-phase3-hardening.mjs`,
`test-safe-zone-results.mjs`, `test-api-demo.mjs`, `test-route-validation.mjs`.
The three new regression scripts execute the actual TypeScript services.

Passed four backend unit tests and the required health/forced-cache smoke check.
The public Mapbox token loaded the dark-v11 style with HTTP 200 using the demo origin.
Both actual Directions requests returned HTTP 200. Their proposed avoidance route
still intersected the hazard. The fixed production service returned `CACHED_DEMO_ROUTE`,
and the selected cached corridor did not intersect the current 150m buffered hazard.

Sites reported successful publication with public access. Browser automation could
not start, so the visible map, controls, animations, and complete browser click-through
were not verified. Vite reports a large bundle warning (~703KB gzipped JS).

## Inference results

See `benchmarks/20261115T050853Z/REPORT.md` for the controlled model benchmark and
`prompt-tests/REPORT.md` for prompt experiments. Instruct was faster than Thinking,
but two revised prompts missed the synthetic flood. The original prompt, local
backend model setting, images, and golden cache are retained.

## Hosting

The separate local source checkout is `sites/aegis-kl-demo/` (ignored by the GitHub repo).
Its tracked `.openai/hosting.json` retains the Sites project identity.
For a hosted cached demo, leave `VITE_BACKEND_URL` unset and build with a public
`VITE_MAPBOX_TOKEN`; never use a Mapbox secret token. The current Sites archive contains
only static build output, imagery, and the hosting manifest.

Cached scan data resolves immediately; the existing UI intentionally plays a 3s scan
plus a 1.2s completion hold. Map tiles and live Mapbox requests require internet.
The synthetic flood and cached line are presentation fixtures. Geometric clearance
is not evidence that a road or camp is safe in a real disaster.

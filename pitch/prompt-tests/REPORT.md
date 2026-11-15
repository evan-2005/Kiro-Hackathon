# Instruct prompt comparison — KL demo pair

The existing production prompt is retained. Neither revised prompt improved detection.
The golden damage cache, images, and local backend configuration remain unchanged.

| Prompt | Synthetic flood detections | Identical-image control | Warm median |
| --- | --- | --- | --- |
| Stricter coverage instructions (`20261115T054132Z`) | 0/4 | No hazards | 2.336 s |
| Shorter change instructions (`20261115T054636Z`) | 0/4 | No hazards | 3.724 s |
| Restored production baseline (`20261115T054815Z`) | 4/4 | No hazards | 8.729 s |

Baseline cold load: 29.737 s. All four baseline runs returned normalized box
`[0.45, 0.35, 0.55, 0.55]`, matching the earlier controlled benchmark.
The faster empty outputs from the revised prompts are detection regressions, not a speed improvement.
The separate controlled benchmark recorded a 6.193 s Instruct warm median;
these later tests ran alongside integration/build work and are not a replacement speed benchmark.

The cloud-limited December 2021 real KL pair returned no hazards for all three prompts.
This pair has no verified damage labels, so that result does not establish accuracy.
The synthetic image is a flood composite over KL imagery, not a real post-event acquisition.
Box extent and image registration still need human review before promoting any new cache.

Each run directory preserves the exact prompt, image hashes, live-pipeline output, and timings.
Tests override the model and fallback setting only within the test process.
No model result was substituted with the cached response during these tests.

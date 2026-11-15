# Qwen model benchmark

Hardware: Apple M4, 16 GiB RAM. Both models were observed running 100% on GPU using the llamacpp runner and an 8192-token context. Thinking occupied approximately 4.3 GB and Instruct approximately 4.5 GB while loaded.

The test reused the exact production prompt, original synthetic KL image pair, Pydantic JSON schema, temperature 0, reasoning_effort=none, and 4096-token output budget. Models ran sequentially through the same local OpenAI-compatible API. There was no model download running during the counted comparison.

| Model | Cold run | Warm median (3 runs) | Valid JSON |
| --- | --- | --- | --- |
| qwen3-vl:4b-aegis | 171.491 s | 153.943 s | 4/4 |
| qwen3-vl:4b-instruct-aegis | 26.452 s | 6.193 s | 4/4 |

Instruct was 24.9 times faster by warm median and 6.5 times faster cold.

Thinking warm runs: 154.956, 144.008, 153.943 seconds.
Instruct warm runs: 6.132, 6.193, 6.419 seconds.

Thinking returned the same normalized box [0.4, 0.3, 0.5, 0.7] in all four runs. Instruct returned [0.45, 0.35, 0.55, 0.55] in all four runs. Valid JSON and consistent boxes do not establish detection accuracy.

## Limits

- One synthetic KL pair, no labeled ground-truth box or false-positive benchmark.
- Warm runs repeat identical images and benefit from input caching. They do not measure a stream of new images.
- Cold means the model was unloaded, not that operating-system disk caches were cleared.
- Model order was sequential, not randomized. Other machine activity and thermal conditions were not controlled in a laboratory setting.
- The interrupted setup probe in 20261115T050254Z is excluded because it overlapped the Instruct download.
- No API fallback was used; failed or truncated responses would have been recorded as failures.

## Recommendation

Instruct is the better candidate for the next speed-and-accuracy trial. Its 6.193-second warm median still exceeds the three-second live-demo budget and the frontend's six-second timeout. Retain the cached presentation path until latency and spatial accuracy meet the chosen requirements. The application's configured model and golden cache were not changed.

The downloaded Instruct model and its 8K benchmark alias remain installed locally. Reproduction harness: `backend/venv/bin/python pitch/benchmark_models.py`, after downloading `qwen3-vl:4b-instruct`. The harness creates the Instruct benchmark alias and leaves application configuration intact.

"""Exercise the current production prompt with Instruct; keep config, images and cache intact."""
import base64
import hashlib
import json
import statistics
import sys
from datetime import datetime, timezone
from pathlib import Path
from time import perf_counter
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import httpx

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'backend'))
from app.config import OLLAMA_BASE_URL
from app.services import vision_analyzer as vision

MODEL = 'qwen3-vl:4b-instruct-aegis'


def image_url(path, mime):
    return f'data:{mime};base64,' + base64.b64encode(path.read_bytes()).decode()


def run_tests():
    output = ROOT / 'pitch/prompt-tests' / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    output.mkdir(parents=True)
    assets = ROOT / 'pitch/assets'
    before_path, after_path = assets / 'kl-before.jpg', assets / 'kl-after-synthetic.png'
    before, after = image_url(before_path, 'image/jpeg'), image_url(after_path, 'image/png')
    protected = [ROOT / 'backend/.env', ROOT / 'shared/fallback_damage.json', before_path, after_path]
    hashes = {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in protected if p.exists()}
    probe = MagicMock()
    probe.beta.chat.completions.parse.return_value = SimpleNamespace(choices=[SimpleNamespace(
        message=SimpleNamespace(parsed=vision.VisionAnalysisResult(summary='probe', hazards=[])))])
    with patch.object(vision, 'USE_FALLBACK_MOCK', False), patch.object(vision, 'OpenAI', return_value=probe):
        vision.analyze_disaster_imagery(before, after)
    request = probe.beta.chat.completions.parse.call_args.kwargs
    (output / 'methodology.json').write_text(json.dumps({
        'model': MODEL, 'contextTokens': 8192, 'temperature': request['temperature'],
        'maxOutputTokens': request['max_tokens'], 'reasoningEffort': request['reasoning_effort'],
        'systemPrompt': request['messages'][0]['content'], 'inputHashes': hashes,
        'comparison': 'Original Instruct prompt results: pitch/benchmarks/20261115T050853Z',
        'accuracyGroundTruthAvailable': False,
    }, indent=2) + '\n')
    with httpx.Client(base_url=OLLAMA_BASE_URL.rstrip('/').removesuffix('/v1'),
                      timeout=30, trust_env=False) as native:
        native.post('/api/generate', json={'model': MODEL, 'keep_alive': 0}).raise_for_status()
    cases = [('synthetic-cold', before, after)] + [('synthetic-warm', before, after)] * 3
    cases += [('no-change', before, before),
        ('cloud-limited', image_url(assets / 'kl-sentinel-2021/before-2021-12-09.png', 'image/png'),
         image_url(assets / 'kl-sentinel-2021/after-2021-12-24.png', 'image/png'))]
    runs = []
    print(f'OUTPUT {output}', flush=True)
    for index, (case, baseline, query) in enumerate(cases):
        print(f'START {index + 1}/{len(cases)} {case}', flush=True)
        started = perf_counter()
        with patch.object(vision, 'USE_FALLBACK_MOCK', False), patch.object(vision, 'VISION_MODEL', MODEL):
            result = vision.analyze_disaster_imagery(baseline, query)
        elapsed = round(perf_counter() - started, 3)
        assert result['metadata']['source'].startswith('QWEN3_VL_LIVE_PIPELINE'), result['metadata']
        for feature in result['features']:
            ring = feature['geometry']['coordinates'][0]
            assert ring[0] == ring[-1] and len(ring) == 5
            assert all(101.66 <= lon <= 101.73 and 3.11 <= lat <= 3.17 for lon, lat in ring)
        record = {'case': case, 'seconds': elapsed, 'result': result,
                  'boxes': [f['properties']['bboxNormalized'] for f in result['features']]}
        runs.append(record)
        (output / 'runs.json').write_text(json.dumps(runs, indent=2) + '\n')
        print(json.dumps({'case': case, 'seconds': elapsed, 'boxes': record['boxes'],
                          'summary': result['metadata'].get('summary')}), flush=True)
    summary = {'model': MODEL, 'coldSeconds': runs[0]['seconds'],
        'warmMedianSeconds': round(statistics.median(r['seconds'] for r in runs if r['case'] == 'synthetic-warm'), 3),
        'syntheticFloodDetected': all(r['boxes'] for r in runs if r['case'].startswith('synthetic')),
        'noChangeControlPassed': not next(r for r in runs if r['case'] == 'no-change')['boxes'],
        'syntheticBoxes': [r['boxes'] for r in runs if r['case'].startswith('synthetic')],
        'cloudLimitedBoxes': next(r for r in runs if r['case'] == 'cloud-limited')['boxes']}
    assert hashes == {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in protected if p.exists()}
    (output / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
    print('SUMMARY ' + json.dumps(summary), flush=True)
    assert summary['syntheticFloodDetected'], 'Model missed the synthetic flood in one or more runs'
    assert summary['noChangeControlPassed'], 'Model invented a change between identical images'


if __name__ == '__main__':
    run_tests()

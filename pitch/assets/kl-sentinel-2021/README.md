# Authentic Kuala Lumpur reference pair

These are genuine Copernicus Sentinel-2 L2A optical images over the existing mission bounds. They are **cloud-limited reference images, not verified evidence of flood damage or bridge closures**. The clearer synthetic KL demo and its golden cache are retained separately.

| Image | Acquisition time (UTC) | Satellite |
| --- | --- | --- |
| `before-2021-12-09.png` | 2021-12-09 03:47:20.757 | Sentinel-2A |
| `after-2021-12-24.png` | 2021-12-24 03:47:17.256 | Sentinel-2B |

Both images are **784 × 672 pixels**, north-up, EPSG:4326, with identical bounds `[101.66, 3.11, 101.73, 3.17]` in west/south/east/north order. RGB source pixels are 10 metres. Their output grid samples approximately 10 metres per pixel. The image corners for a Mapbox image source, in top-left/top-right/bottom-right/bottom-left order, are:

```json
[[101.66, 3.17], [101.73, 3.17], [101.73, 3.11], [101.66, 3.11]]
```

The source COGs were read by geographic window and resampled onto one common grid. They have no generated floodwater, manual damage marks, or AI image edits. Cropping/reprojection preserves source content but cannot remove clouds or add detail beyond the sensor resolution.

## Verification and limitations

- Source STAC IDs, acquisition times, georeferencing, license links, and image SHA-256 hashes are preserved in `provenance.json` and the two original STAC item JSON files.
- Visual review shows clouds and shadows, including near the confluence in the later frame. Flood damage could not be independently identified in this pair.
- The December 19, 2021 scenes returned for the flood period had approximately 99–100% scene-wide cloud cover. December 24 is a later observation, not an observation of the flood peak.
- A model output on this pair is an unverified hypothesis. Do not replace the golden cache with it or present it as confirmed disaster detection.
- This pair has the same KL geography as the current mission. No foreign disaster scenario or new mission coordinates are introduced.

## Source and attribution

Source: [Element 84 Earth Search](https://earth-search.aws.element84.com/v1), collection `sentinel-2-l2a`, using the full-resolution true-colour COG assets rather than thumbnails. Acquisition metadata and native georeferencing are in the saved STAC items.

Attribution: **Contains modified Copernicus Sentinel data (2021)**. See the source item license links for the Sentinel data terms.

Local preparation used Rasterio and Pillow in a temporary tools environment. Neither is a new application dependency.

## Qwen test

The pair was tested through the FastAPI route using `TestClient`, with live inference enabled only within that test process. The configured model was `qwen3-vl:4b-aegis`. The request took **89.632 seconds**, including **89.576 seconds** in the model call.

Qwen returned one suspected river-overtopping box, `[0.15, 0.7, 0.4, 0.9]`, in the southwest of the image. That area includes substantial cloud shadow in the later image. Visual review did not establish flooding there. The response is preserved unchanged in `model-result.geojson` as **unverified model output**, not a confirmed detection or a golden-cache candidate. The model's `CRITICAL` label is also unverified.

This test verifies that authentic KL imagery reaches the inference pipeline. It does not demonstrate reliable flood detection. The current demo cache and local fallback setting were preserved.

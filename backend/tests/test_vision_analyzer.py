import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.services import vision_analyzer as vision


class VisionTests(unittest.TestCase):
    def hazard(self, **changes):
        return vision.DetectedHazard(**{
            "title": "Visible floodwater", "hazard_type": "RIVER_OVERTOPPING",
            "severity": "HIGH", "water_depth_est_m": None,
            "impact_description": "Suspected road inundation, verify on site",
            "min_x": 0.25, "min_y": 0.25, "max_x": 0.75, "max_y": 0.75,
            **changes,
        })

    def test_projection_is_north_up_lon_lat_and_closed_counterclockwise(self):
        bbox = {"minLon": 101.66, "minLat": 3.11, "maxLon": 101.73, "maxLat": 3.17}
        ring = vision.normalize_box_to_geojson_polygon(self.hazard(), bbox)[0]
        self.assertEqual(ring, [
            [101.6775, 3.155], [101.6775, 3.125], [101.7125, 3.125],
            [101.7125, 3.155], [101.6775, 3.155],
        ])

    def test_invalid_boxes_are_rejected(self):
        for changes in ({"min_x": -0.1}, {"max_y": 1000}, {"min_x": 0.8},
                        {"max_y": 0.25}, {"min_y": float("nan")},
                        {"water_depth_est_m": -1}, {"severity": "CONFIRMED"}):
            with self.subTest(changes=changes), self.assertRaises(ValidationError):
                self.hazard(**changes)

    @patch.object(vision, "USE_FALLBACK_MOCK", False)
    @patch.object(vision, "OpenAI")
    def test_live_result_preserves_boxes_and_labels_images(self, client):
        parsed = vision.VisionAnalysisResult(summary="Suspected flooding", hazards=[self.hazard()])
        parse = client.return_value.beta.chat.completions.parse
        parse.return_value = SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(parsed=parsed))])
        result = vision.analyze_disaster_imagery("data:before", "data:after")
        self.assertTrue(result["metadata"]["source"].startswith("QWEN3_VL_LIVE_PIPELINE"))
        self.assertEqual(result["features"][0]["properties"]["bboxNormalized"], [0.25, 0.25, 0.75, 0.75])
        self.assertIsNone(result["features"][0]["properties"]["waterDepthEstM"])
        content = parse.call_args.kwargs["messages"][1]["content"]
        self.assertEqual([part["image_url"]["url"] for part in content if part["type"] == "image_url"],
                         ["data:before", "data:after"])
        self.assertTrue(content[0]["text"].startswith("BEFORE"))
        parse.side_effect = TimeoutError("model unavailable")
        fallback = vision.analyze_disaster_imagery(after_image_url="data:after")
        self.assertEqual(fallback["metadata"]["source"], "FALLBACK_GOLDEN_CACHE")
        self.assertIn("warning", fallback["metadata"])

    def test_api_docs_and_explicit_fallback(self):
        client = TestClient(app)
        self.assertEqual(client.get("/docs").status_code, 200)
        self.assertEqual(client.get("/api/health").status_code, 200)
        response = client.post("/api/analyze-disaster", json={"force_mock": True})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["type"], "FeatureCollection")


if __name__ == "__main__":
    unittest.main()

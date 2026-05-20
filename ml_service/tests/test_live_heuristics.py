import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from live_heuristics import apply_live_window_heuristics
from prediction_output import build_prediction_batch


def _benign_predictions(count):
    return [
        {
            "row_index": index,
            "prediction": "BENIGN",
            "confidence": 0.99,
            "probabilities": {"BENIGN": 0.99, "DoS": 0.01},
            "top_features": ["Destination Port"],
            "feature_values": {"Destination Port": 5000},
        }
        for index in range(count)
    ]


def test_live_window_heuristic_flags_port_flood():
    count = 100
    df = pd.DataFrame(
        {
            "Source IP": [f"10.0.0.{index % 5 + 1}" for index in range(count)],
            "Source Port": [40000 + index for index in range(count)],
            "Destination IP": ["192.168.121.150"] * count,
            "Destination Port": [5000] * count,
            "Protocol Name": ["TCP"] * count,
            "Packet Count": [8] * count,
            "Byte Count": [1200] * count,
            "SYN Flag Count": [1] * count,
        }
    )

    predictions, warnings = apply_live_window_heuristics(df, _benign_predictions(count), window_seconds=5)

    assert predictions[0]["prediction"] == "DoS"
    assert predictions[0]["model_name"] == "RandomForest_IDS + LiveWindowHeuristic"
    assert predictions[0]["feature_values"]["window_flow_count"] == count
    assert warnings

    batch = build_prediction_batch(
        df,
        predictions,
        {"name": "RandomForest_IDS", "version": "test", "supported_classes": ["BENIGN", "DoS"]},
        "live",
    )
    assert batch["summary"]["malicious_count"] == count
    assert batch["summary"]["class_distribution"]["DoS"] == count
    assert batch["alerts"][0]["ml"]["model_name"] == "RandomForest_IDS + LiveWindowHeuristic"
    assert "heuristic" in batch["alerts"][0]["threat"]["description"].lower()


def test_live_window_heuristic_leaves_small_window_benign():
    count = 10
    df = pd.DataFrame(
        {
            "Destination IP": ["192.168.121.150"] * count,
            "Destination Port": [5000] * count,
            "Protocol Name": ["TCP"] * count,
            "SYN Flag Count": [1] * count,
        }
    )

    predictions, warnings = apply_live_window_heuristics(df, _benign_predictions(count), window_seconds=5)

    assert {item["prediction"] for item in predictions} == {"BENIGN"}
    assert warnings == []

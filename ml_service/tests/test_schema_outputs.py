import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from prediction_output import build_prediction_batch
from schemas import validate_prediction_batch


def test_prediction_batch_schema_is_valid():
    df = pd.DataFrame(
        [
            {
                "Source IP": "192.168.1.10",
                "Source Port": 51522,
                "Destination IP": "203.0.113.10",
                "Destination Port": 80,
                "Protocol": 6,
                "Flow Duration": 1000,
            }
        ]
    )
    predictions = [
        {
            "row_index": 0,
            "prediction": "DDoS",
            "confidence": 0.97,
            "probabilities": {"BENIGN": 0.03, "DDoS": 0.97},
            "top_features": ["Flow Packets/s"],
            "feature_values": {"Flow Packets/s": 1200},
        }
    ]
    payload = build_prediction_batch(
        df,
        predictions,
        {"name": "RandomForest_IDS", "version": "test", "supported_classes": ["BENIGN", "DDoS"]},
        "csv",
    )
    assert validate_prediction_batch(payload) == []
    assert payload["summary"]["malicious_count"] == 1
    assert payload["alerts"][0]["source"]["ip"] == "192.168.1.10"

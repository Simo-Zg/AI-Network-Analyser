import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from model_history import append_model_history, build_history_entry, load_model_history


def test_model_history_records_metrics_confusion_matrix_and_data_profile(tmp_path):
    metadata = {
        "modelName": "RandomForest_IDS",
        "modelVersion": "rf-test-1",
        "createdAt": "2026-05-17T12:00:00Z",
        "datasetName": "test",
        "datasetFiles": ["train.csv"],
        "supportedClasses": ["BENIGN", "DDoS"],
        "features": ["Flow Duration", "Flow Packets/s"],
        "trainingConfig": {"labelMode": "grouped", "algorithm": "RandomForestClassifier"},
        "dataProfile": {"rawRows": 10, "trainRows": 8, "testRows": 2},
        "metrics": {
            "accuracy": 0.9,
            "macroF1": 0.88,
            "weightedF1": 0.9,
            "confusionMatrixLabels": ["BENIGN", "DDoS"],
            "confusionMatrix": [[1, 0], [0, 1]],
        },
        "featureImportance": [{"feature": "Flow Packets/s", "importance": 0.7}],
    }

    entry = build_history_entry(metadata)
    assert entry["metrics"]["accuracy"] == 0.9
    assert entry["metrics"]["confusionMatrix"] == [[1, 0], [0, 1]]
    assert entry["dataProfile"]["trainRows"] == 8

    history_file = tmp_path / "model_history.json"
    history = append_model_history(history_file, metadata)
    assert len(history) == 1
    assert load_model_history(history_file)[0]["modelVersion"] == "rf-test-1"

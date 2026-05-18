import json
from pathlib import Path
from typing import Dict, List


def build_history_entry(metadata: Dict) -> Dict:
    metrics = metadata.get("metrics", {})
    training_config = metadata.get("trainingConfig", {})
    data_profile = metadata.get("dataProfile", {})
    feature_importance = metadata.get("featureImportance", [])

    return {
        "modelName": metadata.get("modelName"),
        "modelVersion": metadata.get("modelVersion"),
        "createdAt": metadata.get("createdAt"),
        "datasetName": metadata.get("datasetName"),
        "datasetFiles": metadata.get("datasetFiles", []),
        "supportedClasses": metadata.get("supportedClasses", []),
        "featureCount": len(metadata.get("features", [])),
        "features": metadata.get("features", []),
        "labelMode": training_config.get("labelMode"),
        "algorithm": training_config.get("algorithm"),
        "trainingConfig": training_config,
        "dataProfile": data_profile,
        "metrics": {
            "accuracy": metrics.get("accuracy"),
            "macroPrecision": metrics.get("macroPrecision"),
            "macroRecall": metrics.get("macroRecall"),
            "macroF1": metrics.get("macroF1"),
            "weightedF1": metrics.get("weightedF1"),
            "confusionMatrixLabels": metrics.get("confusionMatrixLabels", metadata.get("supportedClasses", [])),
            "confusionMatrix": metrics.get("confusionMatrix", []),
            "perClassMetrics": metrics.get("perClassMetrics", {}),
        },
        "topFeatureImportance": feature_importance[:15],
        "notes": metadata.get("notes", ""),
        "sklearnVersion": metadata.get("sklearnVersion"),
        "pythonVersion": metadata.get("pythonVersion"),
    }


def load_model_history(history_file: Path) -> List[Dict]:
    if not history_file.exists():
        return []
    with open(history_file, "r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict) and isinstance(payload.get("runs"), list):
        return payload["runs"]
    return []


def append_model_history(history_file: Path, metadata: Dict) -> List[Dict]:
    history_file.parent.mkdir(parents=True, exist_ok=True)
    history = load_model_history(history_file)
    entry = build_history_entry(metadata)
    history = [item for item in history if item.get("modelVersion") != entry.get("modelVersion")]
    history.append(entry)
    history.sort(key=lambda item: item.get("createdAt") or "")
    with open(history_file, "w", encoding="utf-8") as handle:
        json.dump(history, handle, indent=2)
    return history

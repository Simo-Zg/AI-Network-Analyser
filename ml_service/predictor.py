import json
from pathlib import Path
from typing import Dict, List

from windows_compat import patch_platform_machine

patch_platform_machine()

import joblib
import numpy as np
import pandas as pd

from config import LEGACY_FEATURES, LEGACY_MODEL_FILE, LEGACY_SCALER_FILE, METADATA_FILE, MODEL_FILE
from preprocessing import canonicalize_columns, clean_numeric_frame


class ModelUnavailableError(RuntimeError):
    pass


class IDSPredictor:
    def __init__(self, model_path: Path = MODEL_FILE):
        self.model_path = Path(model_path)
        self.legacy = False
        self.artifact = None
        self.pipeline = None
        self.model = None
        self.scaler = None
        self.features: List[str] = []
        self.classes: List[str] = []
        self.metadata: Dict = {}
        self.load()

    def load(self):
        if self.model_path.exists():
            self.artifact = joblib.load(self.model_path)
            self.pipeline = self.artifact["pipeline"]
            self.features = self.artifact["features"]
            self.classes = list(self.artifact["classes"])
            self.metadata = self.artifact.get("metadata", {})
            return

        if LEGACY_MODEL_FILE.exists() and LEGACY_SCALER_FILE.exists():
            self.legacy = True
            self.model = joblib.load(LEGACY_MODEL_FILE)
            self.scaler = joblib.load(LEGACY_SCALER_FILE)
            self.features = LEGACY_FEATURES
            self.classes = [str(item) for item in getattr(self.model, "classes_", ["BENIGN", "DDoS"])]
            self.metadata = {
                "modelName": "Legacy_Binary_RandomForest_IDS",
                "modelVersion": "legacy-binary",
                "supportedClasses": self.classes,
                "features": self.features,
                "legacy": True,
                "notes": "Legacy binary DDoS-vs-BENIGN model from the Flask prototype.",
            }
            return

        raise ModelUnavailableError(
            "No model artifact found. Train a model or keep the legacy backend/model.pkl and backend/scaler.pkl files available."
        )

    def info(self):
        if METADATA_FILE.exists() and not self.legacy:
            try:
                with open(METADATA_FILE, "r", encoding="utf-8") as handle:
                    self.metadata = json.load(handle)
            except Exception:
                pass
        return {
            "name": self.metadata.get("modelName", "RandomForest_IDS"),
            "version": self.metadata.get("modelVersion", "unknown"),
            "supported_classes": self.metadata.get("supportedClasses", self.classes),
            "features": self.features,
            "legacy": self.legacy,
        }

    def prepare(self, df: pd.DataFrame) -> pd.DataFrame:
        frame = canonicalize_columns(df)
        frame = clean_numeric_frame(frame, self.features)
        return frame[self.features]

    def _top_features(self, row: pd.Series, limit: int = 5) -> List[str]:
        importances = []
        if self.legacy and hasattr(self.model, "feature_importances_"):
            importances = list(zip(self.features, self.model.feature_importances_))
        else:
            feature_importance = self.metadata.get("featureImportance", [])
            importances = [(item["feature"], item.get("importance", 0)) for item in feature_importance]

        if not importances:
            return self.features[:limit]
        return [feature for feature, _importance in sorted(importances, key=lambda item: item[1], reverse=True)[:limit]]

    def predict_dataframe(self, df: pd.DataFrame) -> List[Dict]:
        if df.empty:
            return []

        features_df = self.prepare(df)
        if self.legacy:
            safe_values = features_df.replace([np.inf, -np.inf], np.nan).fillna(0)
            matrix = self.scaler.transform(safe_values)
            predictions = self.model.predict(matrix)
            probabilities = self.model.predict_proba(matrix)
        else:
            predictions = self.pipeline.predict(features_df)
            probabilities = self.pipeline.predict_proba(features_df)

        rows = []
        classes = [str(item) for item in self.classes]
        for idx, prediction in enumerate(predictions):
            proba = probabilities[idx] if len(probabilities) > idx else []
            probability_map = {
                classes[class_index]: float(value)
                for class_index, value in enumerate(proba)
                if class_index < len(classes)
            }
            row = features_df.iloc[idx]
            top_features = self._top_features(row)
            rows.append(
                {
                    "row_index": int(idx),
                    "prediction": str(prediction),
                    "confidence": float(np.max(proba)) if len(proba) else 0.0,
                    "probabilities": probability_map,
                    "top_features": top_features,
                    "feature_values": {
                        feature: (None if pd.isna(row.get(feature)) else float(row.get(feature)))
                        for feature in self.features
                    },
                }
            )
        return rows

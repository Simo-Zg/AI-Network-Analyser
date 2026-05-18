import sys
from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from predictor import IDSPredictor
from preprocessing import InfToNanTransformer


def test_predictor_returns_expected_json_shape(tmp_path):
    features = ["Flow Duration", "Total Fwd Packets", "Flow Packets/s"]
    X = pd.DataFrame(
        [
            [1000, 2, 4],
            [1200, 3, 5],
            [100000, 200, 900],
            [90000, 180, 850],
        ],
        columns=features,
    )
    y = ["BENIGN", "BENIGN", "DDoS", "DDoS"]
    pipeline = Pipeline(
        [
            ("inf_to_nan", InfToNanTransformer()),
            ("imputer", SimpleImputer(strategy="median")),
            ("classifier", RandomForestClassifier(n_estimators=10, random_state=42)),
        ]
    )
    pipeline.fit(X, y)
    model_path = tmp_path / "model.joblib"
    joblib.dump(
        {
            "pipeline": pipeline,
            "features": features,
            "classes": ["BENIGN", "DDoS"],
            "metadata": {
                "modelName": "RandomForest_IDS",
                "modelVersion": "test",
                "supportedClasses": ["BENIGN", "DDoS"],
                "featureImportance": [{"feature": "Flow Packets/s", "importance": 1.0}],
            },
        },
        model_path,
    )

    predictor = IDSPredictor(model_path)
    predictions = predictor.predict_dataframe(X.head(1))
    assert predictions[0]["prediction"] in {"BENIGN", "DDoS"}
    assert "confidence" in predictions[0]
    assert "probabilities" in predictions[0]
    assert "feature_values" in predictions[0]

import json
import sys
from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from preprocessing import InfToNanTransformer
from export_tree_text import export_tree_text
from render_tree_graph import render_tree_graph


def test_tree_graph_renderer_creates_png_from_saved_random_forest(tmp_path):
    model_file, metadata_file = write_tiny_forest(tmp_path)
    output_file = tmp_path / "tree_graph.png"

    result = render_tree_graph(model_file, metadata_file, output_file, max_depth=2)

    assert result["status"] == "completed"
    assert result["nEstimators"] == 2
    assert output_file.exists()
    assert output_file.stat().st_size > 0


def test_tree_text_exporter_writes_complete_tree_text(tmp_path):
    model_file, metadata_file = write_tiny_forest(tmp_path)
    output_file = tmp_path / "tree.txt"

    result = export_tree_text(model_file, metadata_file, output_file)

    assert result["status"] == "completed"
    assert "Depth:" in output_file.read_text(encoding="utf-8")


def write_tiny_forest(tmp_path):
    features = ["Flow Duration", "Total Fwd Packets", "Flow Packets/s"]
    x = pd.DataFrame(
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
            ("classifier", RandomForestClassifier(n_estimators=2, random_state=42)),
        ]
    )
    pipeline.fit(x, y)

    model_file = tmp_path / "model.joblib"
    metadata_file = tmp_path / "model_metadata.json"
    output_file = tmp_path / "tree_graph.png"
    joblib.dump({"pipeline": pipeline, "features": features, "classes": ["BENIGN", "DDoS"]}, model_file)
    metadata_file.write_text(json.dumps({"features": features, "supportedClasses": ["BENIGN", "DDoS"]}))
    return model_file, metadata_file

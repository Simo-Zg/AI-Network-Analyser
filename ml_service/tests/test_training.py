import sys
from pathlib import Path

import pytest
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from train_multiclass import train


def test_training_fails_clearly_when_dataset_missing(tmp_path):
    with pytest.raises(FileNotFoundError, match="No dataset CSV files found"):
        train(tmp_path, "grouped", tmp_path / "models")


def write_training_csv(data_dir):
    data_dir.mkdir(parents=True)
    rows = []
    for index in range(30):
        label = "BENIGN" if index < 15 else "DDoS"
        rows.append(
            {
                "Flow Duration": 1000 + index,
                "Total Fwd Packets": 2 + index,
                "Flow Packets/s": 10 + index,
                "Packet Length Mean": 60 + index,
                "Label": label,
                "Unused Payloadish Column": "ignored",
            }
        )
    pd.DataFrame(rows).to_csv(data_dir / "sample.csv", index=False)


def test_training_full_loader_records_loading_mode(tmp_path):
    data_dir = tmp_path / "data" / "nested"
    write_training_csv(data_dir)

    result = train(
        tmp_path / "data",
        "grouped",
        tmp_path / "models",
        loading_mode="full",
        n_estimators=5,
        random_state=42,
    )

    profile = result["metadata"]["dataProfile"]
    assert result["status"] == "completed"
    assert profile["loadingMode"] == "full"
    assert profile["rowsScanned"] == 30
    assert profile["rowsSampled"] == 30


def test_training_streams_chunks_and_records_sampling_profile(tmp_path):
    data_dir = tmp_path / "data" / "nested"
    write_training_csv(data_dir)

    result = train(
        tmp_path / "data",
        "grouped",
        tmp_path / "models",
        loading_mode="chunked",
        chunksize=7,
        max_rows_per_class=6,
        max_total_rows=10,
        max_rows_per_file=0,
        n_estimators=5,
        random_state=42,
    )

    assert result["status"] == "completed"
    profile = result["metadata"]["dataProfile"]
    assert profile["loadingMode"] == "chunked"
    assert profile["rowsScanned"] == 30
    assert profile["rowsSampled"] == 10
    assert profile["maxRowsPerClass"] == 6
    assert result["metadata"]["metrics"]["confusionMatrixLabels"] == ["BENIGN", "DDoS"]
    assert (tmp_path / "models" / "model_history.json").exists()

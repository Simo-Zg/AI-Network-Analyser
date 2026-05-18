import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from preprocessing import clean_numeric_frame, normalize_label


def test_preprocessing_handles_nan_inf_and_large_values():
    df = pd.DataFrame(
        {
            "Flow Duration": [1, np.inf, -np.inf, 10**20],
            "Total Fwd Packets": ["10", "bad", None, "4"],
        }
    )
    cleaned = clean_numeric_frame(df, ["Flow Duration", "Total Fwd Packets"])
    assert cleaned["Flow Duration"].isna().sum() == 2
    assert cleaned["Flow Duration"].max() <= 1e12
    assert cleaned["Total Fwd Packets"].isna().sum() == 2


def test_label_normalization_fine_and_grouped():
    assert normalize_label(" DDoS ", "fine") == "DDoS"
    assert normalize_label("DoS Hulk", "grouped") == "DoS"
    assert normalize_label("FTP-Patator", "grouped") == "BruteForce"
    assert normalize_label("Web Attack - XSS", "grouped") == "WebAttack"

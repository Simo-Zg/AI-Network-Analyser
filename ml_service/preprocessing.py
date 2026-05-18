import re
from typing import Iterable, List, Tuple

from windows_compat import patch_platform_machine

patch_platform_machine()

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin

from config import FEATURE_ALIASES, SUPPORTED_FEATURES


class InfToNanTransformer(BaseEstimator, TransformerMixin):
    def fit(self, X, y=None):
        return self

    def transform(self, X):
        frame = pd.DataFrame(X).replace([np.inf, -np.inf], np.nan)
        return frame


def strip_column_names(df: pd.DataFrame) -> pd.DataFrame:
    result = df.copy()
    result.columns = [str(col).strip() for col in result.columns]
    return result


def canonicalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    result = strip_column_names(df)
    lookup = {str(col).strip().lower(): col for col in result.columns}
    rename_map = {}

    for canonical, aliases in FEATURE_ALIASES.items():
        if canonical in result.columns:
            continue
        for alias in aliases:
            existing = lookup.get(alias.strip().lower())
            if existing:
                rename_map[existing] = canonical
                break

    if rename_map:
        result = result.rename(columns=rename_map)
    return result


def find_label_column(df: pd.DataFrame) -> str:
    for column in df.columns:
        normalized = str(column).strip().lower()
        if normalized == "label" or normalized.endswith(" label"):
            return column
    raise ValueError('Label column not found. Expected a column named "Label" or equivalent.')


def normalize_label(label: object, label_mode: str = "fine") -> str:
    raw = re.sub(r"\s+", " ", str(label).replace("\ufeff", "").strip())
    lower = raw.lower()

    fine_map = {
        "benign": "BENIGN",
        "ddos": "DDoS",
        "dos hulk": "DoS Hulk",
        "dos goldeneye": "DoS GoldenEye",
        "dos slowloris": "DoS slowloris",
        "dos slowhttptest": "DoS Slowhttptest",
        "portscan": "PortScan",
        "bot": "Bot",
        "ftp-patator": "FTP-Patator",
        "ssh-patator": "SSH-Patator",
        "web attack - brute force": "Web Attack - Brute Force",
        "web attack - xss": "Web Attack - XSS",
        "web attack - sql injection": "Web Attack - Sql Injection",
        "infiltration": "Infiltration",
        "heartbleed": "Heartbleed",
    }

    fine = fine_map.get(lower, raw if raw else "Other")
    if label_mode == "fine":
        return fine

    if fine == "BENIGN":
        return "BENIGN"
    if fine == "DDoS":
        return "DDoS"
    if fine.startswith("DoS "):
        return "DoS"
    if fine == "PortScan":
        return "PortScan"
    if fine == "Bot":
        return "Botnet"
    if "Patator" in fine:
        return "BruteForce"
    if fine.startswith("Web Attack"):
        return "WebAttack"
    if fine == "Infiltration":
        return "Infiltration"
    if fine == "Heartbleed":
        return "Heartbleed"
    return "Other"


def clean_numeric_frame(df: pd.DataFrame, features: Iterable[str]) -> pd.DataFrame:
    result = df.copy()
    for feature in features:
        if feature not in result.columns:
            result[feature] = np.nan
        result[feature] = pd.to_numeric(result[feature], errors="coerce")

    result = result.replace([np.inf, -np.inf], np.nan)
    result[list(features)] = result[list(features)].clip(lower=-1e12, upper=1e12)
    return result


def select_available_features(df: pd.DataFrame) -> Tuple[List[str], List[str]]:
    available = [feature for feature in SUPPORTED_FEATURES if feature in df.columns]
    missing = [feature for feature in SUPPORTED_FEATURES if feature not in df.columns]
    return available, missing


def drop_constant_features(df: pd.DataFrame, features: Iterable[str]) -> Tuple[List[str], List[str]]:
    kept = []
    dropped = []
    for feature in features:
        nunique = df[feature].nunique(dropna=True)
        if nunique <= 1:
            dropped.append(feature)
        else:
            kept.append(feature)
    return kept, dropped

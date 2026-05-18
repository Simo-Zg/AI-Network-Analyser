from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
MODELS_DIR = BASE_DIR / "models"
RAW_DATA_DIR = BASE_DIR / "data" / "raw"

MODEL_NAME = "RandomForest_IDS"
MODEL_FILE = MODELS_DIR / "random_forest_multiclass.joblib"
METADATA_FILE = MODELS_DIR / "model_metadata.json"
HISTORY_FILE = MODELS_DIR / "model_history.json"

LEGACY_MODEL_FILE = BASE_DIR.parent / "backend" / "model.pkl"
LEGACY_SCALER_FILE = BASE_DIR.parent / "backend" / "scaler.pkl"

LEGACY_FEATURES = [
    "Flow Duration",
    "Total Fwd Packets",
    "Flow IAT Mean",
    "Flow IAT Std",
    "Packet Length Mean",
    "Packet Length Std",
    "Flow Bytes/s",
    "Flow Packets/s",
]

SUPPORTED_FEATURES = [
    "Flow Duration",
    "Total Fwd Packets",
    "Total Backward Packets",
    "Total Length of Fwd Packets",
    "Total Length of Bwd Packets",
    "Flow Bytes/s",
    "Flow Packets/s",
    "Flow IAT Mean",
    "Flow IAT Std",
    "Flow IAT Max",
    "Flow IAT Min",
    "Fwd Packet Length Mean",
    "Bwd Packet Length Mean",
    "Packet Length Mean",
    "Packet Length Std",
    "SYN Flag Count",
    "ACK Flag Count",
    "Destination Port",
    "Protocol",
]

FEATURE_ALIASES = {
    "Total Fwd Packets": ["Tot Fwd Pkts", "Total Fwd Packet"],
    "Total Backward Packets": ["Total Bwd Packets", "Tot Bwd Pkts"],
    "Total Length of Fwd Packets": ["Total Length of Fwd Packet", "TotLen Fwd Pkts"],
    "Total Length of Bwd Packets": ["Total Length of Bwd Packet", "TotLen Bwd Pkts"],
    "Flow Bytes/s": ["Flow Bytes/s", "Flow Byts/s"],
    "Flow Packets/s": ["Flow Packets/s", "Flow Pkts/s"],
    "Fwd Packet Length Mean": ["Fwd Packet Length Mean", "Fwd Pkt Len Mean"],
    "Bwd Packet Length Mean": ["Bwd Packet Length Mean", "Bwd Pkt Len Mean"],
    "Packet Length Mean": ["Packet Length Mean", "Pkt Len Mean"],
    "Packet Length Std": ["Packet Length Std", "Pkt Len Std"],
    "SYN Flag Count": ["SYN Flag Count", "SYN Flag Cnt"],
    "ACK Flag Count": ["ACK Flag Count", "ACK Flag Cnt"],
    "Destination Port": ["Destination Port", "Dst Port"],
}

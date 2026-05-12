from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
import joblib
import os

app = Flask(__name__)
CORS(app)

# =========================
# LOAD MODEL
# =========================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

model = joblib.load(os.path.join(BASE_DIR, "model.pkl"))
scaler = joblib.load(os.path.join(BASE_DIR, "scaler.pkl"))

FEATURES = [
    "Flow Duration",
    "Total Fwd Packets",
    "Flow IAT Mean",
    "Flow IAT Std",
    "Packet Length Mean",
    "Packet Length Std",
    "Flow Bytes/s",
    "Flow Packets/s"
]

print("Scaler expects:", scaler.n_features_in_)

# =========================
@app.route("/")
def home():
    return "AI Network Analyzer API running"

# =========================
def explain(pred):
    if pred == "BENIGN":
        return "Normal traffic behavior detected"
    return "DDoS attack behavior detected"

def suggest(pred):
    if pred == "BENIGN":
        return "No action needed"
    return "Block suspicious IP and apply rate limiting"

# =========================
# SINGLE PREDICTION
# =========================
@app.route("/predict", methods=["POST"])
def predict():

    data = request.json

    df = pd.DataFrame([[
        data["flow_duration"],
        data["packet_count"],
        data["iat_mean"],
        data["iat_std"],
        data["packet_length_mean"],
        data["packet_length_std"],
        data["flow_bytes"],
        data["flow_packets"]
    ]], columns=FEATURES)

    X = scaler.transform(df)

    pred = model.predict(X)[0]
    proba = model.predict_proba(X)[0]

    return jsonify({
        "prediction": str(pred),
        "confidence": round(float(max(proba)), 3),
        "probabilities": proba.tolist(),
        "explanation": explain(pred),
        "suggestion": suggest(pred)
    })

# =========================
# CSV PREDICTION
# =========================
@app.route("/predict_csv", methods=["POST"])
def predict_csv():

    file = request.files["file"]

    df = pd.read_csv(file)
    df.columns = df.columns.str.strip()

    df = df.replace([float("inf"), -float("inf")], 0)
    df = df.dropna()

    X = scaler.transform(df[FEATURES])

    preds = model.predict(X)

    df["prediction"] = preds

    summary = df["prediction"].value_counts().to_dict()

    return jsonify({
        "total_flows": len(df),
        "summary": summary
    })

# =========================
# REAL DATASET TEST
# =========================
@app.route("/test_real")
def test_real():

    df = pd.read_csv("data.csv")
    df.columns = df.columns.str.strip()

    row = df[df["Label"].str.contains("DDoS")].iloc[0]

    X = scaler.transform(pd.DataFrame([row[FEATURES]]))

    pred = model.predict(X)[0]

    return jsonify({
        "real_row_prediction": str(pred)
    })

# =========================
if __name__ == "__main__":
    app.run(debug=True)
from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib
import numpy as np
import pandas as pd

app = Flask(__name__)
CORS(app)

model = joblib.load("model.pkl")
scaler = joblib.load("scaler.pkl")

# =========================
# HOME
# =========================
@app.route("/")
def home():
    return "API running"

# =========================
# EXPLANATION
# =========================
def explain_attack(pred):
    return {
        "BENIGN": "Normal traffic",
        "DoS": "Flooding attack",
        "DDoS": "Distributed flooding",
        "PortScan": "Scanning ports",
        "Bot": "Botnet behavior"
    }.get(pred, "Unknown")

# =========================
# SUGGESTION
# =========================
def get_suggestion(pred):
    if pred == "BENIGN":
        return "No action needed"
    elif pred in ["DoS", "DDoS"]:
        return "Block IP / rate limit"
    elif pred == "PortScan":
        return "Enable IDS / block scanner"
    elif pred == "Bot":
        return "Isolate machine"
    return "Monitor"

# =========================
# SINGLE PREDICTION
# =========================
@app.route("/predict", methods=["POST"])
def predict():
    try:
        data = request.json

        features = np.array([[
            float(data["flow_duration"]),
            float(data["packet_count"]),
            float(data["iat_mean"]),
            float(data["iat_std"])
        ]])

        features = scaler.transform(features)

        pred = model.predict(features)[0]
        conf = float(max(model.predict_proba(features)[0]))

        return jsonify({
            "prediction": str(pred),
            "confidence": round(conf, 3),
            "explanation": explain_attack(pred),
            "suggestion": get_suggestion(pred)
        })

    except Exception as e:
        return jsonify({"error": str(e)})

# =========================
# CSV ANALYSIS
# =========================
@app.route("/predict_csv", methods=["POST"])
def predict_csv():
    try:
        file = request.files["file"]
        df = pd.read_csv(file)

        df.columns = df.columns.str.strip()

        df = df.rename(columns={
            "Flow Duration": "flow_duration",
            "Total Fwd Packets": "packet_count",
            "Flow IAT Mean": "iat_mean",
            "Flow IAT Std": "iat_std"
        })

        df = df[["flow_duration","packet_count","iat_mean","iat_std"]]
        df = df.fillna(0)

        X = scaler.transform(df)
        preds = model.predict(X)

        df["prediction"] = preds

        summary = df["prediction"].value_counts().to_dict()

        return jsonify({
            "total_flows": len(df),
            "summary": summary
        })

    except Exception as e:
        return jsonify({"error": str(e)})

# =========================
# RUN
# =========================
if __name__ == "__main__":
    app.run(debug=True)
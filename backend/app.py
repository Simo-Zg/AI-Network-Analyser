"""Legacy Flask compatibility notice.

The project has been reworked into an Electron + Node.js + Python ML service.
Run the local API with:

    npm run server

or the full desktop app with:

    npm run dev

The legacy binary model artifacts in this directory are still used as a
clearly marked fallback by ml_service/predictor.py when no multiclass model has
been trained yet.
"""

from flask import Flask, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)


@app.route("/")
def home():
    return jsonify(
        {
            "status": "legacy_flask_backend_obsolete",
            "message": "Use the Node.js API on http://localhost:3000.",
            "replacement": "npm run dev",
        }
    )


@app.route("/predict", methods=["POST"])
@app.route("/predict_csv", methods=["POST"])
def obsolete_prediction_route():
    return (
        jsonify(
            {
                "error": "Legacy Flask prediction routes are obsolete.",
                "replacement": "Use /api/analyze/csv or /api/analyze/pcap on the Node.js API.",
            }
        ),
        410,
    )


if __name__ == "__main__":
    app.run(debug=True)

# AI Network Analyzer

AI Network Analyzer is a local desktop-style cybersecurity engineering project. It combines an Electron renderer, a Node.js/Express API, MongoDB storage, and a Python Random Forest IDS service for flow-based network analysis.

The ML pipeline is flow-based:

```text
packets or PCAP -> flow reconstruction -> feature extraction -> preprocessing
-> Random Forest prediction -> alert/event generation -> UI + MongoDB + optional AI explanation
```

## Architecture

```text
Electron Desktop App
|
+-- Renderer UI: HTML, CSS, vanilla JavaScript SOC dashboard
+-- Node.js / Express API
|   +-- REST API
|   +-- Server-Sent Events for capture updates
|   +-- MongoDB/Mongoose models
|   +-- OpenRouter AI explanations
|   +-- SIEM JSON/JSONL export
|   +-- Python ML service controller
+-- Python ML Service
    +-- multiclass Random Forest training
    +-- CSV and PCAP analysis
    +-- live capture windows
    +-- flow feature extraction
    +-- structured JSON inference
```

## Features

- Multiclass-capable Random Forest training for CICIDS/CSE-CIC-IDS style CSVs.
- CSV flow-feature analysis with alert generation.
- PCAP/PCAPNG analysis by reconstructing packet headers into flows where Scapy can read the file.
- Near-real-time live capture using capture windows, not packet-by-packet classification.
- MongoDB storage for alerts, prediction batches, capture sessions, model metadata, AI explanations, and settings.
- Modern dark SOC/SIEM dashboard.
- Optional OpenRouter explanations from the backend only.
- Privacy modes: `strict`, `redacted`, and `lab`.
- SIEM-friendly JSON and JSONL export.
- Legacy binary model fallback when no new multiclass model has been trained.

## Current Model Limitations

The original repo included a binary `BENIGN` vs `DDoS` Random Forest model in `backend/`. That legacy artifact is still usable as a fallback, but it is clearly marked as binary and legacy in API/UI metadata.

The new training pipeline supports multiclass labels, but supported classes are exactly the classes present in your training dataset. Do not claim detection for classes absent from `ml_service/models/model_metadata.json`.

## Environment

Create `.env` from the template:

```bash
cp .env.example .env
```

PowerShell:

```powershell
Copy-Item .env.example .env
```

Important values:

```text
MONGODB_URI=mongodb://localhost:27017/ai_network_analyzer
OPENROUTER_API_KEY=
AI_PRIVACY_MODE=redacted
PYTHON_EXECUTABLE=python
PYTHON_ML_SERVICE_DIR=./ml_service
CAPTURE_INTERFACE=
CAPTURE_FILTER=
LIVE_DOS_FLOW_THRESHOLD=80
LIVE_DOS_FLOW_RATE_THRESHOLD=15
LIVE_DOS_SYN_THRESHOLD=80
LIVE_DOS_SYN_RATE_THRESHOLD=15
SIEM_EXPORT_DIR=./exports
```

## MongoDB with Docker

Start MongoDB:

```bash
npm run mongo:up
```

Stop MongoDB:

```bash
npm run mongo:down
```

The local Docker setup does not require authentication.

## Install Dependencies

Node/Electron:

```bash
npm install
```

Python:

```bash
npm run ml:install
```

or:

```bash
pip install -r ml_service/requirements.txt
```

## Dataset Instructions

Place CICIDS/CSE-CIC-IDS compatible CSV files in:

```text
ml_service/data/raw
```
Or download It with:

```bash
aws s3 cp --no-sign-request --region ca-central-1 \ 
"s3://cse-cic-ids2018/Processed Traffic Data for ML Algorithms/" \ 
"./ml_service/data/raw/cse_cic_ids2018_processed/" --recursive
```

```powershell
aws s3 cp --no-sign-request --region ca-central-1 ` 
"s3://cse-cic-ids2018/Processed Traffic Data for ML Algorithms/" ` 
".\ml_service\data\raw\cse_cic_ids2018_processed\" --recursive
```
The trainer handles whitespace in columns, `Label` variants, NaN/inf values, duplicate rows, non-numeric feature values, constant columns, and very large numeric values.

Label modes:

- `fine`: preserves labels such as `DoS Hulk`, `PortScan`, `Web Attack - XSS`
- `grouped`: maps to broader classes such as `BENIGN`, `DDoS`, `DoS`, `PortScan`, `Botnet`, `BruteForce`, `WebAttack`, `Infiltration`, `Heartbleed`, `Other`

## Train the Model

```bash
npm run ml:train
```

Direct command:

```bash
python ml_service/train_multiclass.py --data-dir ml_service/data/raw --label-mode grouped --output-dir ml_service/models
```

Training defaults are read from `.env` when present:

```text
ML_TRAIN_LOAD_MODE=full
ML_TRAIN_DATA_DIR=ml_service/data/raw/cse_cic_ids2018_processed
ML_TRAIN_OUTPUT_DIR=ml_service/models
```

`ML_TRAIN_LOAD_MODE=full` restores the original behavior and loads all CSV files into RAM before training. If that runs out of memory or hits parser issues, switch to bounded streaming:

```bash
python ml_service/train_multiclass.py \
  --data-dir ml_service/data/raw/cse_cic_ids2018_processed \
  --label-mode grouped \
  --output-dir ml_service/models \
  --loading-mode chunked \
  --chunksize 100000 \
  --max-rows-per-class 25000 \
  --max-total-rows 400000 \
  --max-rows-per-file 250000
```

For `.env`, set:

```text
ML_TRAIN_LOAD_MODE=chunked
```

Lower `ML_TRAIN_CHUNKSIZE`, `ML_TRAIN_MAX_ROWS_PER_CLASS`, `ML_TRAIN_MAX_TOTAL_ROWS`, or `ML_TRAIN_MAX_ROWS_PER_FILE` if your machine still runs out of memory. Set `ML_TRAIN_MAX_ROWS_PER_FILE=0` only when you want chunked mode to scan every row of every CSV and can afford the runtime. The selected loader and sample sizes are stored in `metadata.dataProfile`.

Outputs:

- `ml_service/models/random_forest_multiclass.joblib`
- `ml_service/models/model_metadata.json`
- `ml_service/models/model_history.json`

`model_history.json` is append-only per successful training run and records accuracy, macro/weighted F1, labeled confusion matrix, per-class metrics, class distribution, dataset row counts, selected features, and top feature importance. The Model Info page uses it for the accuracy history graph and confusion matrix display.

If no dataset is present, training fails clearly:

```text
No dataset CSV files found. Place CICIDS/CSE-CIC-IDS CSV files in ml_service/data/raw.
```

## Run the App

Backend plus Electron:

```bash
npm run dev
```

Backend only:

```bash
npm run server
```

Electron only:

```bash
npm start
```

Health:

```bash
curl http://localhost:3000/api/health
```

## Analyze CSV

Use the CSV Analysis screen or:

```bash
curl -F "file=@ml_service/data/samples/sample_flows.csv" http://localhost:3000/api/analyze/csv
```

## Analyze PCAP

Use the PCAP Analysis screen or:

```bash
curl -F "file=@sample.pcap" http://localhost:3000/api/analyze/pcap
```

PCAP analysis ignores payloads and estimates only header-derived flow features.

## Live Capture

Live capture starts a Python worker:

```bash
python ml_service/capture_worker.py --interface "Wi-Fi" --window-seconds 5
```

List the exact Scapy/Npcap interface names:

```bash
python ml_service/capture_worker.py --list-interfaces
```

For focused lab tests, add a BPF capture filter:

```bash
python ml_service/capture_worker.py --interface "Wi-Fi" --window-seconds 5 --filter "tcp port 5000"
```

Live capture also applies an aggregate DoS heuristic after Random Forest inference. This catches lab patterns where many short flows or SYN packets target the same service in one capture window, even when each individual flow is classified as `BENIGN` by the RF model. The alert is marked as `RandomForest_IDS + LiveWindowHeuristic` so it is clear that this is not a retrained model result. Defaults can be adjusted with:

```text
LIVE_DOS_FLOW_THRESHOLD=80
LIVE_DOS_FLOW_RATE_THRESHOLD=15
LIVE_DOS_SYN_THRESHOLD=80
LIVE_DOS_SYN_RATE_THRESHOLD=15
```

On Windows, live capture may require Npcap and administrator privileges. CSV and PCAP analysis work even if live capture is unavailable.

If a DoS test is generated from another host on the same LAN, the analyzer must run on the machine receiving the traffic or on a true monitor/SPAN position. A normal third Wi-Fi client usually cannot see another client's unicast traffic. If the server is local on `127.0.0.1`, use the Npcap Loopback Adapter. If the server listens on a LAN IP, select the adapter whose IP matches that LAN address.

## OpenRouter AI Explanations

OpenRouter is optional. Set these in `.env`:

```text
OPENROUTER_API_KEY=your_key_here
OPENROUTER_MODEL=anthropic/claude-3.5-sonnet
AI_EXPLANATION_ENABLED=true
AI_PRIVACY_MODE=redacted
```

The API key is never exposed to the renderer. If missing, the API returns:

```text
AI explanation unavailable: missing API key
```

Privacy modes:

- `strict`: no IPs or ports sent.
- `redacted`: IPs become aliases like `internal_host_1` and `external_ip_1`.
- `lab`: real IPs allowed only when explicitly configured.

Raw packets, payloads, cookies, headers, credentials, and PCAP content are never sent to OpenRouter.

## SIEM Export

Export one alert from the Alerts table, or filtered alerts:

```bash
curl -X POST http://localhost:3000/api/siem/export \
  -H "Content-Type: application/json" \
  -d '{"filters":{"severity":"High"}}'
```

Exports are written to `SIEM_EXPORT_DIR`, default `./exports`.

## Tests

Node:

```bash
npm test
```

Python:

```bash
npm run ml:test
```

No OpenRouter key or live packet capture is required for tests.

## Troubleshooting

- MongoDB offline: run `npm run mongo:up`.
- Model missing: place dataset CSVs in `ml_service/data/raw` and run `npm run ml:train`.
- Model history empty: train at least one multiclass model; legacy fallback models do not create history entries.
- App using legacy model: train a new multiclass model.
- CSV prediction fails: check the feature list in `model_metadata.json`.
- PCAP returns no flows: verify the file contains IP packets and Scapy can read it.
- Live capture returns empty windows: click Refresh Interfaces and select the adapter whose IP matches the target server. For a port-5000 lab, try capture filter `tcp port 5000`. Confirm the attack target IP matches the server IP shown on that adapter.
- Live capture fails: install Npcap on Windows and use elevated privileges.
- AI explanations unavailable: set `OPENROUTER_API_KEY` and restart the backend.

## Future Improvements

- Background training jobs with progress events.
- Richer CICFlowMeter-compatible PCAP extraction.
- Better interface discovery and automatic adapter recommendation.
- Model drift tracking and comparison.
- Webhook SIEM export.

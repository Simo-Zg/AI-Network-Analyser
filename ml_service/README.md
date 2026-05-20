# ML Service

This directory contains the Python flow-based IDS service used by the Electron/Node.js application.

## Dataset Format

Training expects one or more CICIDS/CSE-CIC-IDS compatible CSV files with a `Label` column and numeric flow features. Place CSV files in:

```text
ml_service/data/raw
```

Common CICIDS column spacing and aliases are normalized. Labels can be preserved in `fine` mode or grouped in `grouped` mode.

## Training

```bash
python train_multiclass.py --data-dir ./data/raw --label-mode grouped --output-dir ./models
```

The default loader can be controlled by `.env`:

```text
ML_TRAIN_LOAD_MODE=full
```

`full` loads all CSV files into RAM, matching the original trainer behavior. Large folders can instead be streamed with bounded sampling:

```bash
python train_multiclass.py --data-dir ./data/raw/cse_cic_ids2018_processed --label-mode grouped --output-dir ./models --loading-mode chunked --chunksize 100000 --max-rows-per-class 25000 --max-total-rows 400000 --max-rows-per-file 250000
```

Use smaller values for `--chunksize`, `--max-rows-per-class`, `--max-total-rows`, and `--max-rows-per-file` on memory-constrained machines. Use `--max-rows-per-file 0` for a full scan in chunked mode.

Outputs:

- `models/random_forest_multiclass.joblib`
- `models/model_metadata.json`
- `models/model_history.json`

The saved joblib artifact contains the sklearn preprocessing pipeline, Random Forest classifier, feature list, supported classes, and metadata.

`model_history.json` appends one compact training record for every successful run. Each record includes accuracy, macro/weighted F1, labeled confusion matrix, per-class metrics, class distribution, row counts, training configuration, and top feature importance for dashboard history graphs.

## Evaluation

```bash
python evaluate_model.py --model ./models/random_forest_multiclass.joblib --data ./data/raw/test.csv
```

## CSV Prediction

```bash
python predict_csv.py --input ./data/samples/sample_flows.csv
```

The script prints structured JSON with:

- batch id
- model metadata
- total, benign, malicious counts
- class distribution
- malicious alerts
- warnings

## PCAP Prediction

```bash
python predict_pcap.py --input ./sample.pcap --output ./results.json
```

PCAP extraction reconstructs flows from packet headers using source IP, destination IP, ports, and protocol. Payloads are ignored. Some features are estimated because full CICFlowMeter parity is outside the current scope.

## Live Capture

```bash
python capture_worker.py --interface "Wi-Fi" --window-seconds 5
```

Discover exact adapter names and IPs:

```bash
python capture_worker.py --list-interfaces
```

For focused lab tests:

```bash
python capture_worker.py --interface "Wi-Fi" --window-seconds 5 --filter "tcp port 5000"
```

Live capture applies an aggregate DoS heuristic after Random Forest prediction. It flags windows where many flows or SYN packets target the same destination service, which helps with `ab` and SYN-flood lab traffic that can look benign per individual flow. Heuristic alerts are marked as `RandomForest_IDS + LiveWindowHeuristic`.

The worker streams JSON lines:

```json
{"type":"capture_status","status":"started"}
{"type":"prediction_batch","summary":{},"alerts":[]}
{"type":"capture_status","status":"stopped"}
```

Live capture may require root/administrator privileges and Npcap on Windows. If traffic is generated from another machine, run capture on the target host or on a monitor/SPAN position. A normal Wi-Fi client usually cannot capture another client's unicast traffic. For localhost traffic, use the Npcap Loopback Adapter.

## Legacy Fallback

If `models/random_forest_multiclass.joblib` is missing, the predictor tries to load:

```text
../backend/model.pkl
../backend/scaler.pkl
```

That fallback is binary only (`BENIGN` vs `DDoS`) and is marked as legacy in API and UI metadata.

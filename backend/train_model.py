import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report
import joblib

# =========================
# LOAD DATASET
# =========================
df = pd.read_csv("data.csv")
df.columns = df.columns.str.strip()

print("Rows:", len(df))
print(df["Label"].value_counts())

# =========================
# BINARY LABELS
# =========================
df["Label"] = df["Label"].apply(
    lambda x: "DDoS" if "DDoS" in str(x) else "BENIGN"
)

# =========================
# FEATURES
# =========================
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

df = df[FEATURES + ["Label"]]

# =========================
# CLEAN
# =========================
df = df.replace([float("inf"), -float("inf")], 0)
df = df.dropna()

# =========================
# BALANCE DATA
# =========================
min_n = df["Label"].value_counts().min()

df = df.groupby("Label", group_keys=False).apply(
    lambda x: x.sample(min_n, random_state=42)
)

print("\nBalanced labels:")
print(df["Label"].value_counts())

# =========================
# SPLIT
# =========================
X = df[FEATURES]
y = df["Label"]

X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.2,
    random_state=42,
    stratify=y
)

# =========================
# SCALE
# =========================
scaler = StandardScaler()

X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)

# =========================
# MODEL
# =========================
model = RandomForestClassifier(
    n_estimators=300,
    max_depth=20,
    class_weight="balanced",
    random_state=42
)

model.fit(X_train_scaled, y_train)

# =========================
# EVALUATION
# =========================
preds = model.predict(X_test_scaled)

print("\nClassification Report:\n")
print(classification_report(y_test, preds))

# =========================
# SAVE
# =========================
joblib.dump(model, "model.pkl")
joblib.dump(scaler, "scaler.pkl")

print("\n✅ MODEL TRAINED AND SAVED")
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import RandomForestClassifier
import joblib

# =========================
# 1. LOAD DATASET
# =========================
df = pd.read_csv("data.csv")

# =========================
# 2. CLEAN COLUMN NAMES
# =========================
df.columns = df.columns.str.strip()   # remove spaces

print("Columns detected:")
for col in df.columns:
    print(f"[{col}]")

# =========================
# 3. SELECT + RENAME COLUMNS
# (SAFE mapping for CIC-IDS2017)
# =========================
column_mapping = {
    "Flow Duration": "flow_duration",
    "Total Fwd Packets": "packet_count",
    "Flow IAT Mean": "iat_mean",
    "Flow IAT Std": "iat_std",
    "Label": "label"
}

# Check missing columns
missing = [col for col in column_mapping if col not in df.columns]
if missing:
    print("\n❌ Missing columns:", missing)
    print("👉 Check your dataset column names above")
    exit()

# Rename
df = df.rename(columns=column_mapping)

# Keep only needed features
df = df[["flow_duration","packet_count","iat_mean","iat_std","label"]]

# =========================
# 4. CLEAN DATA
# =========================
df = df.replace([float('inf'), -float('inf')], 0)
df = df.dropna()

# =========================
# 5. SPLIT
# =========================
X = df.drop("label", axis=1)
y = df["label"]

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

# =========================
# 6. SCALE
# =========================
scaler = StandardScaler()
X_train = scaler.fit_transform(X_train)
X_test = scaler.transform(X_test)

# =========================
# 7. TRAIN MODEL
# =========================
model = RandomForestClassifier(n_estimators=100, random_state=42)
model.fit(X_train, y_train)

# =========================
# 8. SAVE
# =========================
joblib.dump(model, "model.pkl")
joblib.dump(scaler, "scaler.pkl")

print("\n✅ Model trained and saved successfully")
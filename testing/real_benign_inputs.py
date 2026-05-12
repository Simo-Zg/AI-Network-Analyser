import pandas as pd

df = pd.read_csv("data.csv")
df.columns = df.columns.str.strip()

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

row = df[df["Label"] == "BENIGN"].iloc[0]
print(row[FEATURES])
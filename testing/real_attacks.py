import pandas as pd

# load your CIC dataset
df = pd.read_csv("data.csv")

# clean spaces
df.columns = df.columns.str.strip()

# keep only DDoS rows
ddos = df[df["Label"].str.contains("DDoS")]

# features used by your model
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

# export 5 REAL DDoS rows
ddos[FEATURES].head(5).to_csv("real_ddos_test.csv", index=False)

print("real_ddos_test.csv created") 
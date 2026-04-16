import numpy as np

def format_features(data):
    return np.array([[ 
        data["flow_duration"],
        data["packet_count"],
        data["iat_mean"],
        data["iat_std"]
    ]])
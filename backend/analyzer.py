def analyze_behavior(data):
    reasons = []

    if data["packet_count"] > 1000:
        reasons.append("High packet rate → possible DDoS")

    if data["iat_std"] < 5:
        reasons.append("Low timing variation → automated attack")

    if data["flow_duration"] < 1000:
        reasons.append("Short bursts → scanning behavior")

    return reasons


def severity_score(attack):
    return {
        "Normal": 0,
        "Brute Force": 6,
        "DoS": 8,
        "DDoS": 10,
        "Botnet": 9
    }.get(attack, 5)


def mitigation(attack):
    return {
        "DDoS": [
            "Enable rate limiting",
            "Block attacker IP",
            "Use firewall filtering"
        ],
        "Brute Force": [
            "Enable MFA",
            "Limit login attempts",
            "Use CAPTCHA"
        ],
        "Botnet": [
            "Monitor outbound traffic",
            "Block suspicious connections",
            "Use IDS/IPS"
        ]
    }.get(attack, ["Monitor traffic"])
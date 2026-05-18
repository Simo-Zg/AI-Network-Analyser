"""Legacy module retained for compatibility.

Hard-coded attack explanations and mitigations were removed from the active
application. Use the Node.js OpenRouter-backed explanation route instead:

    POST /api/alerts/:id/explain
"""


def analyze_behavior(_data):
    return [
        "Legacy analyzer is obsolete. Use flow-based ML output plus optional OpenRouter explanations."
    ]


def severity_score(_attack):
    return 0


def mitigation(_attack):
    return [
        "Use the AI explanation route for contextual mitigations when OpenRouter is configured."
    ]

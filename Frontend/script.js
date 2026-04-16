async function analyze() {
    const data = {
        flow_duration: parseFloat(document.getElementById("flow_duration").value),
        packet_count: parseFloat(document.getElementById("packet_count").value),
        iat_mean: parseFloat(document.getElementById("iat_mean").value),
        iat_std: parseFloat(document.getElementById("iat_std").value)
    };

    const res = await fetch("http://127.0.0.1:5000/predict", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(data)
    });

    const result = await res.json();

    document.getElementById("result").innerHTML = `
        <h2>Attack: ${result.attack}</h2>
        <p>Confidence: ${(result.confidence * 100).toFixed(2)}%</p>
        <p>Severity: ${result.severity}/10</p>

        <h3>Behavior</h3>
        <ul>${result.behavior.map(r => `<li>${r}</li>`).join("")}</ul>

        <h3>Mitigation</h3>
        <ul>${result.mitigation.map(m => `<li>${m}</li>`).join("")}</ul>
    `;
}
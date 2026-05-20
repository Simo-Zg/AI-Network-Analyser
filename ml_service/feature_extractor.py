from pathlib import Path
from typing import Iterable, Tuple

from windows_compat import patch_platform_machine

patch_platform_machine()

import pandas as pd

from flow_builder import FlowBuilder, packet_to_flow_info


def extract_features_from_packets(packets: Iterable) -> Tuple[pd.DataFrame, list]:
    warnings = [
        "PCAP/live flow features are estimated from packet headers only; payloads are ignored.",
        "Features unavailable from raw packets are omitted or estimated as zero-compatible values.",
    ]
    builder = FlowBuilder()
    skipped = 0
    packet_count = 0
    for packet in packets:
        packet_count += 1
        info = packet_to_flow_info(packet)
        if info is None:
            skipped += 1
            continue
        builder.add_packet(info)

    records = builder.to_records()
    if packet_count == 0:
        warnings.append(
            "No packets were captured in this window. Check the selected interface, Npcap/admin privileges, and whether the traffic is on loopback."
        )
    elif not records:
        warnings.append(
            f"Captured {packet_count} packets, but none could be reconstructed into supported IP flows."
        )
    if skipped:
        warnings.append(f"Skipped {skipped} non-IP or unsupported packets.")
    return pd.DataFrame(records), warnings


def extract_features_from_pcap(path: Path) -> Tuple[pd.DataFrame, list]:
    try:
        from scapy.utils import PcapReader
    except Exception as error:
        return pd.DataFrame(), [f"Scapy is not installed or unavailable: {error}"]

    packets = []
    try:
        with PcapReader(str(path)) as reader:
            for packet in reader:
                packets.append(packet)
    except Exception as error:
        return pd.DataFrame(), [
            f"Unable to read PCAP/PCAPNG file: {error}",
            "Install Scapy and verify the file format. PCAPNG support may vary by local environment.",
        ]

    return extract_features_from_packets(packets)

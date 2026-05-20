import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from flow_builder import packet_to_flow_info


def test_packet_to_flow_info_decodes_generic_windows_packet():
    pytest.importorskip("scapy")
    from scapy.layers.inet import IP, TCP
    from scapy.layers.l2 import Ether

    raw = bytes(Ether() / IP(src="192.168.1.20", dst="192.168.1.10") / TCP(sport=42000, dport=5000, flags="S"))

    class GenericPacket:
        time = 123.0

        def __bytes__(self):
            return raw

        def __contains__(self, _layer):
            return False

        def __len__(self):
            return len(raw)

    info = packet_to_flow_info(GenericPacket())

    assert info["source_ip"] == "192.168.1.20"
    assert info["destination_ip"] == "192.168.1.10"
    assert info["destination_port"] == 5000
    assert info["protocol_name"] == "TCP"
    assert "S" in info["flags"]

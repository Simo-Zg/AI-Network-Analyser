from dataclasses import dataclass, field
from statistics import mean, pstdev
from typing import Dict, List, Optional, Tuple


def _safe_stdev(values: List[float]) -> float:
    return float(pstdev(values)) if len(values) > 1 else 0.0


def _safe_mean(values: List[float]) -> float:
    return float(mean(values)) if values else 0.0


@dataclass
class FlowStats:
    source_ip: str
    source_port: int
    destination_ip: str
    destination_port: int
    protocol_number: int
    protocol_name: str
    packet_lengths: List[int] = field(default_factory=list)
    fwd_lengths: List[int] = field(default_factory=list)
    bwd_lengths: List[int] = field(default_factory=list)
    timestamps: List[float] = field(default_factory=list)
    syn_count: int = 0
    ack_count: int = 0

    @property
    def flow_id(self) -> str:
        return (
            f"{self.source_ip}:{self.source_port}-"
            f"{self.destination_ip}:{self.destination_port}-{self.protocol_name}"
        )

    def add_packet(self, timestamp: float, length: int, direction: str, flags: str = ""):
        self.timestamps.append(float(timestamp))
        self.packet_lengths.append(int(length))
        if direction == "bwd":
            self.bwd_lengths.append(int(length))
        else:
            self.fwd_lengths.append(int(length))

        if "S" in flags:
            self.syn_count += 1
        if "A" in flags:
            self.ack_count += 1

    def to_features(self) -> Dict:
        ordered_times = sorted(self.timestamps)
        duration_seconds = max(ordered_times[-1] - ordered_times[0], 0.0) if len(ordered_times) > 1 else 0.0
        duration_microseconds = duration_seconds * 1_000_000
        iats = [
            (ordered_times[index] - ordered_times[index - 1]) * 1_000_000
            for index in range(1, len(ordered_times))
        ]
        total_bytes = sum(self.packet_lengths)
        packet_count = len(self.packet_lengths)

        return {
            "Flow ID": self.flow_id,
            "Source IP": self.source_ip,
            "Source Port": self.source_port,
            "Destination IP": self.destination_ip,
            "Destination Port": self.destination_port,
            "Protocol": self.protocol_number,
            "Protocol Name": self.protocol_name,
            "Flow Duration": duration_microseconds,
            "Total Fwd Packets": len(self.fwd_lengths),
            "Total Backward Packets": len(self.bwd_lengths),
            "Total Length of Fwd Packets": sum(self.fwd_lengths),
            "Total Length of Bwd Packets": sum(self.bwd_lengths),
            "Flow Bytes/s": total_bytes / duration_seconds if duration_seconds > 0 else 0.0,
            "Flow Packets/s": packet_count / duration_seconds if duration_seconds > 0 else 0.0,
            "Flow IAT Mean": _safe_mean(iats),
            "Flow IAT Std": _safe_stdev(iats),
            "Flow IAT Max": max(iats) if iats else 0.0,
            "Flow IAT Min": min(iats) if iats else 0.0,
            "Fwd Packet Length Mean": _safe_mean(self.fwd_lengths),
            "Bwd Packet Length Mean": _safe_mean(self.bwd_lengths),
            "Packet Length Mean": _safe_mean(self.packet_lengths),
            "Packet Length Std": _safe_stdev(self.packet_lengths),
            "SYN Flag Count": self.syn_count,
            "ACK Flag Count": self.ack_count,
            "Packet Count": packet_count,
            "Byte Count": total_bytes,
            "Duration Ms": duration_seconds * 1000,
        }


class FlowBuilder:
    def __init__(self):
        self.flows: Dict[Tuple, FlowStats] = {}

    def add_packet(self, packet_info: Dict):
        key = (
            packet_info["source_ip"],
            packet_info.get("source_port", 0),
            packet_info["destination_ip"],
            packet_info.get("destination_port", 0),
            packet_info["protocol_number"],
        )
        reverse_key = (
            packet_info["destination_ip"],
            packet_info.get("destination_port", 0),
            packet_info["source_ip"],
            packet_info.get("source_port", 0),
            packet_info["protocol_number"],
        )

        if key in self.flows:
            flow = self.flows[key]
            direction = "fwd"
        elif reverse_key in self.flows:
            flow = self.flows[reverse_key]
            direction = "bwd"
        else:
            flow = FlowStats(
                source_ip=packet_info["source_ip"],
                source_port=packet_info.get("source_port", 0),
                destination_ip=packet_info["destination_ip"],
                destination_port=packet_info.get("destination_port", 0),
                protocol_number=packet_info["protocol_number"],
                protocol_name=packet_info["protocol_name"],
            )
            self.flows[key] = flow
            direction = "fwd"

        flow.add_packet(
            timestamp=packet_info["timestamp"],
            length=packet_info["length"],
            direction=direction,
            flags=packet_info.get("flags", ""),
        )

    def to_records(self) -> List[Dict]:
        return [flow.to_features() for flow in self.flows.values()]


def packet_to_flow_info(packet) -> Optional[Dict]:
    try:
        from scapy.layers.inet import IP, TCP, UDP, ICMP
        from scapy.layers.inet6 import IPv6
    except Exception:
        return None

    ip_layer = None
    if IP in packet:
        ip_layer = packet[IP]
    elif IPv6 in packet:
        ip_layer = packet[IPv6]
    if ip_layer is None:
        return None

    protocol_number = int(getattr(ip_layer, "proto", getattr(ip_layer, "nh", 0)))
    protocol_name = {6: "TCP", 17: "UDP", 1: "ICMP"}.get(protocol_number, str(protocol_number))
    source_port = 0
    destination_port = 0
    flags = ""
    if TCP in packet:
        tcp = packet[TCP]
        source_port = int(tcp.sport)
        destination_port = int(tcp.dport)
        flags = str(tcp.flags)
        protocol_number = 6
        protocol_name = "TCP"
    elif UDP in packet:
        udp = packet[UDP]
        source_port = int(udp.sport)
        destination_port = int(udp.dport)
        protocol_number = 17
        protocol_name = "UDP"
    elif ICMP in packet:
        protocol_number = 1
        protocol_name = "ICMP"

    return {
        "source_ip": str(ip_layer.src),
        "destination_ip": str(ip_layer.dst),
        "source_port": source_port,
        "destination_port": destination_port,
        "protocol_number": protocol_number,
        "protocol_name": protocol_name,
        "timestamp": float(getattr(packet, "time", 0.0)),
        "length": len(packet),
        "flags": flags,
    }

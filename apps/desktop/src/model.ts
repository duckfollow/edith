export type Direction = "inbound" | "outbound" | "local" | "unknown";
export interface Packet {
  id: number;
  sessionId: string;
  timestamp: string;
  interfaceId: string;
  sourceAddress: string;
  destinationAddress: string;
  sourcePort: number | null;
  destinationPort: number | null;
  protocol: "TCP" | "UDP" | "DNS" | "TLS" | "ICMP";
  direction: Direction;
  wireLength: number;
  capturedLength: number;
  summary: string;
}
export interface Filters {
  query: string;
  protocol: string;
  direction: string;
}
export const BUFFER_LIMIT = 1500;
export function matches(packet: Packet, filters: Filters): boolean {
  const query = filters.query.trim().toLowerCase();
  return (
    (filters.protocol === "all" || packet.protocol === filters.protocol) &&
    (filters.direction === "all" || packet.direction === filters.direction) &&
    (!query ||
      [
        packet.sourceAddress,
        packet.destinationAddress,
        packet.sourcePort,
        packet.destinationPort,
        packet.protocol,
        packet.summary,
        packet.direction,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query))
  );
}
export function appendBounded(
  previous: Packet[],
  incoming: Packet[],
  limit = BUFFER_LIMIT,
) {
  if (!Number.isInteger(limit) || limit < 1)
    throw new Error("Buffer limit must be positive");
  const combined = [...previous, ...incoming];
  const evicted = Math.max(0, combined.length - limit);
  return { packets: combined.slice(evicted), evicted };
}
export function bytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
const examples: Array<
  Pick<
    Packet,
    | "sourceAddress"
    | "destinationAddress"
    | "sourcePort"
    | "destinationPort"
    | "protocol"
    | "direction"
    | "summary"
    | "wireLength"
  >
> = [
  {
    sourceAddress: "192.168.1.24",
    destinationAddress: "1.1.1.1",
    sourcePort: 54312,
    destinationPort: 53,
    protocol: "DNS",
    direction: "outbound",
    summary: "Standard query A example.com",
    wireLength: 71,
  },
  {
    sourceAddress: "1.1.1.1",
    destinationAddress: "192.168.1.24",
    sourcePort: 53,
    destinationPort: 54312,
    protocol: "DNS",
    direction: "inbound",
    summary: "Standard query response A 93.184.215.14",
    wireLength: 113,
  },
  {
    sourceAddress: "192.168.1.24",
    destinationAddress: "93.184.215.14",
    sourcePort: 58210,
    destinationPort: 443,
    protocol: "TCP",
    direction: "outbound",
    summary: "SYN · connection requested",
    wireLength: 74,
  },
  {
    sourceAddress: "93.184.215.14",
    destinationAddress: "192.168.1.24",
    sourcePort: 443,
    destinationPort: 58210,
    protocol: "TCP",
    direction: "inbound",
    summary: "SYN, ACK · connection accepted",
    wireLength: 74,
  },
  {
    sourceAddress: "192.168.1.24",
    destinationAddress: "93.184.215.14",
    sourcePort: 58210,
    destinationPort: 443,
    protocol: "TLS",
    direction: "outbound",
    summary: "Client Hello · encrypted connection setup",
    wireLength: 517,
  },
  {
    sourceAddress: "93.184.215.14",
    destinationAddress: "192.168.1.24",
    sourcePort: 443,
    destinationPort: 58210,
    protocol: "TLS",
    direction: "inbound",
    summary: "Application data · encrypted payload",
    wireLength: 1440,
  },
  {
    sourceAddress: "192.168.1.24",
    destinationAddress: "192.168.1.1",
    sourcePort: null,
    destinationPort: null,
    protocol: "ICMP",
    direction: "outbound",
    summary: "Echo request",
    wireLength: 98,
  },
  {
    sourceAddress: "192.168.1.1",
    destinationAddress: "192.168.1.24",
    sourcePort: null,
    destinationPort: null,
    protocol: "ICMP",
    direction: "inbound",
    summary: "Echo reply",
    wireLength: 98,
  },
  {
    sourceAddress: "fe80::a24",
    destinationAddress: "ff02::fb",
    sourcePort: 5353,
    destinationPort: 5353,
    protocol: "UDP",
    direction: "outbound",
    summary: "Multicast datagram",
    wireLength: 246,
  },
  {
    sourceAddress: "127.0.0.1",
    destinationAddress: "127.0.0.1",
    sourcePort: 3000,
    destinationPort: 60122,
    protocol: "TCP",
    direction: "local",
    summary: "Loopback · local development server",
    wireLength: 312,
  },
];
export function samplePacket(id: number, sessionId: string): Packet {
  const row = examples[(id - 1) % examples.length];
  return {
    ...row,
    id,
    sessionId,
    timestamp: new Date().toISOString(),
    interfaceId: "sample0",
    capturedLength: row.wireLength,
  };
}

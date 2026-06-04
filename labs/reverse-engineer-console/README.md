# Reverse Engineering VM Console Access

Building custom console clients to understand the WebSocket protocol used by KubeVirt.

## Goal

Connect to a VM's serial console or VNC using raw WebSocket connections, bypassing virtctl to understand the protocol mechanics.

## Prerequisites

- Running VMI in your OpenShift/KubeVirt cluster
- kubectl access with console subresource permissions
- Python 3 or Go development environment
- Valid kubeconfig with authentication tokens

## Understanding the Protocol

### URL Construction

The console endpoint is a standard Kubernetes subresource accessed via WebSocket:

**Serial Console:**
```
wss://<api-server>/apis/subresources.kubevirt.io/v1/namespaces/<namespace>/virtualmachineinstances/<name>/console
```

**VNC:**
```
wss://<api-server>/apis/subresources.kubevirt.io/v1/namespaces/<namespace>/virtualmachineinstances/<name>/vnc?preserveSession=false
```

Protocol details (from staging/src/kubevirt.io/client-go/kubevirt/typed/core/v1/async.go):
- Scheme: `https://` becomes `wss://`, `http://` becomes `ws://`
- Subprotocol: `plain.kubevirt.io` (required in WebSocket handshake)
- Method: GET with WebSocket upgrade headers

### Authentication

Uses standard Kubernetes bearer token auth:
```
Authorization: Bearer <token-from-kubeconfig>
```

The client must also handle TLS with the cluster's CA certificate.

### WebSocket Subprotocol

KubeVirt uses a custom subprotocol defined in `subresources.PlainStreamProtocolName`:

```
Sec-WebSocket-Protocol: plain.kubevirt.io
```

This tells the server to use raw byte streaming instead of WebSocket message framing for the actual console traffic.

## Can We Use `nc`?

**Short answer: No, not directly.**

`nc` (netcat) doesn't speak WebSocket. The connection requires:
1. HTTP/1.1 upgrade request with specific headers
2. WebSocket handshake including the `plain.kubevirt.io` subprotocol
3. TLS/SSL with Kubernetes cluster CA validation
4. Bearer token authentication

However, you *could* use `websocat` (a WebSocket netcat) with manual header setup:

```bash
# Extract token and API server from kubeconfig
TOKEN=$(kubectl config view --raw -o jsonpath='{.users[0].user.token}')
SERVER=$(kubectl config view --raw -o jsonpath='{.clusters[0].cluster.server}')
NAMESPACE=default
VMI=my-vm

# This won't work without proper TLS handling and subprotocol
websocat -H "Authorization: Bearer $TOKEN" \
  "$SERVER/apis/subresources.kubevirt.io/v1/namespaces/$NAMESPACE/virtualmachineinstances/$VMI/console"
```

The TLS and subprotocol requirements make this impractical. Better to use a proper WebSocket library.

## Python Implementation

This lab includes a Python package with two console clients.

Key requirements:
- `websockets` library for WebSocket protocol
- `ssl` module for TLS with custom CA
- Bearer token from kubeconfig
- Asyncio for bidirectional streaming

### Installation and Usage

Using `uv`:
```bash
cd labs/reverse-engineer-console

# Serial console
uv run console-client <vmi-name> <namespace>

# VNC proxy
uv run vnc-proxy <vmi-name> <namespace> [host] [port]
```

Or install traditionally:
```bash
pip install -e .
console-client <vmi-name> <namespace>
vnc-proxy <vmi-name> <namespace>
```

### Serial Console Implementation

See `console_client.py`. The implementation:
1. Reads kubeconfig to extract API server, CA cert, and token
2. Constructs WebSocket URL with `wss://` scheme
3. Performs WebSocket upgrade with `plain.kubevirt.io` subprotocol
4. Spawns two async tasks: stdin → websocket, websocket → stdout
5. Handles raw bytes (no message framing after upgrade)
6. Sets terminal to raw mode for proper control character handling

### VNC Proxy Implementation

See `vnc_proxy.py`. VNC is more complex because the WebSocket carries raw VNC protocol frames.

The proxy approach:
1. Connects to the `/vnc` WebSocket endpoint
2. Listens on a local TCP socket (default: 127.0.0.1:5900)
3. Proxies traffic bidirectionally between TCP and WebSocket
4. Point a native VNC viewer (TigerVNC, etc.) at the local socket

Example:
```bash
# Terminal 1: Start the proxy
uv run vnc-proxy my-vm default

# Terminal 2: Connect with VNC viewer
remote-viewer vnc://127.0.0.1:5900
```

## What We Learn

1. **KubeVirt console is just Kubernetes subresources**: No special protocol, just standard K8s API with WebSocket upgrade
2. **Bearer token is sufficient**: No separate console authentication
3. **Subprotocol `plain.kubevirt.io` means raw streaming**: After the upgrade, it's just bytes, not WebSocket frames
4. **TLS is mandatory**: Self-signed certs won't work without proper CA validation
5. **RBAC gates access**: If you can GET the subresource, you can connect

## Limitations and Gotchas

**Subprotocol requirement:**
The server REQUIRES `Sec-WebSocket-Protocol: plain.kubevirt.io` in the upgrade request. Without it, the handshake fails.

**Raw byte mode:**
Once connected, the WebSocket connection operates in "raw" mode (see pkg/virt-api/rest/streamer.go:67-72). The client must use `conn.UnderlyingConn()` or equivalent to bypass WebSocket framing.

**Terminal handling for serial console:**
Serial console requires setting terminal to raw mode (`stty raw -echo` equivalent) to properly handle control characters. Without this, Ctrl+C and other sequences won't work correctly.

**VNC concurrency:**
By default, connecting to VNC drops any existing connection. Use `?preserveSession=true` to check first and fail if someone is already connected.

## Next Steps

- Implement a minimal VNC decoder to display frames (complex)
- Add reconnection logic for dropped connections
- Handle terminal resize signals (SIGWINCH) for serial console
- Explore the USB redirection endpoint (`/usbredir`) with the same technique

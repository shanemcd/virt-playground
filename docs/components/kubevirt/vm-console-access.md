# VM Console Access

How the serial and VNC console in the OpenShift UI reaches the QEMU process inside a virt-launcher pod.

## Overview

Console access involves a multi-hop proxy chain from the browser to QEMU's Unix sockets. Each layer performs a WebSocket upgrade and proxies the connection to the next layer.

```
Browser (WebSocket)
  │
  ▼
OpenShift console (proxy)
  │
  ▼
kube-apiserver
  │
  ▼
virt-api (subresource endpoint: /console, /vnc)
  │ WebSocket upgrade happens here
  ▼
virt-handler (console server on each node)
  │ Second WebSocket upgrade, dials Unix socket
  ▼
virt-launcher (Unix socket to QEMU serial/VNC)
```

## virt-api: Subresource Endpoints

virt-api registers two subresource endpoints for console access:

**Serial Console:**
- Route: `GET /apis/subresources.kubevirt.io/v1/namespaces/{namespace}/virtualmachineinstances/{name}/console`
- Handler: `ConsoleRequestHandler` (pkg/virt-api/rest/console.go:35)
- Validates: `AutoattachSerialConsole != false`, VMI is running
- Connects to: virt-handler's `/v1/namespaces/{ns}/virtualmachineinstances/{name}/console` endpoint

**VNC:**
- Route: `GET /apis/subresources.kubevirt.io/v1/namespaces/{namespace}/virtualmachineinstances/{name}/vnc`
- Handler: `VNCRequestHandler` (pkg/virt-api/rest/vnc.go:37)
- Query param: `?preserveSession=true` to prevent dropping existing VNC connection
- Validates: `AutoattachGraphicsDevice != false`, VMI is running
- Connects to: virt-handler's `/v1/namespaces/{ns}/virtualmachineinstances/{name}/vnc` endpoint

Both handlers use the same pattern:
1. Fetch and validate the VMI from the Kubernetes API
2. Find the virt-handler pod on the VMI's node
3. Create a `handlerDial` that connects to virt-handler on port 8186 (consoleServerPort) with TLS
4. Use `NewRawStreamer` to set up bidirectional proxying

## WebSocket Upgrade in virt-api

The first WebSocket upgrade happens in virt-api's streamer (pkg/virt-api/rest/streamer.go:92).

1. `clientConnectionUpgrade` upgrades the incoming HTTP request to WebSocket (line 135-142)
2. `DialUnderlying` creates a WebSocket connection to virt-handler and extracts the underlying TCP connection (line 95)
3. Two goroutines copy data bidirectionally:
   - `streamToClient`: `io.Copy(clientConn.UnderlyingConn(), serverConn)` (line 119)
   - `streamToServer`: `io.Copy(serverConn, clientConn.UnderlyingConn())` (line 120)

The `RawStreamer` uses the WebSocket's underlying net.Conn for raw byte copying, not WebSocket frame handling.

## virt-handler: Console Server

virt-handler runs a REST server on each node (port 8186) that proxies connections to virt-launcher's Unix sockets.

**Serial Console Handler:**
- Path: `/v1/namespaces/{ns}/virtualmachineinstances/{name}/console`
- Handler: `SerialHandler` (pkg/virt-handler/rest/console.go:179)
- Socket: `/var/run/kubevirt-private/{vmi-uid}/virt-serial0`

**VNC Handler:**
- Path: `/v1/namespaces/{ns}/virtualmachineinstances/{name}/vnc`
- Handler: `VNCHandler` (pkg/virt-handler/rest/console.go:147)
- Socket: `/var/run/kubevirt-private/{vmi-uid}/virt-vnc`
- Concurrency: Only one VNC connection at a time per VMI (unless `preserveSession=true`)

Both handlers:
1. Perform a second WebSocket upgrade (line 319-326)
2. Dial the Unix socket in the virt-launcher pod's mount namespace (line 331)
3. Use `kvcorev1.CopyTo` and `kvcorev1.CopyFrom` to proxy WebSocket frames bidirectionally (lines 340-349)

The Unix socket path resolution uses `podIsolationDetector` to find the pod's mount root, then resolves `run/kubevirt-private/{vmi-uid}/{socket-name}` within that namespace.

## virt-launcher: Unix Socket Setup

virt-launcher configures QEMU to listen on Unix sockets for console access.

**Serial Console (pkg/virt-launcher/virtwrap/converter/compute/console.go:42):**

QEMU XML:
```xml
<serial type='unix'>
  <source mode='bind' path='/var/run/kubevirt-private/{vmi-uid}/virt-serial0'/>
  <target port='0'/>
</serial>
```

This creates a Unix domain socket that QEMU's serial device binds to. The socket is of type `unix` with mode `bind`, meaning QEMU creates and listens on it.

**VNC (pkg/virt-launcher/virtwrap/converter/compute/graphics.go:54):**

QEMU XML:
```xml
<graphics type='vnc'>
  <listen type='socket' socket='/var/run/kubevirt-private/{vmi-uid}/virt-vnc'/>
</graphics>
```

QEMU creates a Unix socket for VNC connections instead of listening on a TCP port. This socket lives inside the virt-launcher pod's filesystem.

## QEMU Device Details

**Serial Console:**
- QEMU creates a chardev backend for the serial port
- The chardev connects to the Unix socket
- The serial port appears as `/dev/ttyS0` in the guest
- Console traffic flows: guest writes to ttyS0 → QEMU serial emulation → Unix socket → virt-handler → virt-api → browser

**VNC:**
- QEMU's VNC server binds to the Unix socket
- VNC protocol is spoken natively (not wrapped in another protocol)
- Video output comes from QEMU's emulated graphics device (VGA, virtio-gpu, bochs depending on arch/config)
- VNC frames: QEMU graphics framebuffer → VNC protocol → Unix socket → virt-handler → virt-api → browser

## virtctl console/vnc

virtctl provides CLI access to console and VNC using the same API endpoints but with local handling:

**virtctl console:**
- Uses `client.VirtualMachineInstance(ns).SerialConsole(vmi, options)` (pkg/virtctl/console/console.go:94)
- This calls the same `/console` subresource endpoint
- Streams to stdin/stdout with terminal raw mode (line 148)
- Escape sequence: Ctrl+] or Ctrl+5 to exit

**virtctl vnc:**
- Uses `client.VirtualMachineInstance(ns).VNC(vmi)` (pkg/virtctl/vnc/vnc.go)
- Calls the same `/vnc` subresource endpoint
- Creates a local TCP listener (default 127.0.0.1 on a random port)
- Launches a VNC viewer (TigerVNC, remote-viewer, etc.) pointing to the local listener
- Proxies VNC traffic: local VNC viewer → virtctl proxy → virt-api → virt-handler → QEMU

The key difference: browser-based access uses noVNC (a JavaScript VNC client) in the OpenShift console, while virtctl launches a native VNC viewer.

## Security and RBAC

Console access requires permission to use the VMI subresources:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
rules:
- apiGroups: ["subresources.kubevirt.io"]
  resources: ["virtualmachineinstances/console"]
  verbs: ["get"]
- apiGroups: ["subresources.kubevirt.io"]
  resources: ["virtualmachineinstances/vnc"]
  verbs: ["get"]
```

virt-api validates RBAC before allowing the connection. There is no additional authentication at the virt-handler or QEMU level, since those layers are not directly exposed outside the cluster.

## Key Takeaways

1. **Two WebSocket upgrades**: One at virt-api (client → virt-api), one at virt-handler (virt-api → virt-handler).
2. **Unix sockets, not TCP**: QEMU listens on Unix domain sockets inside the pod, not on network ports. This prevents direct network access to the console.
3. **Path resolution through mount namespaces**: virt-handler uses `podIsolationDetector` to enter the virt-launcher pod's mount namespace and access its `/var/run/kubevirt-private/{vmi-uid}/` directory.
4. **Serial vs VNC concurrency**: Multiple serial console connections can coexist, but VNC defaults to one-at-a-time (dropping existing sessions unless `preserveSession=true`).
5. **RBAC at the API layer**: Console access is gated by Kubernetes RBAC on the subresource endpoints, not by separate console authentication.

# 03 - Write the Plugin

Build a NodeHook plugin that queries the QEMU guest agent for VirtIO driver versions when a VM starts.

## How NodeHook plugins work

A NodeHook plugin is a gRPC server that implements the `NodeHookService`:

```protobuf
service NodeHookService {
    rpc ExecuteNodeHook(ExecuteNodeHookRequest) returns (ExecuteNodeHookResponse);
}

message ExecuteNodeHookRequest {
    string hookPoint = 1;    // e.g. "PostVMStart"
    bytes vmi = 2;           // full VMI object as JSON
    NodeContext node_context = 3;
}
```

The plugin runs as a DaemonSet on each node. It creates a Unix socket under `/var/run/kubevirt/plugins/`, which is a hostPath shared with virt-handler. When virt-handler processes a VM lifecycle event, it dials the socket and calls `ExecuteNodeHook`.

## Project setup

```bash
mkdir -p ~/github/kubevirt/virtio-driver-check-plugin/proto
cd ~/github/kubevirt/virtio-driver-check-plugin
go mod init github.com/shanemcd/virtio-driver-check-plugin
```

Copy the proto definition from KubeVirt (just the NodeHook service, not the full file):

```protobuf
// proto/api.proto
syntax = "proto3";
package kubevirt.hooks.plugins.v1alpha1;
option go_package = "github.com/shanemcd/virtio-driver-check-plugin/proto";

service NodeHookService {
    rpc ExecuteNodeHook(ExecuteNodeHookRequest) returns (ExecuteNodeHookResponse);
}

message NodeContext { string node_name = 1; }
message ExecuteNodeHookRequest {
    string hookPoint = 1;
    bytes vmi = 2;
    NodeContext node_context = 3;
}
message ExecuteNodeHookResponse {}
```

Generate Go code:

```bash
# Install protoc plugins
go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest

# Generate
export PATH=$PATH:$(go env GOPATH)/bin
protoc --go_out=. --go_opt=paths=source_relative \
       --go-grpc_out=. --go-grpc_opt=paths=source_relative \
       proto/api.proto
```

## The plugin code

The reference implementation is at `kubevirt/kubevirt/cmd/example-node-hook-plugin/main.go`. Our plugin follows the same structure but adds driver detection logic:

1. **gRPC server** listens on `/var/run/kubevirt/plugins/virt-driver-check.sock`
2. **PostVMStart handler** unmarshals the VMI JSON, extracts namespace and VM name
3. **Driver check** (async, with a 30s delay for guest agent initialization):
   - Uses `client-go` to find the virt-launcher pod by label `vm.kubevirt.io/name=<vm>`
   - Uses `remotecommand` (SPDY executor) to exec into the virt-launcher's compute container
   - Runs `virsh qemu-agent-command <domain> '{"execute":"guest-get-devices"}'`
   - Filters to VirtIO devices (vendor ID `6900`, which is `0x1AF4` in decimal)
   - Logs the driver versions
   - Annotates the VMI with `kubevirt.io/virtio-driver-versions`

The full source is at `~/github/kubevirt/virtio-driver-check-plugin/main.go`.

## Using client-go instead of kubectl

An earlier version shelled out to `kubectl` for pod discovery and exec. This broke in two ways:

1. **glibc mismatch**: `kubectl` from Fedora 44 requires a newer glibc than the UBI9-minimal runtime image provides
2. **Label format**: The label for finding virt-launcher pods is `vm.kubevirt.io/name=<vm>`, not `kubevirt.io/domain=<vm>` as the must-gather script uses (it uses annotations instead)

Using `client-go` directly solves both problems: no external binary dependency, typed API calls, and the service account token is mounted automatically. The final image is built `FROM scratch` with zero dependencies.

Key packages:
- `k8s.io/client-go/kubernetes` for pod listing
- `k8s.io/client-go/tools/remotecommand` for exec into virt-launcher
- `k8s.io/client-go/dynamic` for patching VMI annotations (KubeVirt types aren't in the typed clientset)

## guest-get-devices is Windows-only

The QEMU guest agent command `guest-get-devices` is [explicitly blacklisted on Linux](https://lists.nongnu.org/archive/html/qemu-devel/2020-01/msg01727.html). The POSIX implementation returns `QERR_UNSUPPORTED`. It uses Windows-specific APIs (`CM_Get_DevNode_PropertyW`) to enumerate PCI devices and their driver versions.

The plugin handles this gracefully: if the error contains "has not been found" or "not supported", it logs a skip message and moves on. Linux VMs are silently ignored.

## guest-get-devices response format

The response uses decimal integers for device and vendor IDs (not hex strings):

```json
{
  "return": [
    {
      "driver-name": "Red Hat VirtIO Ethernet Adapter",
      "driver-version": "100.100.104.26600",
      "driver-date": 1729468800000000000,
      "id": {
        "device-id": 4161,
        "vendor-id": 6900,
        "type": "pci"
      }
    }
  ]
}
```

VirtIO devices are identified by `vendor-id: 6900` (0x1AF4 in decimal). The Go struct must use `int` for these fields, not `string`.

## VMI annotations

After collecting driver versions, the plugin patches the VMI with the annotation `kubevirt.io/virtio-driver-versions`. This follows the same `kubevirt.io/` prefix convention used by all other KubeVirt annotations. The value is a compact JSON array:

```yaml
metadata:
  annotations:
    kubevirt.io/virtio-driver-versions: '[{"driverName":"Red Hat VirtIO Ethernet Adapter","driverVersion":"100.100.104.26600","deviceId":4161},...]'
```

This makes driver version data queryable via the Kubernetes API without any custom subresources.

## Build the image

```dockerfile
FROM registry.fedoraproject.org/fedora:44 AS builder
RUN dnf install -y golang && dnf clean all
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o virtio-driver-check-plugin .

FROM scratch
COPY --from=builder /app/virtio-driver-check-plugin /virtio-driver-check-plugin
ENTRYPOINT ["/virtio-driver-check-plugin"]
```

Fedora 44 as the builder stage (ships Go 1.26), `scratch` as the runtime (static binary, no OS needed).

```bash
podman build -t quay.io/shanemcd/virt-driver-check-plugin:dev .
podman push quay.io/shanemcd/virt-driver-check-plugin:dev
```

## Naming convention

All resources use the `virt-` prefix to match KubeVirt's component naming (`virt-handler`, `virt-controller`, etc.):

| Resource | Name |
|----------|------|
| DaemonSet | `virt-driver-check` |
| ServiceAccount | `virt-driver-check` |
| Plugin CR | `virt-driver-check` |
| Socket | `/var/run/kubevirt/plugins/virt-driver-check.sock` |
| Container image | `quay.io/shanemcd/virt-driver-check-plugin:dev` |
| Annotation | `kubevirt.io/virtio-driver-versions` |

## Key reference files in kubevirt/kubevirt

| File | What it shows |
|------|--------------|
| `cmd/example-node-hook-plugin/main.go` | Minimal NodeHook plugin example |
| `pkg/hooks/plugins/v1alpha1/api.proto` | gRPC service definition |
| `pkg/hooks/plugins/v1alpha1/client.go` | How virt-handler dials and calls plugins |
| `pkg/virt-handler/plugins/manager.go` | Plugin manager: CEL evaluation, hook dispatch |
| `staging/src/kubevirt.io/api/plugin/v1alpha1/types.go` | Plugin CRD types |
| `tests/plugin_test.go` | E2E test: DaemonSet creation, Plugin CR, verification |

# virt-handler

**DaemonSet (runs on every schedulable node).** The bridge between the Kubernetes API and the libvirt/QEMU layer on each node.

- Image: `quay.io/kubevirt/virt-handler:v1.8.2`
- Init container: `quay.io/kubevirt/virt-launcher:v1.8.2` (copies the virt-launcher binary onto the node)
- Source: [`cmd/virt-handler`](https://github.com/kubevirt/kubevirt/tree/main/cmd/virt-handler), [`pkg/virt-handler`](https://github.com/kubevirt/kubevirt/tree/main/pkg/virt-handler)

## What it does

- Watches for VMIs assigned to its node
- Opens gRPC connections to virt-launcher pods via Unix domain sockets at `/var/run/kubevirt/sockets/<pod-uid>/sock`
- Calls `SyncVirtualMachine()` to push VMI spec changes to the launcher
- Reports domain state and spec changes back to the API server
- Invokes node-centric plugins for networking and storage setup
- Runs a continuous reconciliation loop processing VMI and Domain events
- Registers Kubernetes device plugins for `/dev/kvm`, `/dev/net/tun`, and `/dev/vhost-net`, making them available as schedulable resources (`devices.kubevirt.io/kvm`, etc.) that the kubelet mounts into virt-launcher containers

virt-handler suppresses socket errors for the first 3 minutes while waiting for a new virt-launcher to initialize. After that, an unreachable socket means the VMI is marked as Failed.

## VM sync flow

When virt-handler detects a new VMI on its node (`pkg/virt-handler/vm.go`), the `sync()` method dispatches to `processVmUpdate()`:

1. **Container disk mount** (`pkg/virt-handler/mount.go`): bind-mounts the disk image from the sidecar container's overlay filesystem into the pod's shared `container-disks` volume. The path goes through `/proc/1/root` (node's root namespace) into the container storage overlay.

2. **Network setup** (`pkg/virt-handler/netpod.go`): transforms the pod's network. For a masquerade binding, it takes the pod's eth0 (assigned by OVN-Kubernetes) and creates:
   - A bridge (`k6t-eth0`) with a link-local IP
   - A TAP device (`tap0`) owned by UID/GID 107 (qemu) for QEMU to use
   - A dummy device that inherits the original pod IP
   - The original eth0 becomes a bridge port

3. **gRPC call**: opens a connection to virt-launcher's cmd-server and calls `SyncVirtualMachine()`, passing the serialized VMI spec.

4. **State reporting**: watches for domain state changes (Paused/StartingUp -> Running) from virt-launcher via a notify pipe, and updates the VMI status in the API server.

## gRPC protocol

The contract between virt-handler and virt-launcher is defined in `pkg/handler-launcher-com/cmd/v1/cmd.proto`. The `Cmd` service includes:

| RPC | When it fires |
|-----|--------------|
| `SyncVirtualMachine` | Initial creation, spec updates |
| `PauseVirtualMachine` / `UnpauseVirtualMachine` | Pause/unpause |
| `ShutdownVirtualMachine` / `KillVirtualMachine` | Graceful/forced stop |
| `DeleteVirtualMachine` | Cleanup |
| `MigrateVirtualMachine` | Source-side migration |
| `SyncMigrationTarget` | Target-side migration |
| `HotplugHostDevices` | Device hotplug |
| `SyncVirtualMachineCPUs` / `SyncVirtualMachineMemory` | CPU/memory hotplug |
| `GetDomain` / `GetDomainStats` | Status queries |
| `GetGuestInfo` / `GetUsers` / `GetFilesystems` | Guest agent queries |
| `Exec` | Command execution in guest |
| `VirtualMachineMemoryDump` | Memory dump |
| `GetScreenshot` | Screenshot capture |
| `BackupVirtualMachine` | VM backup |

The client (`pkg/virt-handler/cmd-client/client.go`) serializes the VMI to JSON, wraps it in a `VMIRequest` protobuf, and sends it with a 20-second timeout.

## Key code paths

| File | What it does |
|------|-------------|
| `pkg/virt-handler/vm.go` | Main reconciliation: `sync()`, `processVmUpdate()`, `syncVirtualMachine()` |
| `pkg/virt-handler/cmd-client/client.go` | gRPC client to virt-launcher |
| `pkg/virt-handler/mount.go` | Container disk bind mounting |
| `pkg/virt-handler/netpod.go` | Network setup (bridge, TAP, masquerade) |
| `pkg/handler-launcher-com/cmd/v1/cmd.proto` | gRPC protocol definition |

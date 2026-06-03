# virt-controller

**Deployment (2 replicas for HA).** The cluster-level reconciliation engine.

- Image: `quay.io/kubevirt/virt-controller:v1.8.2`
- Source: [`cmd/virt-controller`](https://github.com/kubevirt/kubevirt/tree/main/cmd/virt-controller), [`pkg/virt-controller`](https://github.com/kubevirt/kubevirt/tree/main/pkg/virt-controller)

## What it does

Watches VirtualMachine and VirtualMachineInstance resources and drives state transitions:

1. **VM -> VMI**: When a VM with `runStrategy: Always` exists without a corresponding VMI, virt-controller creates one from `VM.Spec.Template`
2. **VMI -> Pod**: When a VMI exists without a pod, virt-controller calls `TemplateService.RenderLaunchManifest()` to generate a pod spec and creates the virt-launcher pod
3. **Migration orchestration**: Creates target virt-launcher pods, coordinates handoff between source and target nodes

virt-controller never communicates directly with libvirt or QEMU. It works entirely through the Kubernetes API, creating pods and updating VMI status.

## VM controller

The VM controller (`pkg/virt-controller/watch/vm/vm.go`) watches VirtualMachine resources. When a VM has `runStrategy: Always` and no VMI exists, it creates one from `VM.Spec.Template`. It also handles stop/restart by deleting VMIs.

## VMI controller and pod creation

The VMI controller (`pkg/virt-controller/watch/vmi/vmi.go`) watches VirtualMachineInstance resources. Its `sync()` method (via `pkg/virt-controller/watch/vmi/lifecycle.go`) detects when a VMI has no corresponding pod and calls `RenderLaunchManifest()`.

### RenderLaunchManifest

`pkg/virt-controller/services/template.go` (1,758 lines) generates the virt-launcher pod spec. This is one of the most important functions in the codebase. For a containerDisk VM, it produces:

**Init containers:**
- `guest-console-log`: sets up console logging
- `container-disk-binary`: copies the container-disk serving binary into a shared volume
- `volumecontainerdisk-init`: the container disk image itself, runs once to extract the disk file

**Containers:**
- `compute`: the virt-launcher container. Entry point is actually `virt-launcher-monitor`, which supervises the launcher process. Requests three device plugins from virt-handler: `devices.kubevirt.io/kvm`, `devices.kubevirt.io/tun`, `devices.kubevirt.io/vhost-net`
- `volumecontainerdisk`: the container disk image running as a sidecar, serving the disk file at runtime

**Memory calculation**: guest memory (128Mi) + overhead for QEMU, virtqemud, virt-launcher, page tables. For our 128Mi VM, the compute container requests 396Mi.

**Security context**: runs as UID/GID 107 (qemu), non-root, drops ALL capabilities except `NET_BIND_SERVICE`, no privilege escalation.

**Volumes**: 8 emptyDir volumes for private data, public data, sockets, libvirt runtime, ephemeral disks, container disks, hotplug disks, and a shared binary directory.

## Key code paths

| File | What it does |
|------|-------------|
| `pkg/virt-controller/watch/vm/vm.go` | VM controller, creates/deletes VMIs based on run strategy |
| `pkg/virt-controller/watch/vmi/vmi.go` | VMI controller, main `sync()` loop |
| `pkg/virt-controller/watch/vmi/lifecycle.go` | VMI lifecycle sync, calls RenderLaunchManifest |
| `pkg/virt-controller/services/template.go` | `RenderLaunchManifest()`, pod spec generation (1,758 lines) |

# Container Disks

How KubeVirt boots VMs from container images, and why it works.

## The idea

Container registries solve a hard distribution problem: authentication, caching, versioning, layer deduplication, cross-node distribution. Every Kubernetes cluster already knows how to pull OCI images. Instead of building a separate disk image distribution system, KubeVirt reuses the one that already exists.

A containerDisk is an OCI image with a disk file inside it. You reference it in a VM spec the same way you'd reference a container image anywhere else. The kubelet handles pulling, caching, and garbage collection.

## Building one

A containerDisk image is trivial to build:

```dockerfile
FROM scratch
ADD fedora.qcow2 /disk/
```

No entrypoint, no runtime dependencies. The "container" never executes application code. The OCI image format is just a packaging and distribution mechanism for a disk file. Both qcow2 and raw formats are supported.

Source: `cmd/container-disk-v2alpha/README.md`

## How the pieces connect

The kubelet doesn't hand anything off to KubeVirt. virt-handler never watches pods at all for this purpose. The connection works through the VMI object, not the pod.

Here's the chain:

1. **virt-controller** creates the virt-launcher pod (via `RenderLaunchManifest`) with an `ownerReference` pointing back to the `VirtualMachineInstance`. The pod gets labels like `kubevirt.io: virt-launcher` and `kubevirt.io/vm: vm-cirros`, but these labels are not how virt-handler finds it.

2. **kubelet** schedules and starts the pod normally. kubelet has no idea this pod is related to virtualization. It pulls the containerDisk image, starts the sidecar, runs init containers. Standard Kubernetes.

3. **virt-controller** watches the pod's status. Once the pod is scheduled to a node, virt-controller updates the VMI object: sets `status.phase = Scheduled`, `status.nodeName = <node>`, and adds the label `kubevirt.io/nodeName: <node>` (`pkg/virt-controller/watch/vmi/lifecycle.go:441`).

4. **virt-handler** watches VMI objects, filtered by a label selector: `kubevirt.io/nodeName in (<this-host>)` (`pkg/controller/virtinformers.go:479`). When the VMI gets that label, virt-handler's informer fires and it starts processing the VMI.

5. **virt-handler** looks up the pod UID from `vmi.Status.ActivePods`, uses it to locate the pod's volumes on the node filesystem, and proceeds with disk mounting and gRPC calls.

So the flow is: pod gets scheduled -> virt-controller labels the VMI with the node name -> virt-handler's filtered watch picks up the VMI -> virt-handler acts on the pod's filesystem. The kubelet and virt-handler never communicate directly. The VMI object is the coordination point.

## How it works at runtime

When a VM with a containerDisk volume is created, `RenderLaunchManifest()` generates a pod with extra containers for each containerDisk. Four things happen:

### 1. virt-controller generates the pod spec

The user's VM manifest just says `containerDisk: image: quay.io/kubevirt/cirros-container-disk-demo:latest`. virt-controller's `RenderLaunchManifest()` translates that into the full pod spec: init containers, sidecar containers, volume mounts, and the `container-disk` binary. None of this is in the user's YAML. The functions `GenerateInitContainers()` and `GenerateContainers()` in `pkg/container-disk/container-disk.go` build these container specs.

### 2. Init container forces the image pull

An init container named `volumecontainerdisk-init` runs the containerDisk image with the `container-disk` binary and `--no-op`, which calls `exit(0)` immediately (line 133 of `main.c`). It doesn't extract or copy anything. The only reason it exists is to force the kubelet to pull the OCI image before the pod's main containers start, ensuring the image layers are on disk.

### 3. Sidecar container keeps the filesystem alive

A sidecar container named `volumecontainerdisk` runs the same image with `container-disk --copy-path /var/run/kubevirt-ephemeral-disks/container-disk-data/<uid>/disk_0`. This process:

- Creates a Unix socket at the copy path + `.sock`
- Loops forever, accepting and closing connections on the socket
- The socket's existence signals to virt-handler that the disk is ready
- The container stays running so its overlay filesystem remains accessible

The `container-disk` binary is written in C (`cmd/container-disk-v2alpha/main.c`), not Go. It's 183 lines. All it does is create a socket and keep the container alive.

### 4. virt-handler bind-mounts the disk

virt-handler on the node bind-mounts the disk file from the sidecar's overlay filesystem into the virt-launcher pod's shared `container-disks` volume:

```
Source: /proc/1/root/var/lib/containers/storage/overlay/<layer-id>/merged/disk/<image-file>
Target: /var/lib/kubelet/pods/<pod-uid>/volumes/kubernetes.io~empty-dir/container-disks/disk_0.img
```

The path goes through `/proc/1/root` (the node's root namespace) to reach into the container's storage overlay.

Source: `pkg/virt-handler/mount.go`

### 5. QEMU uses copy-on-write

QEMU opens the bind-mounted disk as a **read-only backing file** and creates a qcow2 overlay for writes:

```
Read-only base:  /var/run/kubevirt/container-disks/disk_0.img
Read-write overlay: /var/run/kubevirt-ephemeral-disks/disk-data/containerdisk/disk.qcow2
```

The QEMU command line shows this as two `blockdev` entries chained together, with the overlay's `backing` field pointing to the base. This is standard qcow2 copy-on-write.

Source: `pkg/container-disk/container-disk.go` (`CreateEphemeralImages`)

## Limitations

- **Ephemeral only**: the qcow2 overlay lives in an emptyDir. When the pod dies, all writes are lost. Every restart boots from the original image.
- **Size**: the disk image is stored in the container's overlay filesystem, which consumes node disk space. Large images (tens of GB) are impractical.
- **No persistence**: if you need a VM's disk to survive restarts, use a PVC (with or without CDI).
- **Block migration required**: since the disk is node-local, live migration requires copying the entire disk to the target node (block migration), not just memory state.

## When to use them

- Testing and development (quick iteration, no storage setup needed)
- Stateless workloads (the VM's persistent state lives elsewhere)
- CI/CD environments (disposable VMs)
- Distributing read-only base images (boot from containerDisk, persist data to a separate PVC)

## Key code paths

| File | What it does |
|------|-------------|
| `cmd/container-disk-v2alpha/main.c` | The C binary that runs in the sidecar (183 lines) |
| `pkg/container-disk/container-disk.go` | Path calculation, container generation, ephemeral image creation |
| `pkg/virt-handler/mount.go` | Bind-mounting disk from sidecar overlay into launcher |
| `pkg/virt-controller/services/template.go` | Generates init + sidecar containers in the pod spec |

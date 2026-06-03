# PVC-Backed Disks

How VMs use PersistentVolumeClaims for persistent storage, and how this differs from containerDisks.

## How it works

When a VM references a PVC as a volume, the PVC is mounted directly into the virt-launcher pod's compute container at `/var/run/kubevirt-private/vmi-disks/<volume-name>/`. QEMU opens the disk file read-write with a single `-blockdev` entry:

```
-blockdev {"driver":"file",
           "filename":"/var/run/kubevirt-private/vmi-disks/rootdisk/disk.img",
           "read-only":false,
           "discard":"unmap",
           "cache":{"direct":true,"no-flush":false}}
```

No backing chain, no copy-on-write overlay, no sidecar container. QEMU reads and writes directly to the file on the PVC. Writes persist across VM restarts because the PVC outlives the pod.

## Format conversion

CDI converts disk images during import. For Filesystem-mode PVCs (the default on most storage classes), CDI converts the source image to **raw** format regardless of what format was downloaded. Our Fedora 44 qcow2 (471 MiB compressed) became a 5 GiB raw sparse file named `disk.img` (764 MiB actually on disk):

```
$ qemu-img info /var/run/kubevirt-private/vmi-disks/rootdisk/disk.img
file format: raw
virtual size: 5 GiB (5368709120 bytes)
disk size: 764 MiB
```

The conversion chain: Fedora qcow2 (compressed, 471 MiB) -> CDI importer downloads via nbdkit -> converts to raw -> writes sparse to PVC as `disk.img` -> QEMU opens it directly with the `file` driver (no format layer needed for raw).

The file is always named `disk.img` on the PVC. The `StorageProfile` for the storage class controls the volume mode and influences whether CDI uses raw (Filesystem mode) or writes directly as a block device (Block mode).

## Comparison with containerDisks

| | containerDisk | PVC |
|---|---|---|
| QEMU blockdev entries | 4 (two-layer backing chain) | 1 (direct file access) |
| Base image | Read-only, bind-mounted from sidecar container | N/A, the qcow2 file is the only layer |
| Writes | Ephemeral qcow2 overlay in emptyDir | Directly to the qcow2 on the PVC |
| Persist across restart | No | Yes |
| Sidecar container needed | Yes (holds the OCI image overlay FS open) | No |
| Containers in launcher pod | compute + volumecontainerdisk sidecar | compute only |
| Live migration | Block migration (must copy entire disk) | Shared storage migration (if RWX access mode) |
| How the disk gets there | Pulled as an OCI image by kubelet | Imported by CDI, uploaded via virtctl, or manually provisioned |

## Pod spec differences

A PVC-backed VM has a simpler launcher pod. No init containers for image pull, no sidecar to keep a filesystem alive. The PVC is just a standard Kubernetes volume mount:

```yaml
volumes:
- name: rootdisk
  persistentVolumeClaim:
    claimName: fedora-cloud
```

The compute container mounts it at `/var/run/kubevirt-private/vmi-disks/rootdisk/`. Kubernetes and the kubelet handle all of the PVC binding and mounting through the normal CSI/storage path.

## Security context

Same as containerDisk VMs. The compute container runs as UID/GID 107 (qemu), non-root, drops all capabilities except `NET_BIND_SERVICE`. QEMU's seccomp sandbox is enabled. No host access.

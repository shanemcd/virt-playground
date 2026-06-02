# Storage

How VMs get persistent disks in KubeVirt.

## The Basics

VM disks are backed by Kubernetes PersistentVolumeClaims (PVCs). PVCs are mounted as volumes in the virt-launcher pod and passed through to QEMU as virtual disks (virtio-blk, virtio-scsi, or SATA, depending on configuration).

## CDI (Containerized Data Importer)

CDI is a companion project that populates PVCs with VM disk images. It is storage-device agnostic and works with standard Kubernetes resources. CDI introduces the **DataVolume** CRD.

## DataVolumes

A DataVolume automates both PVC creation and data population. Without DataVolumes, the manual process is:

1. Create a PVC with an import annotation
2. Wait for an importer pod to download the image
3. Create the VM referencing the PVC
4. Wait for the import to finish before starting the VM

With DataVolumes, all of this is a single declaration. You define the data source and storage requirements, CDI handles the rest.

### Data Sources

CDI supports importing from:

| Source | Description |
|--------|-------------|
| HTTP/HTTPS URL | Download a cloud image (qcow2, raw, ISO) |
| Container registry | Pull a disk image stored as a container image |
| PVC clone | Clone an existing PVC (uses efficient backend cloning if storage supports it, otherwise pod-to-pod transfer) |
| Upload | Upload from a client machine via the upload proxy |
| VolumeSnapshot | Restore from a snapshot |
| Blank | Create an empty disk |
| oVirt (ImageIO) | Import from an oVirt installation |
| VMware (VDDK) | Import from vCenter/ESXi |

CDI automatically decompresses (gz, xz) and converts images (qcow2 to raw) as needed.

### Embedding DataVolumes in VMs

DataVolumes can be declared directly in the VM spec:

```yaml
spec:
  dataVolumeTemplates:
    - metadata:
        name: my-vm-disk
      spec:
        source:
          http:
            url: "https://cloud.example.com/fedora.qcow2"
        storage:
          resources:
            requests:
              storage: 10Gi
```

When this VM is created, CDI creates the PVC, runs an importer pod to download and convert the image, and the VM does not start until the DataVolume status is `Succeeded`. When the VM is deleted, the DataVolume's storage is deleted with it.

## containerDisk (Ephemeral)

A containerDisk is a disk image baked into a container image (OCI image). It is pulled from a registry and mounted ephemerally. Useful for replicated, stateless VMs (booting many identical test VMs) but does not persist data across VM restarts.

## Other Disk Types

| Type | Description |
|------|-------------|
| emptyDir | Temporary, node-local storage |
| configMap | Injected as a read-only disk |
| secret | Injected as a read-only disk |
| hostDisk | Direct access to a file on the node |
| cloudInitNoCloud | cloud-init user data injected as an ISO |
| cloudInitConfigDrive | cloud-init config drive format |

## Access Modes and Live Migration

For live migration, the storage must support **ReadWriteMany (RWX)** access mode. Both the source and target virt-launcher pods must access the same PVC simultaneously during migration. If migration is not needed, ReadWriteOnce (RWO) is simpler.

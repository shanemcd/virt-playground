# kubevirt/containerized-data-importer (CDI)

VM disk lifecycle management. Imports, uploads, clones, and schedules disk images into PVCs.

- Repo: [kubevirt/containerized-data-importer](https://github.com/kubevirt/containerized-data-importer)
- Local clone: `~/github/kubevirt/containerized-data-importer`
- Deployed version: v1.65.0
- Namespace: `cdi`

## Why CDI exists

Without CDI, KubeVirt can only use these volume types:

| Volume type | Persistent? | How you get the disk image |
|-------------|------------|---------------------------|
| **containerDisk** | No (ephemeral, resets on restart) | Baked into an OCI image, pulled from a registry |
| **emptyDisk** | No (gone when VM stops) | Created automatically, always blank |
| **PVC** (manual) | Yes | You figure it out: `dd`, `cp`, manual download |
| **hostDisk** | Yes (node-local only) | File on the node filesystem, not portable |
| **cloudInitNoCloud** | No | Inline or Secret-backed metadata, not a boot disk |
| **configMap / secret / downwardAPI** | No | Metadata volumes only |

So without CDI: no importing a disk from a URL, no uploading from your workstation, no cloning disks, no golden image refresh. You can run VMs, but you can't manage their storage lifecycle.

CDI adds:

- **DataVolume**: "I want a PVC with this disk image, from this source." One CR, CDI handles the rest.
- **DataImportCron**: scheduled re-import to keep golden images current
- **Upload**: `virtctl image-upload` streams a local disk image into a PVC
- **Clone**: PVC-to-PVC or snapshot-based cloning
- **Volume populators**: pluggable backends for Forklift migrations (oVirt, OpenStack)

## Long-running components

| Component | Image | What it does | Source |
|---|---|---|---|
| **cdi-operator** | `cdi-operator:v1.65.0` | Deploys and manages all other CDI components | `cmd/cdi-operator`, `pkg/operator` |
| **cdi-apiserver** | `cdi-apiserver:v1.65.0` | Admission webhooks for DataVolumes, upload token handling | `cmd/cdi-apiserver`, `pkg/apiserver` |
| **cdi-controller** | `cdi-controller:v1.65.0` | Reconciles DataVolumes, spawns importer/cloner/uploader pods | `cmd/cdi-controller`, `pkg/controller` |
| **cdi-uploadproxy** | `cdi-uploadproxy:v1.65.0` | HTTPS endpoint for `virtctl image-upload`, proxies to upload server pods | `cmd/cdi-uploadproxy`, `pkg/uploadproxy` |

## Transient pods (spawned per-operation)

These don't run until something triggers them. cdi-controller creates them as needed.

| Binary | When it runs | What it does |
|---|---|---|
| **cdi-importer** | DataVolume with HTTP/registry/S3/GCS/VDDK source | Downloads disk image, converts format, writes to PVC |
| **cdi-cloner** | DataVolume cloning another PVC | Reads source PVC, writes to target PVC |
| **cdi-uploadserver** | `virtctl image-upload` | Receives upload stream from cdi-uploadproxy, writes to PVC |
| **ovirt-populator** | Forklift migration from oVirt/RHV | Volume populator for oVirt disk sources |
| **openstack-populator** | Forklift migration from OpenStack | Volume populator for OpenStack disk sources |

## CRDs

| CRD | What it does |
|-----|-------------|
| **CDI** | Top-level config CR, triggers operator to deploy everything |
| **DataVolume** | Declares a desired PVC with a disk image from a source |
| **DataSource** | Abstraction over where a disk image comes from |
| **DataImportCron** | Scheduled re-import for golden image refresh |
| **StorageProfile** | Per-StorageClass tuning (access modes, volume mode, clone strategy) |
| **ObjectTransfer** | Cross-namespace PVC transfers |
| **VolumeImportSource** | Volume populator backing type for imports |
| **VolumeUploadSource** | Volume populator backing type for uploads |
| **VolumeCloneSource** | Volume populator backing type for clones |
| **OvirtVolumePopulator** | Forklift volume populator for oVirt sources |
| **OpenStackVolumePopulator** | Forklift volume populator for OpenStack sources |

## cdi-controller internals

The controller binary (`cmd/cdi-controller/controller.go`) registers 14 sub-controllers inside a single process using controller-runtime:

**DataVolume controllers** (one per source type):
- Import controller: HTTP, registry, S3, GCS, VDDK imports
- Upload controller: upload-based DataVolumes
- PVC clone controller: clone via host-assisted copy
- Snapshot clone controller: clone via VolumeSnapshot
- Populator controller: external volume population

**Resource controllers:**
- Import controller: manages importer pods
- Clone controller: manages cloner pods
- Upload controller: manages upload server pods
- Config controller: watches CDI config changes
- StorageProfile controller: auto-detects storage class capabilities
- DataImportCron controller: scheduled imports
- DataSource controller: manages DataSource resources
- ObjectTransfer controller: cross-namespace transfers

**Volume populator controllers:**
- Import, upload, clone, and Forklift populator controllers

Like KubeVirt, CDI detects OpenShift (`isOpenShift()` checks for ClusterVersion CRD) and adjusts behavior, adding Route watches and OpenShift-specific cache options.

## Communication

```
User
  │
  ├── oc apply DataVolume ──► kube-apiserver ──► cdi-apiserver (webhook)
  │                                │
  │                                │ (watch)
  │                                ▼
  │                          cdi-controller
  │                                │
  │                                │ (creates pod)
  │                                ▼
  │                          cdi-importer pod
  │                                │
  │                                │ (writes to PVC)
  │                                ▼
  │                             PVC ──► used by virt-launcher
  │
  └── virtctl image-upload ──► cdi-uploadproxy ──► cdi-uploadserver pod ──► PVC
```

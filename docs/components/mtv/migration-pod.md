# MTV Migration Pod

How the migration pod works, what it connects to, and what code runs inside it.

## Pod Structure

When MTV executes a migration, it creates a pod with this structure:

```
┌─────────────────────────────────────────────────────────────┐
│ Migration Pod                                                │
├─────────────────────────────────────────────────────────────┤
│ Init Containers:                                             │
│   ┌──────────────────────────────────────────────────┐      │
│   │ vddk-side-car (if VDDK enabled)                  │      │
│   │ - Copies VDDK libs from VDDK image to /opt       │      │
│   │ - Image: <registry>/vddk:latest                  │      │
│   │ - Mounts: EmptyDir at /opt                       │      │
│   └──────────────────────────────────────────────────┘      │
│                                                              │
│ Main Container:                                              │
│   ┌──────────────────────────────────────────────────┐      │
│   │ virt-v2v                                         │      │
│   │ - Runs virt-v2v-monitor and virt-v2v            │      │
│   │ - Connects to source via libvirt API             │      │
│   │ - Downloads disks via VDDK (for vSphere)         │      │
│   │ - Converts disks (installs VirtIO drivers)       │      │
│   │ - Runs virt-v2v-inspector                        │      │
│   │ - Runs virt-customize                            │      │
│   │ - Exposes metrics on port 2112                   │      │
│   └──────────────────────────────────────────────────┘      │
│                                                              │
│ Volumes:                                                     │
│   - secret-volume: Provider credentials mounted at           │
│     /etc/secret                                              │
│   - vddk-volume: EmptyDir at /opt (shared with init)        │
│   - conversion-temp-storage: Ephemeral PVC at                │
│     /var/tmp/virt-v2v (optional)                             │
│   - Target disk PVCs (one per source disk)                   │
└─────────────────────────────────────────────────────────────┘
```

Code reference: `forklift/pkg/controller/conversion/builder.go:31-224`

## What the Pod Connects To

### vSphere/ESXi Migrations

The pod connects to ESXi or vCenter using the **libvirt vSphere driver**. The connection URL format depends on the topology:

**Standalone ESXi host:**
```
esx://root@192.168.1.10/?no_verify=1
```

**vCenter-managed host:**
```
vpx://administrator@vsphere.local@vcenter.example.com/Datacenter/Cluster/esxi-host.example.com?cacert=/opt/ca-bundle.crt
```

The URL is built in `forklift/pkg/controller/plan/adapter/vsphere/builder.go:362-439`:
- `esx://` scheme for standalone ESXi
- `vpx://` scheme for vCenter
- Path contains the datacenter/cluster/host hierarchy (vCenter only)
- Query string either disables TLS verification (`no_verify=1`) or points to a CA cert

### Authentication

Provider credentials are mounted from a Kubernetes Secret at `/etc/secret`. The virt-v2v container reads these and passes them to libvirt via the `-ip` (password) flag.

Environment variables set by the controller (`forklift/pkg/controller/plan/adapter/vsphere/builder.go:270-290`):
- `V2V_libvirtURL`: Full libvirt connection URL
- `V2V_fingerprint`: TLS fingerprint/thumbprint for VDDK
- `V2V_vmName`: Name of the VM to migrate
- `V2V_source`: Migration source type (vsphere, ova, hyperv)
- Credentials come from the secret mounted as env vars with `V2V_` prefix

### VDDK Connection

When VDDK is available (`/opt/vmware-vix-disklib-distrib` exists), virt-v2v uses the VMware Virtual Disk Development Kit to transfer disk data directly from the ESXi datastore. This bypasses the slow HTTP endpoint.

VDDK connection parameters passed to virt-v2v:
```
-it vddk
-io vddk-libdir=/opt/vmware-vix-disklib-distrib
-io vddk-thumbprint=<fingerprint>
-io vddk-config=/mnt/vddk-conf/vddk-config-file  (optional)
```

Code reference: `forklift/pkg/virt-v2v/conversion/conversion.go:234-243`

## The Conversion Pipeline

The main container (`cmd/virt-v2v/entrypoint.go`) runs this sequence:

### 1. Setup Phase
```go
linkCertificates()   // Symlink provider CA cert to /opt/ca-bundle.crt
createV2vOutputDir() // Create /mnt/disks/output
```

### 2. Conversion Phase (Cold Migration)

Runs `virt-v2v` with the kubevirt output driver:

```bash
virt-v2v -v -x \
  -o kubevirt \
  -os /mnt/disks/output \
  -on <vm-name> \
  -i libvirt \
  -ic esx://root@192.168.1.10/?no_verify=1 \
  -ip <password> \
  --hostname 192.168.1.10 \
  -it vddk \
  -io vddk-libdir=/opt/vmware-vix-disklib-distrib \
  -io vddk-thumbprint=<fingerprint> \
  -- <vm-name>
```

This command:
- Connects to ESXi via libvirt's ESX driver (`-ic esx://...`)
- Uses VDDK to download disk images (`-it vddk`, `-io vddk-libdir=...`)
- Converts the disks to raw format with VirtIO drivers installed
- Writes converted disks to PVCs mounted at `/mnt/disks/disk*`
- Generates a `domain.xml` describing the VM configuration

Output from virt-v2v is piped to `virt-v2v-monitor`, which parses progress and exposes it via Prometheus metrics on port 2112.

Code reference: `forklift/pkg/virt-v2v/conversion/conversion.go:302-339`

### 3. Inspection Phase

After conversion, runs `virt-v2v-inspector` to gather metadata about the converted guest OS:

```bash
virt-v2v-inspector -v -x \
  -if raw \
  -i disk \
  -O /tmp/inspection.xml \
  /mnt/disks/disk0 /mnt/disks/disk1 ...
```

Outputs XML with OS family, version, installed packages, hostname, etc. The controller reads this to populate VM metadata.

Code reference: `forklift/pkg/virt-v2v/conversion/conversion.go:124-144`

### 4. Customization Phase

Runs `virt-customize` to inject qemu-guest-agent and other post-conversion tweaks. If the package manager is unavailable (no network, missing repos), this step fails gracefully with a warning.

Code reference: `forklift/pkg/virt-v2v/conversion/conversion.go:341-348`

### 5. Server Phase (Local Migrations Only)

For same-cluster migrations, the pod starts an HTTP server that the controller polls to retrieve the inspection XML and domain XML. The controller signals the pod to terminate once it has the data.

For remote migrations (different cluster), the pod just exits after writing the files to shared storage.

Code reference: `cmd/virt-v2v/entrypoint.go:103-112`

## In-Place Conversion

For migrations where the disks are already populated (like oVirt imageio transfers or EC2 imports), MTV uses `virt-v2v-in-place` instead of `virt-v2v`. This skips the disk transfer step and converts the PVCs directly:

```bash
virt-v2v-in-place -v -x \
  -i disk \
  /mnt/disks/disk0 /mnt/disks/disk1
```

The disks are modified in place. No separate output directory.

Code reference: `forklift/pkg/virt-v2v/conversion/conversion.go:164-193`

## Resource Limits

Default resource requests/limits for the virt-v2v container (configurable via ForkliftController settings):

- **CPU**: 1 core request, 4 cores limit
- **Memory**: 1 GiB request, 4 GiB limit
- **KVM device**: Optional. When enabled (`requestKVM: true`), the pod requests `devices.kubevirt.io/kvm` and lands on a node with `/dev/kvm`. This allows virt-v2v's appliance to use hardware virtualization instead of emulation, which is much faster.

Code reference: `forklift/pkg/controller/conversion/builder.go:186-194, 546-566`

## Security Context

The pod runs as:
- **User**: 107 (qemu user)
- **FSGroup**: 107 (qemu group)
- **Capabilities**: All dropped
- **Seccomp**: `unshare.json` profile on OpenShift, `RuntimeDefault` elsewhere

The VDDK init container runs with the same restrictions. No privilege escalation allowed.

Code reference: `forklift/pkg/controller/conversion/builder.go:56-59, 129-132`

## Network Annotations

MTV supports dedicated migration networks via Multus. When configured, the pod gets annotations like:

```yaml
k8s.v1.cni.cncf.io/networks: migration-network
```

This allows disk transfers to run on a separate physical network, avoiding contention with cluster control plane traffic.

Code reference: `forklift/pkg/controller/conversion/builder.go:137-139`

## What We Didn't Have Documented

- The libvirt connection details (esx:// vs vpx:// schemes, path structure for vCenter)
- The init container copying VDDK libraries to an emptyDir
- The virt-v2v-monitor process that parses stdout
- The metrics server on port 2112
- The inspection and customization phases after conversion
- The HTTP server that runs in local migrations for the controller to poll
- In-place conversion for pre-populated disks
- KVM device request for hardware acceleration
- Detailed command-line arguments passed to virt-v2v

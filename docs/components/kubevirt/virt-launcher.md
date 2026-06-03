# virt-launcher

**Pod (one per running VMI).** The per-VM sandbox.

- Image: `quay.io/kubevirt/virt-launcher:v1.8.2`
- Source: [`cmd/virt-launcher`](https://github.com/kubevirt/kubevirt/tree/main/cmd/virt-launcher), [`pkg/virt-launcher`](https://github.com/kubevirt/kubevirt/tree/main/pkg/virt-launcher)

## What runs inside

```
PID 1: virt-launcher-monitor
  PID 8: virt-launcher
    |-- virtqemud    (QEMU-specific libvirt daemon)
    |-- virtlogd     (libvirt log daemon)
  PID 88: qemu-kvm   (the VM, with one thread per vCPU)
```

PID 1 is actually `virt-launcher-monitor`, not virt-launcher itself. The monitor supervises the launcher, watches the QEMU process, and handles graceful shutdown. virt-launcher (PID 8) manages virtqemud, virtlogd, and the gRPC cmd-server.

## virtqemud

virtqemud is a libvirt daemon that runs inside the compute container as a child process of virt-launcher. It is the QEMU-specific modular daemon from the libvirt project (as opposed to the older monolithic `libvirtd` that handled every hypervisor type). Each virt-launcher pod runs its own instance. There is no shared daemon on the node.

What virtqemud does:
- Accepts domain definitions via the libvirt API over a local Unix socket
- Translates domain XML into QEMU command line flags
- Forks and manages the `qemu-kvm` process
- Maintains a QMP (QEMU Monitor Protocol) connection to the running QEMU for runtime operations: hotplug, migration, pause, screenshots, memory dump
- Reports lifecycle events back to the API caller (virt-launcher)

The virtqemud binary is baked into the `quay.io/kubevirt/virt-launcher` image. It is not part of the KubeVirt codebase. It comes from the libvirt project.

## gRPC cmd-server

virt-launcher runs a gRPC server (`pkg/virt-launcher/virtwrap/cmd-server/server.go`) that receives commands from virt-handler. When `SyncVirtualMachine` is called:

1. **Deserialize**: extracts the VMI spec from the protobuf request
2. **Convert**: `converter.Convert_v1_VirtualMachineInstance_To_api_Domain()` transforms the VMI spec into a Go struct representing libvirt domain XML (`pkg/virt-launcher/virtwrap/converter/`)
3. **Hooks**: `SetDomainSpecStrWithHooks()` gives hook sidecars a chance to modify the domain spec, then serializes the Go struct to an XML string
4. **Define**: `DomainDefineXML(xml)` sends the XML string to virtqemud over a local Unix socket. No file is written to disk. virtqemud holds the definition in memory.
5. **Pre-start hook**: sets up disks, network devices, allocates hotplug ports
6. **Start**: `dom.CreateWithFlags()` tells virtqemud to start the domain. virtqemud reads the in-memory definition, generates the QEMU command line, and forks the `qemu-kvm` process.

The domain manager is at `pkg/virt-launcher/virtwrap/manager.go`, with the core function `SyncVMI()` (~line 1328).

## KubeVirt does not generate QEMU command lines

KubeVirt never constructs QEMU flags. The converter produces libvirt domain XML, which is a declarative description of the VM: what disks it has, what network interfaces, how much memory, etc. For example, the containerDisk in our cirros VM becomes this XML:

```xml
<disk type='file' device='disk' model='virtio-non-transitional'>
  <driver name='qemu' type='qcow2' cache='none' error_policy='stop' discard='unmap'/>
  <source file='/var/run/kubevirt-ephemeral-disks/disk-data/containerdisk/disk.qcow2'/>
  <backingStore type='file'>
    <format type='qcow2'/>
    <source file='/var/run/kubevirt/container-disks/disk_0.img'/>
    <backingStore/>
  </backingStore>
  <target dev='vda' bus='virtio'/>
  <alias name='ua-containerdisk'/>
</disk>
```

virtqemud reads this XML and generates the actual QEMU command line: the four `-blockdev` entries (two protocol layers, two format layers for the backing chain), the `-device` for virtio-blk, `bootindex=1` (libvirt's default for the first hard disk), cache/discard flags, and everything else. virtqemud then forks the `qemu-kvm` process with those flags. QEMU is a child process of virtqemud.

This separation matters because libvirt handles QEMU version differences, flag deprecations, and platform-specific behavior. KubeVirt describes intent in XML. libvirt figures out how to express that intent to the specific QEMU binary installed in the container.

## What the QEMU command line looks like

For a simple containerDisk VM with 128Mi RAM, virtqemud generates flags including:

- **Machine type**: `pc-q35-rhel9.8.0` (Q35 chipset, PCIe)
- **CPU**: host model passthrough, 1 vCPU with max 4 sockets for hotplug
- **Memory**: `memory-backend-ram` with exact guest size
- **SMBIOS**: manufacturer=KubeVirt, serial=VM UID
- **Disks**: `virtio-blk-pci-non-transitional` devices
  - containerDisk: read-only qcow2 base + read-write qcow2 overlay (copy-on-write)
  - cloudInit: NoCloud ISO, raw format
- **Network**: TAP device with vhost, `virtio-net-pci-non-transitional`
- **Console**: serial port on a Unix socket, logged by virtlogd
- **VNC**: Unix socket at `/var/run/kubevirt-private/<uid>/virt-vnc`
- **PCIe root ports**: 10 pre-allocated for hotplug
- **Sandbox**: QEMU seccomp sandbox enabled, privilege escalation denied
- **Balloon**: `virtio-balloon-pci-non-transitional` with free-page-reporting

## Security context

virt-launcher runs with restricted permissions, in contrast to virt-handler's privileged access:

- Runs as UID/GID 107 (qemu), non-root
- `allowPrivilegeEscalation: false`
- Drops ALL capabilities except `NET_BIND_SERVICE`
- QEMU runs under its own seccomp sandbox (`-sandbox on,obsolete=deny,elevateprivileges=deny,spawn=deny,resourcecontrol=deny`)

## Hook sidecars

For customizations not exposed by the VMI spec, KubeVirt supports hook sidecar containers that run alongside virt-launcher. These communicate over gRPC and can intercept the `onDefineDomain` hook to modify libvirt domain XML before the VM starts.

## Key code paths

| File | What it does |
|------|-------------|
| `cmd/virt-launcher-monitor/` | PID 1 supervisor process |
| `pkg/virt-launcher/virtwrap/cmd-server/server.go` | gRPC server, receives commands from virt-handler |
| `pkg/virt-launcher/virtwrap/manager.go` | `LibvirtDomainManager`: `SyncVMI()`, `lookupOrCreateVirDomain()`, `startDomain()` |
| `pkg/virt-launcher/virtwrap/converter/` | VMI spec to libvirt domain XML conversion |

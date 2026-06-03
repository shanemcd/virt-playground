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

## gRPC cmd-server

virt-launcher runs a gRPC server (`pkg/virt-launcher/virtwrap/cmd-server/server.go`) that receives commands from virt-handler. When `SyncVirtualMachine` is called:

1. **Deserialize**: extracts the VMI spec from the protobuf request
2. **Convert**: `converter.Convert_v1_VirtualMachineInstance_To_api_Domain()` transforms the VMI spec into libvirt domain XML (`pkg/virt-launcher/virtwrap/converter/`)
3. **Define**: `lookupOrCreateVirDomain()` calls `virConn.DefineDomain()` to register the domain with virtqemud
4. **Pre-start hook**: sets up disks, network devices, allocates hotplug ports
5. **Start**: `startDomain()` calls `dom.CreateWithFlags()`, which tells virtqemud to start the domain

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

## Why virtqemud instead of libvirtd

Modern KubeVirt uses `virtqemud`, the QEMU-specific modular daemon from the libvirt project, rather than the monolithic `libvirtd`. This reduces attack surface and resource footprint. Each pod has its own instance; there is no shared node-wide daemon.

## Hook sidecars

For customizations not exposed by the VMI spec, KubeVirt supports hook sidecar containers that run alongside virt-launcher. These communicate over gRPC and can intercept the `onDefineDomain` hook to modify libvirt domain XML before the VM starts.

## Key code paths

| File | What it does |
|------|-------------|
| `cmd/virt-launcher-monitor/` | PID 1 supervisor process |
| `pkg/virt-launcher/virtwrap/cmd-server/server.go` | gRPC server, receives commands from virt-handler |
| `pkg/virt-launcher/virtwrap/manager.go` | `LibvirtDomainManager`: `SyncVMI()`, `lookupOrCreateVirDomain()`, `startDomain()` |
| `pkg/virt-launcher/virtwrap/converter/` | VMI spec to libvirt domain XML conversion |

# The Full Virtualization Stack

This document walks through the entire stack bottom-up: from hardware virtualization extensions through KVM, QEMU, libvirt, and virtio, up to KubeVirt and OpenShift Virtualization. The goal is to understand what each layer does and why it exists.

## Hardware: CPU Virtualization Extensions

Modern x86 CPUs ship with hardware virtualization extensions (Intel VT-x, AMD-V) that allow a hypervisor to run guest code directly on the CPU in a restricted "non-root" mode.

The core execution loop is:

1. **VMENTER**: The hypervisor prepares a Virtual Machine Control Structure (VMCS on Intel, VMCB on AMD) containing guest register state and intercept configuration, then executes `VMLAUNCH`/`VMRESUME`. The CPU saves host state, loads guest state, and begins executing guest instructions at native speed.

2. **Guest execution**: The guest runs directly on the CPU. Most instructions execute without hypervisor involvement.

3. **VMEXIT**: When the guest attempts a privileged operation, accesses an intercepted resource, or triggers a configured intercept, the CPU halts guest execution, saves guest state back to the VMCS, restores host state, and returns control to the hypervisor. The VMCS exit-reason field identifies what happened.

The hypervisor handles the exit (updating page tables, emulating a device access, etc.) and re-enters the guest. This loop is the heartbeat of hardware-assisted virtualization.

### Memory Virtualization: EPT/NPT

Without hardware assistance, the hypervisor would need to intercept every guest page table modification (shadow page tables), which is extremely expensive. Intel EPT (Extended Page Tables) and AMD NPT (Nested Page Tables) solve this with two-dimensional paging:

- **First dimension**: Guest page tables translate Guest Virtual Addresses (GVA) to Guest Physical Addresses (GPA), managed entirely by the guest OS
- **Second dimension**: EPT/NPT tables translate GPA to Host Physical Addresses (HPA), managed by the hypervisor

The hardware walks both sets of tables on a TLB miss. An EPT violation (unmapped GPA) causes a VM exit to the hypervisor, which fills in the mapping. Critically, guest page table operations like CR3 loads and `invlpg` do NOT cause VM exits under EPT, which is a massive performance win over shadow page tables.

### IOMMU (VT-d / AMD-Vi)

The IOMMU does for device DMA what the MMU does for CPU memory access: it translates and restricts DMA addresses. When a physical device is passed through to a VM, the IOMMU ensures the device can only DMA to memory belonging to that VM. Without IOMMU, a passed-through device could read or write arbitrary host memory.

## KVM: The Linux Kernel as Hypervisor

KVM is a pair of Linux kernel modules (`kvm.ko` plus `kvm-intel.ko` or `kvm-amd.ko`) that expose hardware virtualization to userspace via `/dev/kvm`. When loaded, they turn the Linux kernel itself into a hypervisor: VMs run as regular Linux processes, scheduled alongside everything else by the standard kernel scheduler.

### The /dev/kvm API

KVM's interface is entirely file-descriptor-based ioctls, organized into four levels:

1. **System fd** (`open("/dev/kvm")`) - global queries, `KVM_CREATE_VM`
2. **VM fd** (`KVM_CREATE_VM`) - memory layout, vCPU creation, device creation
3. **vCPU fd** (`KVM_CREATE_VCPU`) - register access, `KVM_RUN`
4. **Device fd** (`KVM_CREATE_DEVICE`) - in-kernel device emulation

A minimal VM creation sequence:

```
open("/dev/kvm")                         -> system fd
ioctl(sys_fd, KVM_CREATE_VM)             -> vm fd
ioctl(vm_fd, KVM_SET_USER_MEMORY_REGION) -> map host memory as guest RAM
ioctl(vm_fd, KVM_CREATE_VCPU)           -> vcpu fd
mmap(vcpu_fd)                            -> shared struct kvm_run
ioctl(vcpu_fd, KVM_SET_REGS)            -> initialize registers
ioctl(vcpu_fd, KVM_RUN)                 -> enter the guest (blocks until VM exit)
```

The `struct kvm_run` is a shared-memory region between kernel and userspace. On each VM exit, KVM fills it with the exit reason (`KVM_EXIT_IO`, `KVM_EXIT_MMIO`, `KVM_EXIT_HLT`, etc.) and returns from the ioctl. Userspace handles the exit and re-enters.

KVM handles many exit reasons entirely in kernel space (EPT violations, MSR accesses, some hypercalls). Only exits requiring device emulation or complex logic get forwarded to userspace.

### Why KVM Matters for KubeVirt

Since KVM VMs are just Linux processes, they can be placed inside a container's cgroup and namespace boundaries. Kubernetes sees a pod; inside the pod is a QEMU process running a full virtual machine. This is the fundamental insight that makes KubeVirt possible.

## QEMU: The Virtual Machine Monitor

QEMU is the userspace component. When paired with KVM, it delegates CPU execution and memory virtualization to the kernel but handles everything else: device emulation, VM lifecycle, firmware, machine topology, migration, and the management interface (QMP).

### With vs. Without KVM

Without KVM, QEMU uses its Tiny Code Generator (TCG), a JIT binary translator. TCG can emulate any architecture on any host but is orders of magnitude slower than native execution. With KVM (`-accel kvm`), guest code runs directly on the CPU via VMENTER/VMEXIT. QEMU only gets involved when an exit requires device emulation.

### Threading Model

A running QEMU process contains:

| Thread | Purpose |
|--------|---------|
| Main loop | Event loop, QMP monitor, device emulation dispatch |
| vCPU threads (`CPU 0/KVM`, `CPU 1/KVM`, ...) | Each calls `KVM_RUN` in a tight loop |
| IOThreads | Dedicated event loops for virtio device I/O |
| Worker threads | Thread pool for async disk I/O |
| Migration thread | Live migration data transfer |

Each vCPU is a real OS thread that can run on its own physical core, giving true SMP. vCPU threads spend most of their time inside `KVM_RUN` and only interact with the main loop when a VM exit requires device emulation.

### Guest RAM

Guest RAM is a large `mmap`'d region in the QEMU process's address space. A 4 GB VM means QEMU maps 4 GB of virtual memory. The host kernel allocates physical pages on demand. KVM's `KVM_SET_USER_MEMORY_REGION` ioctl tells KVM how guest physical addresses map to QEMU's virtual address space. KVM builds EPT entries that compose this mapping with the host's own page tables.

From the host kernel's perspective, this is normal process memory. It can be:

- **Swapped** (unless backed by huge pages)
- **Merged** via KSM (Kernel Same-page Merging), where `ksmd` scans for identical pages across VMs and collapses them copy-on-write
- **Backed by huge pages** (2 MB or 1 GB), reducing TLB pressure and page table overhead at the cost of flexibility

### Device Emulation

When a guest accesses an I/O port or MMIO region, KVM returns to QEMU with `KVM_EXIT_IO` or `KVM_EXIT_MMIO`. QEMU dispatches to the appropriate device model. QEMU emulates a full PC platform: chipset (i440FX or Q35), PCI bus, disk controllers, NICs, VGA, USB, serial ports, and more.

The expensive path is: guest -> KVM kernel -> QEMU userspace -> back. Modern optimizations (vhost, in-kernel APIC, posted interrupts) keep hot paths entirely in kernel space, avoiding the userspace round-trip.

## libvirt: The Management Layer

libvirt sits above QEMU/KVM and provides a stable API for managing VMs ("domains"). It translates high-level operations (define a VM, start it, migrate it) into specific QEMU command-line arguments and QMP commands.

A VM is defined as an XML document specifying CPU, memory, disks, NICs, firmware, and other hardware. libvirt converts this into a `qemu-system-*` command line, launches the process, and communicates with it via QMP for ongoing management.

### Traditional vs. KubeVirt Architecture

**Traditional**: A single `libvirtd` daemon runs on the host, managing all VMs. All QEMU processes are children of this daemon.

**KubeVirt**: Each VM gets its own pod, and inside that pod runs a dedicated `virtqemud` instance (the QEMU-specific modular daemon, not the full `libvirtd`). There is no system-wide libvirt daemon. Each per-pod instance manages exactly one QEMU process.

This inversion is necessary because Kubernetes needs to own the lifecycle and resource accounting. If a shared libvirtd ran on the host and spawned QEMU processes outside of pods, Kubernetes would have no visibility into VM resource usage.

## virtio: Paravirtualized I/O

Emulating real hardware is expensive. Every register access to an emulated IDE controller or e1000 NIC causes a VM exit. virtio is a standardized paravirtualization framework that replaces hardware emulation with an explicit host-guest communication protocol, minimizing exits.

### The virtqueue/vring Mechanism

Each virtio device has one or more **virtqueues**, backed by a **vring** data structure in shared memory (guest RAM accessible to both guest and host). The vring has three parts:

1. **Descriptor Table**: Array of `{addr, len, flags, next}` entries. Descriptors chain to form scatter-gather lists. Addresses are guest physical addresses pointing to data buffers.
2. **Available Ring**: The guest writes descriptor chain heads here to submit requests.
3. **Used Ring**: The host writes completed descriptor chain heads here to return results.

### Example: virtio-blk Disk Read

1. Guest block driver builds a descriptor chain: a request header (sector number, operation type), a data buffer, and a status byte
2. Guest adds the chain to the available ring and writes to the doorbell (a PCI MMIO address), causing a single VM exit
3. QEMU reads the available ring, follows the chain, reads data from the backing store, writes it into the guest's data buffer
4. QEMU adds the chain to the used ring and injects an interrupt into the guest
5. Guest interrupt handler processes the used ring

Compared to emulated hardware, virtio batches operations. Multiple requests can be queued with a single doorbell write. Notification suppression lets either side say "don't interrupt me until you've processed N more entries."

### vhost: Moving the Backend into the Kernel

For networking, the virtio backend can move from QEMU userspace into the host kernel as `vhost-net`. The kernel thread accesses the vring in guest memory directly, bypassing QEMU for the data plane. Notifications use `irqfd` and `ioeventfd`, so the hot path is entirely guest kernel to host kernel with no userspace context switches.

For high-performance NFV workloads, `vhost-user` moves the backend to a separate userspace process (typically OVS-DPDK). Guest RAM is allocated as shared huge pages, and the DPDK poll-mode driver polls the vring directly, avoiding interrupts entirely.

## Device Passthrough: VFIO and SR-IOV

### VFIO

VFIO is the Linux kernel framework for securely assigning physical devices to userspace processes (including VMs). It provides direct access to device MMIO BARs, PCI config space, and interrupt delivery, while the IOMMU restricts DMA to the VM's memory.

The data path comparison:
- **Emulated I/O**: guest driver -> VM exit -> KVM -> QEMU -> host driver -> hardware
- **VFIO passthrough**: guest driver -> hardware directly (DMA addresses remapped by IOMMU)

### SR-IOV

SR-IOV (Single Root I/O Virtualization) lets a single physical device present itself as multiple independent virtual devices:

- **Physical Function (PF)**: The full PCIe function. The PF driver manages the device and controls VF creation.
- **Virtual Function (VF)**: A lightweight PCIe function with its own BARs, config space, and hardware queues, sharing the physical link with the PF.

Each VF looks like an independent PCI device. VFs are assigned to different VMs via VFIO. The VM runs the standard NIC driver and gets near-native performance because the data path goes directly to hardware, bypassing the hypervisor entirely.

## KubeVirt: VMs as Kubernetes-Native Objects

KubeVirt is a set of Kubernetes operators, CRDs, and APIs that extend the Kubernetes control plane to manage virtual machines. It exploits the fact that QEMU/KVM VMs are Linux processes that can run inside a pod's cgroup and namespace boundaries.

### The Three-Object Model

A running KubeVirt VM is three Kubernetes objects stacked:

1. **VirtualMachine (VM)**: The persistent, stateful definition. Survives stop/start cycles and node failures. Analogous to a StatefulSet of size one.
2. **VirtualMachineInstance (VMI)**: The ephemeral, running instance. Exists only while the VM is running. Analogous to a Pod.
3. **Pod**: The virt-launcher pod that hosts the QEMU process.

### Key CRDs

| CRD | Purpose |
|-----|---------|
| `VirtualMachine` | Persistent VM definition with run strategy |
| `VirtualMachineInstance` | Running VM instance |
| `VirtualMachineInstanceReplicaSet` | Maintains N identical VMIs (like ReplicaSet) |
| `VirtualMachinePool` | Maintains N VMs, each with its own storage (like Deployment) |
| `VirtualMachineInstanceMigration` | Request to live-migrate a VMI |

### Run Strategies

The `spec.runStrategy` field controls VM lifecycle:

- `Always`: VM is restarted if it stops for any reason
- `RerunOnFailure`: VM is restarted only on failure, not clean shutdown
- `Manual`: VM responds only to explicit start/stop/restart commands
- `Halted`: VM should not be running

### Components

KubeVirt has five main components, all running as pods:

- **virt-operator**: Installs, upgrades, and manages the lifecycle of all other components
- **virt-api**: HTTP API server with admission webhooks and subresource endpoints (start, stop, console, VNC, migrate)
- **virt-controller**: Cluster-level controller (Deployment) that reconciles VM/VMI resources, creates virt-launcher pods, orchestrates migrations
- **virt-handler**: Per-node DaemonSet that bridges the Kubernetes API and libvirt. Communicates with virt-launcher via gRPC over Unix domain sockets.
- **virt-launcher**: One per VMI. Hosts the QEMU process, virtqemud, and virtlogd. Provides the cgroup/namespace sandbox.

### What Happens When You Create a VM

1. User creates a `VirtualMachine` with `runStrategy: Always`
2. virt-controller sees the VM, creates a `VirtualMachineInstance` from the VM's template
3. virt-controller generates a pod manifest and creates the virt-launcher pod
4. Kubernetes scheduler places the pod on a node
5. virt-launcher starts, initializes virtqemud, opens gRPC socket
6. virt-handler on the node connects via gRPC, calls `SyncVirtualMachine()`
7. The VMI spec is converted to libvirt domain XML
8. virtqemud creates the domain and starts QEMU/KVM
9. The VM boots. VMI status is updated with runtime state.

### The virt-launcher Pod Internals

Inside a virt-launcher pod:

```
PID 1: virt-launcher
  |-- virtqemud    (libvirt's QEMU-specific daemon)
  |-- virtlogd     (libvirt's log daemon)
  |-- qemu-kvm     (the actual VM process, with N vCPU threads)
```

The pod provides cgroup limits (CPU, memory) and namespace isolation (network, PIDs, mounts). The QEMU process inherits all of these. Kubernetes resource accounting works naturally because QEMU is just a process inside the pod's cgroup.

If Kubernetes tries to terminate the pod, virt-launcher intercepts the signal, forwards it to QEMU for graceful shutdown, and holds off pod termination until the VM exits.

### The Translation Chain

KubeVirt is fundamentally a translation engine:

```
VMI spec (YAML) -> Pod spec -> libvirt domain XML -> QEMU command-line arguments
```

At each layer, Kubernetes abstractions map to virtualization abstractions.

## OpenShift Virtualization: The Product

OpenShift Virtualization is Red Hat's productization of KubeVirt. Red Hat created KubeVirt and contributed it to the CNCF. The product follows an upstream-first model: features are developed in the open source project and then included in the supported product.

### What Red Hat Adds

**HyperConverged Operator (HCO)**: A single operator that deploys and manages the entire stack. One `HyperConverged` CR is the source of truth, and HCO generates child CRs for the KubeVirt operator, CDI operator, Cluster Network Addons Operator, and SSP Operator. This "operator of operators" pattern prevents configuration drift between interdependent components.

**SSP Operator**: Deploys curated VM templates (RHEL, Fedora, CentOS, Windows), default boot sources (auto-downloaded base OS images), a template validator webhook, and Tekton pipeline tasks for VM automation.

**Instance Types and Preferences**: Predefined CPU/memory combinations (analogous to cloud instance types) that simplify VM creation.

**Enhanced Web Console**: Dedicated Virtualization section with guided VM creation, topology views, console access (VNC/serial), and monitoring dashboards.

**Migration Toolkit for Virtualization (MTV)**: Orchestrates bulk migration of VMs from VMware, RHV, OpenStack, and other sources.

**Windows SVVP Certification**: Windows guests are jointly supported by Red Hat and Microsoft.

**Curated API Surface**: Experimental or unstable upstream features are excluded from the supported surface area, providing stability guarantees.

**Enterprise Hardening**: FIPS compliance, Prometheus/Alertmanager integration, RBAC, audit logging, and Red Hat's security response process.

**OpenShift Virtualization Engine**: A lower-cost subscription tier for organizations that only need virtualization without the full container application platform.

### The Full Stack Diagram

```
                    OpenShift Virtualization (Product)
                              |
                    HyperConverged Operator (HCO)
                     /        |        \        \
              KubeVirt      CDI     Network    SSP
              Operator    Operator   Addons   Operator
                |            |         |        |
           virt-api     cdi-importer  Multus  Templates
           virt-controller            Bridge  Boot Sources
           virt-handler               SR-IOV
           virt-launcher
                |
           virtqemud + QEMU/KVM
                |
         Linux kernel (KVM modules)
                |
         CPU (VT-x/AMD-V, EPT/NPT) + IOMMU + SR-IOV NICs
```

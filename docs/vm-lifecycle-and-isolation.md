# VM Lifecycle and Isolation

How a VM actually starts at the hardware and kernel level, how the host manages the running process, and what keeps the guest isolated.

## How a VM Starts

### The KVM API Sequence

Everything starts with `/dev/kvm`. Here's the sequence of system calls that creates and launches a virtual machine:

**1. Open the KVM subsystem**

```c
int kvm_fd = open("/dev/kvm", O_RDWR);
```

This returns a file descriptor for the KVM subsystem. No VM exists yet.

**2. Create a VM**

```c
int vm_fd = ioctl(kvm_fd, KVM_CREATE_VM, 0);
```

KVM allocates kernel data structures for a new VM: an address space ID, an empty set of memory slots, interrupt routing tables, and an empty set of vCPUs. The returned file descriptor represents this VM.

At this point the VM exists in the kernel but has no memory, no CPUs, and nothing to execute.

**3. Map guest memory**

```c
struct kvm_userspace_memory_region region = {
    .slot = 0,
    .guest_phys_addr = 0,
    .memory_size = 4ULL * 1024 * 1024 * 1024,  // 4 GB
    .userspace_addr = (uint64_t)mmap(NULL, 4ULL * 1024 * 1024 * 1024,
                                      PROT_READ | PROT_WRITE,
                                      MAP_PRIVATE | MAP_ANONYMOUS, -1, 0),
};
ioctl(vm_fd, KVM_SET_USER_MEMORY_REGION, &region);
```

This is the critical step that defines the guest's physical memory. The caller (QEMU) allocates a region of its own virtual address space with `mmap` and tells KVM: "guest physical addresses starting at 0, for 4 GB, map to this region of my process memory."

KVM records this mapping in a "memory slot" table. Later, when it builds EPT entries, it uses these slots to translate guest physical addresses to host virtual addresses, which the host's own page tables then resolve to host physical addresses.

The guest will see a flat 4 GB physical address space. It has no idea this is backed by a chunk of a userspace process's virtual memory.

**4. Create a vCPU**

```c
int vcpu_fd = ioctl(vm_fd, KVM_CREATE_VCPU, 0);  // vCPU index 0
```

KVM allocates a VMCS (Intel) or VMCB (AMD) for this vCPU, plus associated kernel structures. The VMCS is the hardware data structure the CPU uses to save and restore state during VM entries and exits. Each vCPU gets its own.

**5. Map the shared run structure**

```c
int mmap_size = ioctl(kvm_fd, KVM_GET_VCPU_MMAP_SIZE, 0);
struct kvm_run *run = mmap(NULL, mmap_size, PROT_READ | PROT_WRITE,
                           MAP_SHARED, vcpu_fd, 0);
```

This maps a shared memory page between the kernel and userspace. When the guest exits, KVM writes the exit reason and associated data into this structure before returning from `KVM_RUN`. This avoids a separate ioctl to fetch exit information, saving a system call on every VM exit.

**6. Initialize CPU registers**

```c
struct kvm_sregs sregs;
ioctl(vcpu_fd, KVM_GET_SREGS, &sregs);
// Set up segment registers, control registers, page tables...
sregs.cr0 = 0x80050033;  // Protected mode, paging enabled, etc.
ioctl(vcpu_fd, KVM_SET_SREGS, &sregs);

struct kvm_regs regs = {
    .rip = 0x100000,    // Entry point
    .rflags = 0x2,      // Required initial value
};
ioctl(vcpu_fd, KVM_SET_REGS, &regs);
```

This sets the vCPU's initial state: the instruction pointer (where to start executing), control registers (paging mode, protection mode), segment registers, and flags. In practice, QEMU sets these to match what the firmware (BIOS/UEFI) expects, and the firmware then sets up the environment for the guest OS.

**7. Enter the guest**

```c
while (1) {
    ioctl(vcpu_fd, KVM_RUN, 0);

    switch (run->exit_reason) {
    case KVM_EXIT_IO:
        // Handle port I/O (emulate a device)
        break;
    case KVM_EXIT_MMIO:
        // Handle memory-mapped I/O
        break;
    case KVM_EXIT_HLT:
        // Guest executed HLT
        break;
    case KVM_EXIT_SHUTDOWN:
        return;
    }
}
```

This is the core loop. `KVM_RUN` blocks, enters the guest, and only returns when something happens that the kernel can't handle on its own.

### What Happens During VMENTER

When `KVM_RUN` executes, here's what the CPU does at the hardware level:

1. **KVM prepares the VMCS.** It writes the guest's register state (from the last exit, or the initial values), the EPT pointer (for memory translation), the intercept configuration (which operations should cause exits), and the host state (so the CPU knows where to return on exit). The `HOST_RIP` field points to KVM's `vmx_vmexit` handler.

2. **`VMLAUNCH` or `VMRESUME` executes.** The CPU reads the VMCS, atomically saves host register state and loads guest register state. The instruction pointer jumps to the guest's RIP.

3. **The CPU enters non-root mode.** From this point, the CPU is executing guest instructions at full native speed. The guest's code runs on the physical pipeline with no translation or interception. The only difference from normal execution is that certain operations are configured to trap.

4. **Eventually, a VM exit occurs.** The guest touches an intercepted MMIO address, executes a trapped instruction, or an external interrupt arrives. The CPU saves guest state back to the VMCS, restores host state, and jumps to the `HOST_RIP` address (KVM's exit handler). `KVM_RUN` returns to userspace.

The entire VMENTER/VMEXIT cycle, from the perspective of the calling thread, looks like a single blocking ioctl. The thread enters the kernel, the kernel enters the guest, the guest runs for some time, an exit occurs, the kernel handles it or returns to userspace.

### How QEMU Wraps This

QEMU doesn't call the KVM API in a single thread. For a VM with 4 vCPUs:

- **4 vCPU threads** are created, each running the `KVM_RUN` loop above. Thread names are `CPU 0/KVM`, `CPU 1/KVM`, etc.
- **1 main loop thread** runs a `select(2)`/`poll(2)` event loop, dispatching timer callbacks, I/O completions, and QMP (management protocol) commands.
- **Additional threads** for I/O workers, VNC, migration.

When a vCPU thread's `KVM_RUN` returns with `KVM_EXIT_IO` or `KVM_EXIT_MMIO`, it dispatches the access to the appropriate device model in QEMU. If the device model runs on the main loop thread, the vCPU thread signals the main loop and waits. This is serialized by the Big QEMU Lock (BQL), though modern QEMU is progressively reducing its scope by moving device backends onto dedicated IOThreads.

Guest RAM is allocated once as a large `mmap` and shared across all vCPU threads (they're in the same process). The `KVM_SET_USER_MEMORY_REGION` call tells KVM about this mapping, and all vCPUs share the same EPT tables, so they see the same guest physical address space, just like real CPUs sharing physical memory.

## How the Process Gets Managed

### From the Host Kernel's Perspective

A running QEMU/KVM virtual machine is a single Linux process with multiple threads. There is nothing special about it from the scheduler's point of view. The host kernel's CFS (Completely Fair Scheduler) treats vCPU threads exactly like any other threads: assigning time slices, migrating them between physical cores, preempting them when their time is up.

When a vCPU thread calls `KVM_RUN`, it transitions from userspace into kernel space (a normal system call). Inside the kernel, KVM executes `VMLAUNCH`/`VMRESUME` and the thread enters the guest. While the guest is running, the thread is in a state similar to "running in kernel mode" from the scheduler's perspective. The thread is consuming CPU time and can be preempted by the host scheduler if its time slice expires.

### What Makes KVM_RUN Return

`KVM_RUN` returns to userspace for several reasons:

- **I/O access**: The guest accessed an MMIO address or I/O port that KVM can't handle in-kernel. QEMU needs to emulate the device.
- **External interrupt**: A host interrupt arrives (timer tick, network packet, disk I/O completion) while the guest is running. The CPU exits non-root mode to deliver the interrupt to the host kernel.
- **Signal**: A Linux signal is pending for the QEMU process (SIGTERM, for example). KVM kicks the vCPU out of guest mode so the signal can be delivered.
- **Halt**: The guest executed the HLT instruction (idle, waiting for an interrupt). KVM returns so the thread can sleep instead of spinning.
- **MMIO/PIO handled in-kernel**: Some exits, like accesses to the in-kernel APIC or IOAPIC, are handled entirely within KVM and never return to userspace. These are "fast path" exits.

### Signals and Process Lifecycle

Because QEMU is a normal process:

- `kill -SIGTERM <qemu_pid>` sends a signal. KVM kicks the vCPU threads out of guest mode, the signal is delivered, and QEMU's signal handler initiates graceful shutdown (ACPI power button event to the guest, or immediate termination).
- `kill -SIGKILL <qemu_pid>` terminates the process immediately. The guest dies without warning. KVM cleans up the VM's kernel resources (VMCS, EPT tables, memory slots) in the process exit path.
- `cgroup` limits apply naturally. If the QEMU process's cgroup has a CPU quota, the host scheduler enforces it by preempting vCPU threads when the quota is exhausted. The guest slows down but has no way to bypass the limit. If the cgroup's memory limit is hit, the OOM killer may kill the QEMU process, which is indistinguishable from a power failure to the guest.

### In KubeVirt

In KubeVirt, the virt-launcher process (PID 1 in the pod) starts QEMU. If Kubernetes needs to terminate the pod (eviction, drain, resource pressure), it sends SIGTERM to PID 1 (virt-launcher). virt-launcher intercepts this, sends an ACPI shutdown signal to the guest via QEMU's QMP interface, and waits for QEMU to exit gracefully. This gives the guest OS time to flush buffers and shut down services. If the guest doesn't shut down within the grace period, Kubernetes sends SIGKILL.

## How Isolation Works

A running VM is isolated from the host and from other VMs by four independent layers, each enforcing a different kind of boundary.

### Layer 1: CPU Isolation (VT-x Non-Root Mode)

When the guest is executing, the CPU is in non-root mode. This is a hardware-enforced restriction, not a software convention. In non-root mode:

- Certain instructions unconditionally cause VM exits (e.g., `CPUID`, `INVD`, `VMCALL`). The guest cannot execute them without the hypervisor seeing it.
- Other instructions are conditionally intercepted based on VMCS configuration. KVM can choose which MSR accesses, control register writes, and I/O ports should trap.
- The guest cannot disable or modify the interception configuration. The VMCS is not accessible from non-root mode. There is no instruction the guest can execute to escalate itself to root mode.
- External interrupts (configured via the VMCS) cause immediate VM exits, ensuring the host kernel retains control of hardware interrupts.

The guest is physically confined to non-root mode. The only way out is a VM exit, which transfers control to the hypervisor at a predetermined address (`HOST_RIP` in the VMCS), not to an address the guest chooses.

### Layer 2: Memory Isolation (EPT/NPT)

The guest has its own physical address space, completely disjoint from the host's. EPT (Extended Page Tables) provides the boundary:

- Every memory access the guest makes goes through two levels of translation: guest page tables (GVA to GPA, managed by the guest OS) and EPT (GPA to HPA, managed by KVM). The guest can only reach host physical addresses that have EPT entries.
- KVM builds EPT entries based on the memory slots configured via `KVM_SET_USER_MEMORY_REGION`. The guest can access exactly the memory QEMU allocated for it, nothing more.
- If the guest accesses a GPA with no EPT entry, the CPU generates an EPT violation (a specific type of VM exit). KVM decides whether to fill in the mapping or inject a fault into the guest.
- The guest cannot modify EPT entries. EPT is managed entirely by KVM in host root mode. The guest's own page tables only control the first level of translation (GVA to GPA); they cannot influence the second level (GPA to HPA).
- Even if the guest OS is fully compromised (root, kernel access, arbitrary code execution inside the guest), it cannot read or write a single byte of host memory outside its EPT mappings. The isolation is enforced by the CPU's memory management hardware, not by software checks.

A subtle but important point: the guest's physical address space is actually a range within QEMU's virtual address space. If QEMU itself has a vulnerability (buffer overflow, use-after-free), an attacker could potentially access memory outside the guest's region but still within QEMU's address space. This is why QEMU runs with limited privileges, and why the broader isolation layers (namespaces, cgroups, SELinux/seccomp) matter.

### Layer 3: Device Isolation (IOMMU)

EPT isolates CPU-initiated memory access, but devices perform DMA (Direct Memory Access), bypassing the CPU entirely. Without the IOMMU, a device passed through to a guest could DMA to any physical address, including host kernel memory or another VM's memory.

The IOMMU (Intel VT-d, AMD-Vi) provides the same isolation for device DMA that EPT provides for CPU access:

- Each device (or IOMMU group of devices) gets its own DMA address translation table, maintained by the host
- When a device performs DMA, the IOMMU translates the device's DMA address to a host physical address, restricting it to memory owned by the VM
- If a device tries to DMA outside its allowed region, the IOMMU blocks the access and raises a fault

This is only relevant for passthrough devices (VFIO, SR-IOV). For emulated or virtio devices, all I/O goes through QEMU or vhost in the host, so there is no direct device-to-memory path that needs IOMMU protection.

### Layer 4: Process Isolation (Namespaces, Cgroups, MAC)

Everything above isolates the guest from the host at the hardware/kernel level. But QEMU is a userspace process, and if it's compromised, the attacker has a process running on the host. Linux provides several layers of process-level isolation:

**Namespaces** restrict what the process can see:
- **PID namespace**: QEMU (and the guest) cannot see other processes on the host
- **Network namespace**: The guest's network stack is isolated. It sees only the interfaces configured for its pod/container, not the host's interfaces
- **Mount namespace**: The guest's filesystem view is restricted to what's mounted in its container
- **User namespace**: The QEMU process can run as an unprivileged user, even if the guest thinks it has root

**Cgroups** restrict what the process can consume:
- CPU time: The host scheduler enforces CPU quotas. The guest cannot monopolize the host's CPUs.
- Memory: A hard limit on the QEMU process's memory. Exceeding it triggers the OOM killer, not unbounded growth.
- I/O bandwidth: Block I/O and network I/O can be throttled per-cgroup.
- PIDs: A limit on the number of threads/processes prevents fork bombs inside the guest from exhausting host PID space.

**Mandatory Access Control** (SELinux, seccomp):
- SELinux confines the QEMU process to a specific security context, limiting which files, sockets, and system calls it can access, even if it runs as root
- seccomp filters restrict the system calls QEMU can make, reducing the kernel attack surface

### How the Layers Compose

Each layer defends against a different failure mode:

```
Guest OS compromised (root in guest):
  -> VT-x non-root mode prevents escape to host execution context
  -> EPT prevents access to host memory
  -> Guest is fully contained by hardware

QEMU process compromised (escape from guest):
  -> Namespaces limit visibility (can't see host processes, network, filesystem)
  -> Cgroups limit resource consumption
  -> SELinux/seccomp limit system call access
  -> The attacker has a constrained process, not host access

Passthrough device exploited:
  -> IOMMU prevents DMA outside the VM's memory region
```

In KubeVirt, the pod sandbox enforces namespaces and cgroups automatically. The QEMU process inherits the pod's isolation boundaries because it runs inside the virt-launcher container. Each VM gets its own pod, its own network namespace, its own cgroup, and its own virtqemud instance. There is no shared state between VMs beyond the host kernel itself.

The practical implication: to fully escape a KubeVirt VM, an attacker would need to break out of non-root mode (a CPU-level vulnerability), OR exploit a QEMU bug to gain code execution in the virt-launcher process AND then escape the pod's namespace/cgroup/SELinux confinement AND then escalate privileges on the host. Each layer is independent, so compromising one does not help with the others.

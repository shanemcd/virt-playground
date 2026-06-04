# Hotplug Landscape: What Works, What Doesn't, and Open Problems

Hotplugging resources to running VMs is a key Day 2 operation. KubeVirt supports hotplug for volumes, CPU, memory, and network interfaces, but each has different maturity levels and known limitations.

## What's Hotpluggable

| Resource | Status | Notes |
|----------|--------|-------|
| **Volumes (PVC/DataVolume)** | GA (feature gate required) | Most mature, but see issues below |
| **CPU (sockets)** | Beta | Requires VMRolloutStrategy=LiveUpdate |
| **Memory** | Beta | Add only (shrinking is risky) |
| **Network interfaces** | Beta | Bridge and SR-IOV supported |

## Feature Gates

Hotplug features are gated:
- `HotplugVolumes` - Ephemeral volume hotplug (attach to VMI, lost on restart)
- `DeclarativeHotplugVolumes` - Persistent volume hotplug (attach to VM spec, survives restart)
- `VMRolloutStrategy` - Controls whether hotplug happens live or requires restart

## Volume Hotplug: The Most Mature (But Still Problematic)

Volume hotplug is the oldest and most used hotplug feature, but it has several active issues:

### Open Issues

**Critical: Livelock Under Rapid Changes ([#16937](https://github.com/kubevirt/kubevirt/issues/16937))**

When volumes are added faster than ~8 seconds apart, attachment pods enter a Pending → Terminating cycle without ever becoming Ready. This prevents ANY volumes from attaching until the changes stop.

Root cause: New attachment pods are deleted before they reach READY when the next volume request arrives. The controller creates `hp-volume-<random>` pods for each volume being attached, but under rapid changes it deletes pending pods before they finish mounting volumes.

**Status**: Fix in progress by @FrankTaylorLieder with comprehensive controller changes:
- Don't delete pending pods (let them reach READY or timeout)
- Protect READY pods from deletion for a "settle" time
- Allow partial attachment (don't require all volumes to be present before marking any as attached)
- De-bounce wait-for-first-consumer trigger pod creation

**Node Affinity Not Respected ([#16945](https://github.com/kubevirt/kubevirt/issues/16945))**

VMs with RWX root storage and hotplugged RWO local storage (e.g., TopoLVM) can be scheduled to nodes where the RWO volume doesn't exist. The scheduler only sees the RWX root volume mount, not the hotplugged volumes.

Result: VM pod starts on wrong node, `hp-volume` helper pod gets stuck in Pending trying to mount a volume that exists on a different node.

**Status**: Open, no fix yet. This is a scheduler problem - hotplugged volumes aren't considered during VM pod placement.

**cpuset Changes Break Block Volume Access ([#14825](https://github.com/kubevirt/kubevirt/issues/14825))**

When the kubelet changes a pod's CPU set (e.g., a Guaranteed QoS pod is scheduled and takes exclusive CPUs), systemd reloads the cgroup and reverts kubevirt's device allowlist. Hotplugged block devices become inaccessible inside virt-launcher.

Reproducer:
1. Create a non-Guaranteed VM
2. Hotplug a block PVC
3. Schedule a Guaranteed pod with exclusive CPUs
4. Try to read from the hotplugged block device in virt-launcher → Operation not permitted

**Status**: Open. Domain resync eventually fixes it, but with a long delay.

**Multiple Attachment Pods Cause Mount Ambiguity ([#16520](https://github.com/kubevirt/kubevirt/issues/16520))**

When multiple `hp-volume` pods exist (during transitions), virt-handler may pick the wrong parent mount when resolving hotplug volume paths.

**Status**: Open.

**GPU Passthrough + Hotplug Incompatibility ([#17417](https://github.com/kubevirt/kubevirt/issues/17417))**

VMs with GPU passthrough fail to restart after hotplugging a data disk (kubevirt v1.7.0).

**Status**: Open, limited details.

**macvtap + Hotplug Volumes Fail to Start ([#17392](https://github.com/kubevirt/kubevirt/issues/17392))**

VMs with macvtap networking and hotpluggable volumes fail to start.

**Status**: Open.

## CPU Hotplug

CPU hotplug adds/removes sockets (not individual cores). It's gated by `VMRolloutStrategy=LiveUpdate`.

### Limitations

- **Socket-level only**: You can't hotplug individual vCPUs, only entire sockets
- **Guest OS support**: The guest must support CPU hotplug (modern Linux with ACPI, Windows with specific configs)
- **ARM64 socket limits**: maxSockets validation is missing on ARM64, leading to unsupported configurations ([#16581](https://github.com/kubevirt/kubevirt/issues/16581))

### How It Works

1. User patches VM spec to increase `spec.template.spec.domain.cpu.sockets`
2. If `VMRolloutStrategy=LiveUpdate`, virt-controller patches VMI spec
3. virt-handler calls libvirt's `virDomainSetVcpusFlags` via gRPC
4. libvirt sends ACPI hotplug event to QEMU
5. QEMU notifies guest OS via ACPI
6. Guest OS onlines the new CPUs

## Memory Hotplug

Memory hotplug allows adding memory to a running VM. **Shrinking (hot-unplug) is supported but risky.**

### Open Question: Is Memory Shrinking Safe? ([#16751](https://github.com/kubevirt/kubevirt/issues/16751))

When you reduce memory in the VM spec, KubeVirt migrates the VM to apply the change. The new VMI has less memory, and the guest OS reflects the change. But is this safe?

**The Risk**: If the guest is using more memory than the new limit, pages must be reclaimed. This can cause:
- OOM kills inside the guest
- Guest kernel panic if critical pages are evicted
- Data loss if applications aren't gracefully handling memory pressure

**Current Behavior**: KubeVirt doesn't prevent memory shrinking, but it forces a live migration to apply it. This is safer than in-place hot-unplug (which QEMU supports), but still risky if the guest is actively using the memory being removed.

**Recommendation**: Only shrink memory if you know the guest has enough free memory to absorb the reduction.

### How It Works (Adding Memory)

1. User patches VM spec to increase `spec.template.spec.domain.memory.guest`
2. If `VMRolloutStrategy=LiveUpdate`, virt-controller patches VMI spec
3. virt-handler calls libvirt's `virDomainSetMemoryFlags`
4. libvirt tells QEMU to add a memory DIMM
5. QEMU notifies guest via ACPI
6. Guest OS onlines the new memory

## Network Interface Hotplug

Network hotplug adds/removes interfaces to running VMs. Supports bridge and SR-IOV.

### Open Issues

**Not Gated by VMRolloutStrategy ([#17328](https://github.com/kubevirt/kubevirt/issues/17328))**

Unlike CPU and memory hotplug, network hotplug ignores the cluster-wide `VMRolloutStrategy` setting. When rollout strategy is set to `Stage` (require restart for changes), network hotplug still applies changes live.

This is intentional for backwards compatibility with the optional `multus-dynamic-networks-controller`, which enables in-place NIC hotplug. But it's inconsistent - admins expect `VMRolloutStrategy` to gate ALL live changes.

**SR-IOV + Live Migration Unclear ([#17222](https://github.com/kubevirt/kubevirt/issues/17222))**

After live migration, SR-IOV devices are new on the target node. The docs don't clarify whether these are automatically restored or require manual operations.

**Status**: Documentation gap, unclear if this is a bug or expected behavior.

**Stale Interfaces After Hot-Unplug ([#14074](https://github.com/kubevirt/kubevirt/issues/14074))**

In-place hot-unplug of a secondary interface can leave stale interfaces in the virt-launcher pod and on the worker node.

**Status**: Open.

### How It Works

**Bridge Interfaces:**
1. User patches VM spec to add a network interface
2. virt-controller patches VMI spec
3. If `multus-dynamic-networks-controller` is deployed, it reads pod annotations and attaches the interface in-place
4. Otherwise, virt-controller sets `MigrationRequired` condition on VMI
5. User must manually trigger migration to complete the hotplug

**SR-IOV:**
- Requires migration (can't be hot-attached in-place)
- Device plugin allocates VF on target node during migration

## VMRolloutStrategy: The Consistency Problem

`VMRolloutStrategy` controls whether spec changes are applied live or staged for the next restart:

- `LiveUpdate` (default): Apply changes immediately (may require migration)
- `Stage`: Set `RestartRequired` condition, apply on next restart

**The Problem**: Network hotplug bypasses this setting. CPU and memory respect it, network doesn't.

**Why**: Backwards compatibility with existing workflows that use `multus-dynamic-networks-controller` for in-place NIC hotplug.

## Common Patterns

**Ephemeral vs Persistent Hotplug:**
- Ephemeral: Patch VMI directly, volume disappears on restart
- Persistent: Patch VM spec, volume survives restarts

**Feature Gate Dependency:**
- Ephemeral: Requires `HotplugVolumes`
- Persistent: Requires `DeclarativeHotplugVolumes` or both gates

**Hotpluggable Flag:**
Volumes must be explicitly marked as hotpluggable:
```yaml
volumes:
- name: my-disk
  persistentVolumeClaim:
    claimName: my-pvc
    hotpluggable: true  # Required
```

## Testing Hotplug

Test categories in the KubeVirt repo:
- `tests/hotplug/cpu.go` - CPU hotplug tests
- `tests/hotplug/memory.go` - Memory hotplug tests
- `tests/hotplug/affinity.go` - Node affinity with hotplug
- `tests/hotplug/instancetype.go` - Instance types with hotplug
- `tests/hotplug/pci_topology.go` - PCI slot allocation
- `tests/network/hotplug_bridge.go` - Bridge interface hotplug
- `tests/network/hotplug_sriov.go` - SR-IOV interface hotplug

## What Your Boss Probably Cares About

**Volume Hotplug:**
- Works, but has race conditions under rapid changes (fix in progress)
- Node affinity is broken (no ETA on fix)
- Incompatible with GPU passthrough and macvtap

**CPU/Memory Hotplug:**
- Solid for adding resources
- Memory shrinking is technically possible but risky
- Gated by VMRolloutStrategy (good for compliance/stability)

**Network Hotplug:**
- Works but bypasses VMRolloutStrategy (inconsistency issue)
- SR-IOV + live migration behavior unclear

**Biggest Gotcha**: Hotplug is not "set it and forget it." You need to understand the limitations, especially around node affinity, rapid changes, and the VMRolloutStrategy inconsistency.

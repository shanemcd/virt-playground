# 07 - End-to-End Migration Flow

**Goal:** Synthesize all components into complete understanding of how MTV performs a migration.

## Cold Migration with VDDK (Standard Path)

```
┌─────────────────────────────────────────────────────────────┐
│ 1. User creates Migration Plan in MTV UI                    │
│    - Select VMs from VMware inventory                       │
│    - Choose network mapping                                 │
│    - Choose storage mapping                                 │
│    - Select VDDK copy method                                │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. MTV Controller creates resources                         │
│    - Creates migration CR (custom resource)                 │
│    - Pulls VM metadata from VMware API                      │
│    - Plans VM definition for OpenShift                      │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. User triggers cutover (powers off VM)                    │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. MTV spawns virt-v2v pod                                  │
│                                                              │
│   Inside the pod:                                           │
│   ┌──────────────────────────────────────────┐             │
│   │ NBD Kit with VDDK plugin                 │             │
│   │  ↓                                        │             │
│   │ Connects to vCenter/ESXi                 │             │
│   │  ↓                                        │             │
│   │ Requests blocks from VMDK                │             │
│   └──────────────┬───────────────────────────┘             │
│                  ↓                                           │
│   ┌──────────────────────────────────────────┐             │
│   │ libguestfs spawns QEMU VM                │             │
│   │  - Fixed kernel                          │             │
│   │  - Mounts source disk (via NBD Kit)      │             │
│   │  - Inspects OS                           │             │
│   │  - Removes VMware Tools                  │             │
│   │  - Installs virtio drivers               │             │
│   │  - Installs qemu-guest-agent             │             │
│   │  - Adds udev rules                       │             │
│   │  - Rebuilds initramfs                    │             │
│   │  - Preserves static IPs                  │             │
│   └──────────────┬───────────────────────────┘             │
│                  ↓                                           │
│   ┌──────────────────────────────────────────┐             │
│   │ Cache layer tracks changed blocks        │             │
│   └──────────────┬───────────────────────────┘             │
│                  ↓                                           │
│   ┌──────────────────────────────────────────┐             │
│   │ Copy to destination PVC                  │             │
│   │  - Only changed blocks                   │             │
│   │  - Or full disk if no cache              │             │
│   └──────────────────────────────────────────┘             │
│                                                              │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. MTV creates VirtualMachine CR                            │
│    - Uses metadata from step 2                              │
│    - Points to migrated PVC                                 │
│    - Applies network mappings                               │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. User starts VM in OpenShift                              │
│    - CNV creates virt-launcher pod                          │
│    - QEMU starts with migrated disk                         │
│    - VM boots with virtio drivers                           │
│    - Network configured per mapping                         │
└─────────────────────────────────────────────────────────────┘
```

## Warm Migration with VDDK

Same as above, but insert before step 3:

```
┌─────────────────────────────────────────────────────────────┐
│ 2.5. Pre-copy phase (VM still running)                      │
│                                                              │
│   Round 1:                                                  │
│   - Create snapshot on source VM                           │
│   - Copy base disk (frozen by snapshot)                    │
│   - Create new snapshot                                    │
│   - Consolidate previous snapshot                          │
│                                                              │
│   Round 2:                                                  │
│   - Copy delta from round 1                                │
│   - Create new snapshot                                    │
│   - Consolidate previous snapshot                          │
│                                                              │
│   Round N:                                                  │
│   - Repeat until delta is small                            │
│   - OR until won't converge (high IOPS)                    │
│                                                              │
└────────────────────┬────────────────────────────────────────┘
                     ↓
(Then proceed to step 3, but cutover is much faster)
```

## Storage Offload Migration

Replace step 4 with:

```
┌─────────────────────────────────────────────────────────────┐
│ 4. Storage offload copy                                     │
│                                                              │
│   A. Provision PVC in OpenShift                             │
│      → Creates LUN in storage array                         │
│                                                              │
│   B. Detach LUN from OpenShift node                         │
│                                                              │
│   C. Attach LUN to ESXi host                                │
│                                                              │
│   D. SSH/API to ESXi, run vmkfstools                        │
│      → Copy happens inside storage array                    │
│      → Much faster than VDDK                                │
│                                                              │
│   E. Detach LUN from ESXi                                   │
│                                                              │
│   F. Reattach LUN to OpenShift node                         │
│                                                              │
│   G. Run virt-v2v in-place for conversion                   │
│      → No copy needed, just OS modifications                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Decision Tree: Which Method?

```
Start
  ↓
Shared storage array between VMware and OpenShift?
  Yes → ESXi SSH/API access available?
    Yes → Storage array supports copy offload?
      Yes → USE STORAGE OFFLOAD (fastest)
      No  → USE STORAGE OFFLOAD (slow path, still faster than VDDK)
    No  → ↓
  No  → ↓
        ↓
Downtime requirements strict?
  Yes → VM has Change Block Tracking enabled?
    Yes → VM is high IOPS?
      No  → USE WARM MIGRATION (lower downtime)
      Yes → USE COLD MIGRATION (warm won't converge)
    No  → USE COLD MIGRATION
  No  → USE COLD MIGRATION
        ↓
VDDK image built?
  Yes → USE VDDK (standard)
  No  → USE CURL (slow, testing only)
```

## Component Interactions

```
┌────────────────┐
│ MTV Operator   │ (Kubernetes controller)
└───────┬────────┘
        │ watches
        ↓
┌────────────────┐
│ Plan CR        │ (what to migrate)
│ Migration CR   │ (migration in progress)
│ VM CR          │ (resulting VM definition)
└───────┬────────┘
        │ creates
        ↓
┌────────────────┐
│ virt-v2v Pod   │
│  ├─ NBD Kit    │ (block access)
│  ├─ libguestfs │ (safe manipulation)
│  └─ virt-v2v   │ (orchestration)
└───────┬────────┘
        │ writes to
        ↓
┌────────────────┐
│ PVC            │
└───────┬────────┘
        │ used by
        ↓
┌────────────────┐
│ VirtualMachine │ (CNV CR)
└───────┬────────┘
        │ creates
        ↓
┌────────────────┐
│ virt-launcher  │ (runs QEMU)
└────────────────┘
```

## What Can Go Wrong?

**At each stage:**

1. **Metadata extraction:**
   - VMware credentials wrong
   - Network to vCenter down
   - Insufficient VMware permissions

2. **virt-v2v conversion:**
   - Unsupported OS version
   - Missing drivers for target
   - Corrupted source disk
   - Insufficient space in pod

3. **VDDK copy:**
   - VDDK image version mismatch
   - Network interruption
   - VMware API rate limiting
   - Storage performance issues

4. **Warm migration:**
   - CBT not enabled
   - Snapshot consolidation fails
   - High IOPS won't converge
   - Storage runs out of space

5. **Storage offload:**
   - Can't attach/detach LUN
   - vmkfstools fails
   - ESXi access denied
   - Storage array doesn't support offload

6. **VM startup:**
   - Missing virtio drivers (conversion failed)
   - Network mapping incorrect
   - Insufficient resources in OpenShift
   - Boot issues (wrong bootloader config)

## Observability

**Where to look:**
- MTV UI: high-level progress
- Migration CR status: detailed state
- virt-v2v pod logs: conversion details
- virt-launcher pod: VM startup issues
- VMware events: snapshot operations
- Storage array logs: offload operations

## Lab Exercise (TODO)

1. Perform migration with logging at each stage
2. Map log messages to architecture diagram
3. Intentionally break each component, observe failures
4. Time each phase, identify bottlenecks
5. Compare cold vs warm vs storage offload for same VM

## Success Criteria

Migration is successful when:
1. ✅ VM boots in OpenShift
2. ✅ All disks accessible and data intact
3. ✅ Network connectivity works
4. ✅ Applications start correctly
5. ✅ Performance acceptable
6. ✅ qemu-guest-agent running
7. ✅ No VMware tools remnants

## Next Steps

- Document real-world migrations as I observe them
- Build troubleshooting guides for each failure mode
- Create performance tuning guide
- Contribute findings back to MTV docs

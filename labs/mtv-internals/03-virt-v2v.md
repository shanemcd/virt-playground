# 03 - virt-v2v Architecture

**Goal:** Understand how virt-v2v orchestrates NBD Kit and libguestfs to perform the complete migration.

## What is virt-v2v?

Virtual-to-Virtual conversion tool. Open source, maintained by Red Hat for 14+ years. Core of MTV's migration engine.

## Key Principle

**Never touches source VM.** All changes happen in deltas, then discarded or committed. Source remains pristine.

Contrast with agent-based tools (Nutanix):
- Install agent on source
- Modify source VM directly
- If it breaks, source is corrupted

## Architecture Flow

```
┌─────────────────────────────────────────────┐
│ virt-v2v Process (inside MTV pod)           │
│                                              │
│  ┌────────────────────────────────────┐    │
│  │ 1. Input (NBD Kit + VDDK/curl)     │    │
│  │    - Connect to source disk         │    │
│  │    - Read only necessary blocks     │    │
│  └─────────────┬──────────────────────┘    │
│                ↓                             │
│  ┌────────────────────────────────────┐    │
│  │ 2. Conversion (libguestfs)         │    │
│  │    - Spawn QEMU with fixed kernel   │    │
│  │    - Remove VMware tools            │    │
│  │    - Install virtio drivers         │    │
│  │    - Install qemu-guest-agent       │    │
│  │    - Add udev rules                 │    │
│  │    - Rebuild initramfs              │    │
│  │    - Preserve static IPs            │    │
│  └─────────────┬──────────────────────┘    │
│                ↓                             │
│  ┌────────────────────────────────────┐    │
│  │ 3. Cache Layer                      │    │
│  │    - Track which blocks changed     │    │
│  │    - Avoid re-reading unchanged     │    │
│  └─────────────┬──────────────────────┘    │
│                ↓                             │
│  ┌────────────────────────────────────┐    │
│  │ 4. Output (PVC)                     │    │
│  │    - Write changed blocks only      │    │
│  │    - Destination is OpenShift PVC   │    │
│  └────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

## Two-Phase Process

**Phase 1: Conversion**
- All changes happen in memory/temp space
- Source disk is read-only
- libguestfs makes OS-level modifications
- Fails fast if conversion problems detected

**Phase 2: Copy**
- Only after conversion succeeds
- Transfer blocks to destination
- Cache layer prevents re-reading unchanged blocks
- Can take hours for large disks

## Why This Order Matters

If we copied first, then converted:
- Waste time copying terabytes
- Then conversion fails
- Have to start over

By converting first:
- Detect problems early (wrong drivers, unsupported OS, etc.)
- Only copy if conversion will work
- Higher confidence in success

## Advantages

From Martin's presentation:

1. **Fails fast** - Don't copy data if conversion won't work
2. **Broad OS support** - Many Linux and Windows distributions
3. **Managed disk transfers** - Handles the copy complexity
4. **No source modification** - Source VM never at risk

## Disadvantage

**Higher downtime** - VM must be powered off throughout conversion + copy.

This is where warm migration helps (covered in 05-warm-migration.md).

## How MTV Wraps This

MTV adds:
- Kubernetes operator to orchestrate
- UI for planning migrations
- Warm migration (snapshot-based)
- Storage offload (LUN migration)
- Integration with OpenShift storage

But virt-v2v is the engine doing actual conversion work.

## Lab Exercise (TODO)

1. Install virt-v2v standalone (outside MTV)
2. Convert a local VMware VM to libvirt/KVM
3. Watch the process, observe the two phases
4. Intentionally break conversion (remove drivers), see fast fail
5. Compare: successful run vs. failed run timing

## Open Questions

- How does virt-v2v detect which drivers to install?
- What OS versions are supported? What's unsupported?
- How does it handle encrypted disks?
- What's the failure rate in production? Common failure modes?
- How much does cache layer actually save?

## Resources

- virt-v2v upstream: https://github.com/libguestfs/virt-v2v
- `man virt-v2v`
- MTV operator source (OpenShift/CNV org)

## Next Steps

→ 04-vddk.md - How VMware VDDK provides the block-level source access

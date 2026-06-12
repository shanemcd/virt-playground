# 02 - libguestfs and Guest Conversion

**Goal:** Understand how libguestfs enables safe, consistent filesystem manipulation without root access.

## What is libguestfs?

Library for accessing and modifying virtual machine disk images. Also created by Richard Jones (Red Hat). Solves the security and consistency problems of direct disk manipulation.

## The Problem

When manipulating VM disks directly:
- Need root access (security risk)
- Kernel version variations cause inconsistency
- Risk of corrupting source data
- Different distros behave differently

## The libguestfs Solution

Spawn a lightweight QEMU VM with:
- **Fixed kernel** - Same kernel every time, controlled environment
- **Appliance** - Minimal userspace with standard tools
- **API bridge** - Commands sent from host to guest via protocol

All manipulation happens inside the VM, isolated from host.

## Architecture

```
[Host Process - MTV Pod]
    ↓ (libguestfs API)
[QEMU Process]
  ├─ Fixed kernel (controlled version)
  ├─ Appliance (minimal userspace)
  └─ Disk image (via NBD Kit)
      ↓
  [Filesystem manipulation]
      ↓
  [Results returned to host]
```

## How MTV Uses This

From Martin's presentation:

```
[NBD Kit + VDDK] → [libguestfs VM]
                         ↓
                    [Read metadata]
                         ↓
                    [Plan conversion]
                         ↓
                    [Apply changes]
                         ↓
                    [Cache layer]
                         ↓
                    [Write to PVC]
```

The conversion happens in two phases:
1. **Conversion phase** - Make all OS changes (drivers, config, etc.)
2. **Copy phase** - Transfer blocks to destination PVC

Cache layer between them means:
- Only transfer blocks that changed during conversion
- Don't re-read unchanged blocks from source

## What Gets Modified

During guest conversion, libguestfs:
- Removes VMware Tools
- Installs virtio drivers
- Installs QEMU guest agent
- Adds udev rules to persist interface names
- Rebuilds initramfs
- Preserves static IP configuration
- Cleans up VMware-specific config

All without VM credentials. All at block/filesystem level.

## Why This Approach?

**vs. Agent-based (Nutanix approach):**
- No agent installation on source
- No risk of breaking source VM
- No credentials required
- Failures don't corrupt source

**vs. Direct mount:**
- No root access required
- Consistent kernel environment
- Can't accidentally break host

## Lab Exercise (TODO)

1. Install libguestfs tools locally
2. Download a VM image
3. Use `guestfish` to explore without starting the VM
4. Use `virt-customize` to inject a file
5. Boot the VM and verify the change
6. Compare: time to boot VM vs. time to inject with libguestfs

## Open Questions

- What's in the appliance? How minimal is it?
- How does the fixed kernel handle different guest OS versions?
- What's the performance overhead of the QEMU layer?
- How are errors from inside the VM communicated back?
- What happens if the guest OS is corrupted/unbootable?

## Resources

- libguestfs internals talk (need to find link)
- `man guestfish`
- `man virt-customize`

## Next Steps

→ 03-virt-v2v.md - How these pieces combine in the actual migration tool

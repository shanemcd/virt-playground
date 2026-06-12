# 04 - VDDK Integration

**Goal:** Understand how VMware VDDK provides block-level access and why it's the recommended copy method.

## What is VDDK?

VMware Virtual Disk Development Kit. Proprietary VMware API for accessing VMDK (VMware disk) files at block level.

## The Problem VDDK Solves

VMware stores VM disks in VMDK format on VMFS filesystem:

```
[Storage Array (NetApp/Dell/Pure)]
    ↓
[LUN - 50TB virtual disk in storage array]
    ↓
[VMFS - VMware's proprietary filesystem]
    ↓
[VMDK files - individual VM disks]
```

Challenges:
- VMFS is proprietary, can't just mount it
- VMDK files can be split, snapshots, thin-provisioned
- Need to understand VMware's disk structure

## VDDK's Role

VDDK provides API to:
- Connect to VMware (vCenter or ESXi)
- Request specific blocks from a VMDK
- VMware handles VMFS translation internally
- Returns raw blocks to caller

No need to understand VMFS, snapshot chains, or disk structure.

## How MTV Uses VDDK

```
[MTV Pod]
    ↓
[NBD Kit with VDDK plugin]
    ↓ (API calls)
[VDDK Library]
    ↓ (VMware API)
[vCenter / ESXi]
    ↓ (VMFS access)
[Storage Array]
    ↓
[VMDK file blocks]
```

NBD Kit's VDDK plugin:
- Translates block device requests into VDDK API calls
- VDDK talks to VMware
- VMware returns requested blocks
- NBD Kit provides them to libguestfs/virt-v2v

## Building VDDK Image

MTV requires a custom container image with VDDK library. Why?

1. **VDDK is proprietary** - Can't redistribute, must download from VMware
2. **Licensing** - Customer must have VMware license
3. **Version compatibility** - Different VDDK versions for different vSphere versions

Process (you've done this):
1. Download VDDK from VMware portal
2. Build container with VDDK library
3. Push to registry accessible to OpenShift
4. Configure MTV to use this image

## Three Copy Methods Compared

**1. curl (not recommended):**
- Uses NBD Kit curl plugin
- Downloads entire VMDK over HTTP
- Slow, no optimization
- Good for testing/POC only

**2. VDDK (standard recommendation):**
- Uses VMware API for block access
- Only transfers needed blocks
- Limitations: 100-200 MB/s throughput
- Good for most migrations

**3. Storage offload (advanced):**
- Bypasses VDDK entirely
- Covered in 06-storage-offload.md
- 5-21x faster than VDDK
- Requires storage array integration

## VDDK Performance Limitations

Martin mentioned VDDK is limited to 100-200 MB/s. Why?

- API overhead (many round-trips)
- Encryption (if enabled)
- vCenter load (other operations competing)
- Network between MTV and VMware

For multi-terabyte VMs, this becomes a bottleneck.

## Lab Exercise (TODO)

1. ✅ Build VDDK image (already done)
2. Configure MTV to use VDDK vs. curl
3. Migrate same VM with both methods
4. Compare timing and observe throughput
5. Check vCenter performance during VDDK migration
6. What happens if VDDK connection drops mid-migration?

## Open Questions

- Can VDDK talk directly to ESXi or must go through vCenter?
- What vSphere APIs does VDDK use under the hood?
- How does VDDK handle snapshot chains?
- What authentication methods does VDDK support?
- Is the 100-200 MB/s limit per-disk or per-migration?
- Can we parallelize VDDK transfers (multiple disks)?

## Common Issues

(To document as I encounter them)
- VDDK version mismatch with vSphere version
- Network connectivity between MTV and vCenter
- Authentication/credential problems
- Storage performance on VMware side

## Resources

- VMware VDDK documentation
- MTV docs on building VDDK image
- NBD Kit VDDK plugin source

## Next Steps

→ 05-warm-migration.md - How snapshots reduce downtime

# 06 - Storage Offload (LUN Migration)

**Goal:** Understand how storage offload bypasses VDDK's 100-200 MB/s limitation by working at the storage array level.

## The VDDK Bottleneck

VDDK migration path:
```
[Storage Array] → [VMware VMFS] → [VDDK API] → [Network] → [MTV Pod] → [OpenShift PVC] → [Storage Array]
```

Problems:
- VDDK API limited to 100-200 MB/s
- Data leaves storage, crosses network, comes back
- Must go through VMware translation layer

For multi-terabyte VMs with tight maintenance windows, this doesn't scale.

## Storage Offload Solution

Move data within the storage array, never traverse the network.

## Key Insight: LUNs Are Portable

**LUN (Logical Unit Number):** Virtual disk inside storage array.

```
[Storage Array]
  ├─ LUN 1 → attached to ESXi Host A
  ├─ LUN 2 → attached to ESXi Host B
  ├─ LUN 3 → attached to OpenShift Node 1
  └─ LUN 4 → attached to OpenShift Node 2
```

LUNs can be detached from one host and attached to another.

## Storage Offload Flow

```
1. OpenShift provisions PVC
   → Creates new LUN in storage array
   → Attached to OpenShift node

2. MTV detaches new LUN from OpenShift node
   → Temporarily not visible to OpenShift

3. MTV attaches new LUN to ESXi host
   → Now ESXi can see it

4. MTV invokes vmkfstools on ESXi
   → vmkfstools copies within storage array
   → Source LUN → Destination LUN
   → Data never leaves storage array

5. MTV detaches LUN from ESXi
   → ESXi can't see it anymore

6. MTV reattaches LUN to OpenShift node
   → PVC now contains migrated data

7. Run virt-v2v conversion in-place
   → OS modifications on destination PVC
```

## vmkfstools

VMware internal tool for VMFS operations.

Can do storage-array-aware copy:
- Knows how to read VMFS (VMware's filesystem)
- Knows how to talk to storage array
- Can request array to copy LUN → LUN internally

## Connection Methods

MTV connects to ESXi host via:

**SSH:**
- `ssh root@esxi-host vmkfstools -i source.vmdk destination.vmdk`
- Simple, widely supported
- May be blocked by security policy

**API (VIB):**
- VIB = vSphere Installation Bundle
- Install service on ESXi
- MTV talks to service via API
- Service invokes vmkfstools
- More complex, better security posture

## Performance Gains

From Martin's presentation:

| Storage Vendor | Speedup vs VDDK |
|----------------|-----------------|
| Default tests  | 5x faster       |
| Hitachi        | 21x faster      |

Why so much faster?
- Data never leaves storage array
- Uses storage array's internal interconnect (fast)
- No VDDK API overhead
- No network traversal
- Fiber channel vs Ethernet (in some cases)

## Requirements

1. **Shared storage array** between VMware and OpenShift
2. **Storage array features:**
   - Must support LUN movement between hosts
   - Ideally supports array-native copy (offload)
3. **ESXi access:**
   - SSH or VIB API access to ESXi hosts
4. **Network:**
   - Fiber channel or iSCSI between compute and storage

## Two Storage Offload Modes

**Intra-array copy (fastest):**
```
Source LUN and destination LUN on same storage array
→ vmkfstools requests array to copy internally
→ Never leaves storage array backplane
```

**Inter-array copy (slower but still faster than VDDK):**
```
Source LUN on NetApp, destination on Pure (different arrays)
→ vmkfstools reads from source array
→ Writes to destination array
→ Data traverses fiber channel network
→ Still faster than VDDK over Ethernet
```

## Supported Storage Vendors

From Martin's slides:
- Hitachi Venterra
- NetApp
- Dell (3PAR)
- Pure
- Others (ecosystem engineering testing)

## Lab Exercise (TODO)

This requires enterprise storage arrays, can't easily lab this.

Alternative research:
1. Read vmkfstools documentation
2. Understand VMFS structure
3. Research storage array copy offload (VAAI)
4. Map out failure scenarios
5. Compare topology requirements: VDDK vs storage offload

## Open Questions

- What happens if LUN detach/attach fails mid-migration?
- Can OpenShift nodes and ESXi hosts share HBA (fiber channel adapter)?
- How does zoning work (storage array access control)?
- What if storage array doesn't support offload? Falls back to slow path?
- How does MTV know which storage array features are available?
- What's the failure rate in production?
- How do you troubleshoot when copy happens inside storage array?

## Challenges

Common challenges:
- **Access to storage arrays** - Not all teams have dedicated arrays for testing
- **Vendor collaboration** - Requires coordination with storage vendors
- **Complex setup** - Many moving parts (zoning, LUN management, ESXi access)
- **Vendor-specific quirks** - Each storage vendor has different capabilities

## When to Use Storage Offload

**Use when:**
- Large VMs (multi-TB)
- Small maintenance windows
- Shared storage between VMware and OpenShift
- Storage array supports offload/copy features

**Don't use when:**
- Different storage backends (no shared array)
- Simple migrations (overhead not worth it)
- Storage array doesn't support needed features
- Can't get ESXi access (SSH/API blocked)

## VMware VAAI

vSphere Storage APIs for Array Integration. Related but different:
- VAAI allows VMware to offload operations to storage array
- Used by vmkfstools for efficient copy
- Not all arrays support all VAAI primitives

(Need to research VAAI deeper)

## Resources

- vmkfstools documentation
- VMware VAAI documentation
- Storage vendor documentation (NetApp, Pure, etc.)

## Next Steps

→ 07-end-to-end-flow.md - Putting all the pieces together

# 05 - Warm Migration Mechanics

**Goal:** Understand how warm migration uses snapshots to reduce downtime while increasing total migration time.

## The Downtime Problem

Traditional (cold) migration:
1. Power off VM
2. Convert OS (drivers, cleanup) - minutes
3. Copy all disk data - hours to days
4. Power on in OpenShift

Downtime = conversion time + copy time

For multi-terabyte VMs, this can be unacceptable.

## Warm Migration Solution

Keep VM running during initial copy, only power off for final sync + conversion.

## How It Works

```
[Source VM Running]
    ↓
1. Create Snapshot
   - All new writes go to snapshot delta file
   - Base disk is now frozen/read-only
    ↓
[MTV copies base disk while VM runs]
    ↓
2. Create another snapshot
   - Consolidates previous snapshot into base
   - New snapshot captures recent changes
    ↓
[MTV copies delta]
    ↓
3. Repeat until delta is small enough
    ↓
4. CUTOVER - Customer triggers
   - Power off VM
   - Copy final delta
   - Run virt-v2v conversion on complete disk
   - Power on in OpenShift
```

## Snapshot Mechanics

When VMware creates snapshot:
```
Before:
  base.vmdk (all writes here)

After:
  base.vmdk (read-only, frozen)
  snapshot-001.vmdk (all new writes here)
```

MTV can safely read base.vmdk while VM continues writing to snapshot.

## Consolidation

After copying base.vmdk:
```
Consolidate:
  base.vmdk + snapshot-001.vmdk → base.vmdk
  snapshot-002.vmdk (new writes)
```

Now copy snapshot delta (much smaller than full disk).

## Cutover Window

Final steps when customer triggers cutover:
1. Power off VM (downtime begins)
2. Copy final snapshot delta (small, fast)
3. Merge all deltas
4. Run virt-v2v conversion in-place
5. Power on in OpenShift (downtime ends)

Downtime = final delta copy + conversion time

Typically minutes instead of hours/days.

## When to Use Warm Migration

**Good for:**
- Large VMs (terabytes)
- Strict downtime requirements
- Planned maintenance windows

**Bad for:**
- High IOPS VMs (won't converge)
- VMs without Change Block Tracking enabled

## The Convergence Problem

High IOPS VM writes data faster than MTV can copy deltas:

```
Round 1: Copy 100 GB, VM writes 150 GB → delta grows
Round 2: Copy 150 GB, VM writes 200 GB → delta grows
...
Never converges, snapshots pile up
```

This is why warm migration isn't always the answer.

## Requirements

From Martin's talk:
- **Change Block Tracking (CBT)** must be enabled on VM
- Without CBT, VMware can't efficiently track which blocks changed
- Must re-scan entire disk each snapshot (very slow)

## Comparison

| Aspect | Cold Migration | Warm Migration |
|--------|----------------|----------------|
| Total time | Shorter | Longer (multiple snapshot rounds) |
| Downtime | Long (hours/days) | Short (minutes) |
| VM must be off | Entire time | Only at cutover |
| Works for high IOPS | Yes | No (won't converge) |
| Complexity | Lower | Higher (snapshot management) |
| VMware overhead | None during copy | Snapshot I/O overhead |

## Lab Exercise (TODO)

1. ✅ Perform warm migration (done this morning)
2. Observe snapshot creation in vCenter
3. Monitor delta size between rounds
4. Trigger cutover, measure actual downtime
5. Simulate high IOPS (run I/O generator), observe non-convergence
6. Compare same VM: cold vs. warm total time

## Open Questions

- How many snapshot rounds typically happen?
- What's the threshold for "delta is small enough"?
- Can customer trigger cutover manually mid-process?
- What happens if snapshot consolidation fails?
- How much I/O overhead do snapshots add to running VM?
- Is there a limit to number of snapshots before problems?
- What happens if we hit that limit before converging?

## Failure Scenarios

(To document)
- Snapshot consolidation failure
- Storage runs out of space for snapshots
- Network interruption during delta copy
- Customer triggers cutover during snapshot creation
- VM deleted/moved during warm migration

## Resources

- VMware snapshot documentation
- VMware CBT documentation
- MTV warm migration docs

## Next Steps

→ 06-storage-offload.md - How to bypass VDDK limitations entirely

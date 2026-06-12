# MTV Internals Deep Dive

Learning sequence for understanding how Migration Toolkit for Virtualization works under the hood.

## Architecture Overview

MTV has three main components:
1. **Metadata extraction** - VMware API → OpenShift resource definitions
2. **Guest conversion** - Driver injection, VMware cleanup, OS preparation
3. **Data copy** - Three methods with different tradeoffs

## Learning Path

| Step | Topic | Status |
|------|-------|--------|
| 01 | NBD Kit fundamentals | Not started |
| 02 | libguestfs and guest conversion | Not started |
| 03 | virt-v2v architecture | Not started |
| 04 | VDDK integration | Not started |
| 05 | Warm migration mechanics | Not started |
| 06 | Storage offload (LUN migration) | Not started |
| 07 | End-to-end flow analysis | Not started |

## Key Questions to Answer

- How does NBD Kit read blocks without credentials?
- What runs inside the libguestfs VM?
- How are snapshots consolidated in warm migrations?
- When does storage offload make sense vs VDDK?
- What are the failure modes for each copy method?

## Resources

- Fosdem talk on NBD Kit (need to find specific link)
- virt-v2v upstream: https://github.com/libguestfs/virt-v2v
- NBD Kit: https://gitlab.com/nbdkit/nbdkit
- libguestfs internals (need to find link)

## Labs Prerequisites

- Access to VMware environment (vCenter nested lab works)
- OpenShift cluster with MTV operator
- VDDK image built (already have this)

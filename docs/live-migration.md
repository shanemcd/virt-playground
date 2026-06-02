# Live Migration

How live migration works, from QEMU's pre-copy algorithm through KubeVirt's orchestration layer.

## The KubeVirt Flow

1. A `VirtualMachineInstanceMigration` (VMIM) resource is created. This can be triggered by a user, a `kubectl drain` operation, or external tooling (descheduler, custom controllers).

2. virt-controller detects the VMIM and creates a new virt-launcher pod on a target node (selected by the Kubernetes scheduler).

3. The target virt-launcher pod starts and initializes its virtqemud, ready to receive the incoming VM.

4. virt-handler on the source node initiates the migration via gRPC to the source virt-launcher. The LibvirtDomainManager calls libvirt's migration API, which coordinates between source and target virtqemud instances.

5. Memory transfer begins (see convergence strategies below).

6. On switchover, the source VM pauses, final state is transferred, the target VM activates, and a network announcement (gratuitous ARP) updates switches.

7. The source virt-launcher pod enters Completed state and is garbage-collected. The VMI status is updated with migration timestamps.

## Convergence Strategies

### Pre-copy (Default)

The source VM continues running. QEMU iteratively copies memory pages to the target:

1. **Initial round**: All of guest memory is transferred
2. **Subsequent rounds**: Only pages dirtied since the last round are sent
3. **Switchover**: When the dirty set is small enough, QEMU briefly pauses the source, sends final pages and CPU/device state, and activates the target

This works when the dirty rate is lower than the transfer rate. If the guest is writing memory faster than it can be copied, the dirty set never converges.

### Auto-converge

`allowAutoConverge: true`

Progressively throttles guest vCPUs to reduce the dirty rate. Effective, but degrades guest performance during migration. The throttling increases over time until convergence is achieved.

### Post-copy

`allowPostCopy: true`

Activates the VM on the target node before all memory has been transferred. Untransferred pages are demand-faulted back from the source. Guarantees convergence, but if the source node fails mid-migration, the VM loses pages that were not yet transferred. This is a data-loss risk.

### Workload Disruption

`allowWorkloadDisruption: true`

Pauses the VM entirely to stop all memory dirtying, allowing migration to complete. Guarantees convergence at the cost of guest downtime.

## Prerequisites

- **Storage**: All PVCs must have **ReadWriteMany (RWX)** access mode (both source and target pods access the same PVCs simultaneously)
- **Network binding**: Must use masquerade, passt, or SR-IOV. Bridge binding on the pod network does not support live migration.
- **Ports**: Ports 49152 and 49153 must be available in the virt-launcher pod (used for the migration data stream)
- **CPU compatibility**: The target node must support the same (or a superset of) CPU features. KubeVirt can use a baseline CPU model to ensure cross-node compatibility.

## Constraints and Tuning

**Bandwidth**: Default migration bandwidth cap is 64 MiB/s. Often too low for VMs with high dirty rates (databases under write load, in-memory caches, VMs using 1 GB hugepages). Configurable via migration policies.

**Timeout**: Migration is aborted if no progress is detected within the `progressTimeout` (default 150 seconds).

**Pod IP changes**: With masquerade binding, the VM gets a new pod IP after migration. The guest-internal IP stays the same (it's NAT'd), but the cluster-visible IP changes. Services using label selectors track the change automatically. Direct pod-IP connections will break.

**Dedicated migration network**: Migrations can use a separate physical network via Multus, providing dedicated bandwidth and avoiding contention with cluster traffic. Requires every node to have at least 2 NICs.

## Migration Policies

A `MigrationPolicy` resource applies different migration configurations to specific groups of VMs using label selectors:

- Bandwidth limits
- Convergence strategy (auto-converge, post-copy)
- Parallel migration count
- Timeout values
- Dedicated migration network

## What KubeVirt Does NOT Have

Unlike VMware DRS, KubeVirt does not automatically decide when to migrate VMs for load balancing. Migration policies control **how** migrations happen, not **when**. There is no equivalent to:

- Proactive HA (preemptive migration based on predicted hardware failure)
- Automatic load balancing across nodes
- Storage vMotion (live migration of VM disks between storage backends)

CPU load-aware rebalancing was introduced in OpenShift 4.20, but it is not as mature as DRS.

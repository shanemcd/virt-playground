# Bug Landscape: CNV and MTV Open Issues

Analysis of open public bugs in the CNV (OpenShift Virtualization) and MTV (Migration Toolkit for Virtualization) Jira projects as of June 2026.

All issues linked below are publicly accessible (no security level set). Issues restricted to Red Hat employees were excluded from this analysis.

## Numbers at a Glance

| | CNV | MTV |
|--|-----|-----|
| **Public bugs (past year)** | 1,774 | 635 |
| **Still open** | 501 (28%) | 152 (24%) |
| **Open Critical/Blocker** | 39 | 20 |

## CNV: 501 Open Bugs

### Theme Breakdown

| Theme | Open Bugs | Notes |
|-------|-----------|-------|
| Migration | 118 | Dominant category, 27 are specifically live migration |
| Storage / Volume / Disk | ~80 | Volume operations, storage migration, disk lifecycle |
| UI | 30 | Console plugin bugs |
| Network | 27 | UDN interactions, interface issues |
| Snapshot / Clone | 44 | Restore failures, hotplug state not preserved |
| Windows | 20 | Disk offline after upgrade, memory limits |
| Hotplug | 17 | See [hotplug-landscape.md](components/kubevirt/hotplug-landscape.md) |
| Memory / CPU | 33 | Sizing, hotplug, NUMA alignment |
| CDI | 14 | Data import pipeline issues |
| virt-launcher | 15 | Pod-level issues |
| Multi-arch (ARM, s390x) | 15 | Architecture-specific failures |
| Upgrade | 10 | Version-to-version breakage |
| Templates / SSP | 22 | Template metadata, boot sources |
| GPU | 4 | Passthrough issues |

### Priority Distribution (Open Only)

| Priority | Count |
|----------|-------|
| Undefined | 193 |
| Normal | 136 |
| Major | 109 |
| Critical | 34 |
| Minor | 24 |
| Blocker | 5 |

### Critical and Blocker Bugs

**RBAC bypass across all versions:**
- [CNV-85545](https://issues.redhat.com/browse/CNV-85545) - virt-api SubjectAccessReview truncates deep subresources (plus 11 backport clones to every supported version from 4.12 through 4.22)

**Migration failures:**
- [CNV-88738](https://issues.redhat.com/browse/CNV-88738) - Post-copy migration fails on RHCOS 10.2 nodes
- [CNV-84023](https://issues.redhat.com/browse/CNV-84023) - Same issue tracked for 5.0
- [CNV-87360](https://issues.redhat.com/browse/CNV-87360) - Host model VMs fail to migrate after 4.21 to 4.22 upgrade (Blocker)
- [CNV-80999](https://issues.redhat.com/browse/CNV-80999) - Migrations failing on AMD clusters after upgrading to 4.20.6 due to cmp_legacy CPU feature (Blocker)
- [CNV-81458](https://issues.redhat.com/browse/CNV-81458) - Host-model CPU features HLE and RTM not always reported, causing migration issues
- [CNV-67849](https://issues.redhat.com/browse/CNV-67849) - 10k VMIs all migrating leads to cluster-wide migration deadlock
- [CNV-67852](https://issues.redhat.com/browse/CNV-67852) - Priority queue in migration controller not working as intended
- [CNV-82112](https://issues.redhat.com/browse/CNV-82112) - OCP-to-OCP migration running indefinitely in CopyDisks phase
- [CNV-79576](https://issues.redhat.com/browse/CNV-79576) - Migration with RWO backend storage won't migrate bitmaps

**Snapshot and backup:**
- [CNV-85377](https://issues.redhat.com/browse/CNV-85377) - Incremental backup fails with "domain checkpoint not found" (Blocker)
- [CNV-74530](https://issues.redhat.com/browse/CNV-74530) - VM snapshot shows QuiesceFailed if freeze takes >5 seconds in Windows VMs (Blocker)
- [CNV-87183](https://issues.redhat.com/browse/CNV-87183) - Restored VM enters CrashLoopBackOff after snapshot
- [CNV-75596](https://issues.redhat.com/browse/CNV-75596) - Change size does not work while adding volume from volume snapshot

**Storage:**
- [CNV-84384](https://issues.redhat.com/browse/CNV-84384) - Storage migration stuck in Pending due to ClaimMisbound on hotplugged volumes
- [CNV-72874](https://issues.redhat.com/browse/CNV-72874) - Migration of any PVC in a namespace fails if leftover PVCs from previous failed migration are present
- [CNV-87351](https://issues.redhat.com/browse/CNV-87351) - Volume upload fails if namespace has a primary UDN

**Windows:**
- [CNV-83327](https://issues.redhat.com/browse/CNV-83327) - Windows disks go offline after reboot following upgrade to 4.20
- [CNV-82176](https://issues.redhat.com/browse/CNV-82176) - Windows 2019 VMs cannot start with >=256GB memory
- [CNV-77594](https://issues.redhat.com/browse/CNV-77594) - Enabling Windows Memory Integrity degrades performance

**Resource management:**
- [CNV-63538](https://issues.redhat.com/browse/CNV-63538) - virt-launcher pod consuming more memory than assigned to VM
- [CNV-76448](https://issues.redhat.com/browse/CNV-76448) - Auto vCPU placement needed for best NUMA alignment of small VMs
- [CNV-66505](https://issues.redhat.com/browse/CNV-66505) - Large vCPU count created from template fails

**Other:**
- [CNV-86729](https://issues.redhat.com/browse/CNV-86729) - TLS profile enforcement, still accepts TLS 1.2 (Blocker)
- [CNV-84386](https://issues.redhat.com/browse/CNV-84386) - RHEL 9.8 not found in templates
- [CNV-76705](https://issues.redhat.com/browse/CNV-76705) - BlockMultiqueue set to false does not disable it

## MTV: 152 Open Bugs

### Theme Breakdown

| Theme | Open Bugs | Notes |
|-------|-----------|-------|
| Migration failures | 61 | Core function, warm and cold |
| UI | 17 | Forklift console plugin |
| Plan lifecycle | 16 | Plan management, cleanup |
| Disk / Storage | 23 | Populator pods, PVC cleanup |
| Warm migration | 12 | Snapshot management, auth, delays |
| Cold migration | 11 | vmexport, boot order |
| Provider | 10 | Source provider connectivity |
| VDDK | 8 | VMware disk transfer library |
| Network | 7 | Network mapping issues |
| Populator | 6 | Volume populator framework |
| VMware / vSphere | 10 | Source-specific |
| OVA | 5 | OVA import |
| EC2 | 5 | AWS source provider |
| Windows | 4 | Guest-specific migration issues |

### Priority Distribution (Open Only)

| Priority | Count |
|----------|-------|
| Major | 46 |
| Undefined | 44 |
| Normal | 35 |
| Critical | 18 |
| Minor | 7 |
| Blocker | 2 |

### Critical and Blocker Bugs

**Data integrity:**
- [MTV-5655](https://issues.redhat.com/browse/MTV-5655) - Populator pod cleanup deletes pods belonging to other VMs in the same migration
- [MTV-5437](https://issues.redhat.com/browse/MTV-5437) - Orphaned vSphere snapshot after Conversion CR failure

**Warm migration:**
- [MTV-4577](https://issues.redhat.com/browse/MTV-4577) - Warm migration fails with "session is not authenticated"
- [MTV-4436](https://issues.redhat.com/browse/MTV-4436) - Warm migration delayed ~8 hours at WaitForPenultimateSnapshotRemoval due to vSphere snapshot consolidation
- [MTV-4369](https://issues.redhat.com/browse/MTV-4369) - Storage-offload warm migration fails, "could not find current snapshot"

**Post-migration boot:**
- [MTV-3227](https://issues.redhat.com/browse/MTV-3227) - Failed to boot VM needing legacy drivers after migrating from vSphere
- [MTV-4165](https://issues.redhat.com/browse/MTV-4165) - Incorrect boot order for guest disks

**UI:**
- [MTV-5489](https://issues.redhat.com/browse/MTV-5489) - React crash when expanding VM row with concerns (Blocker)

**Provider issues:**
- [MTV-5604](https://issues.redhat.com/browse/MTV-5604) - Tag fetching takes too long, collector runs slow (Blocker)
- [MTV-4661](https://issues.redhat.com/browse/MTV-4661) - Command to populate authorized_keys on ESXi does not work
- [MTV-5521](https://issues.redhat.com/browse/MTV-5521) - Resolving PV to LUN fails on PureStorage with ActiveCluster

**Cleanup and lifecycle:**
- [MTV-5606](https://issues.redhat.com/browse/MTV-5606) - Archiving and deleting a failed VMware plan does not clean up PVCs
- [MTV-5628](https://issues.redhat.com/browse/MTV-5628) - Deep inspection conversion CR not cleaned up, causes preflight failure
- [MTV-2800](https://issues.redhat.com/browse/MTV-2800) - Unknown status due to "/" slash in VM name

**Configuration:**
- [MTV-5673](https://issues.redhat.com/browse/MTV-5673) - customizationScripts don't work
- [MTV-5560](https://issues.redhat.com/browse/MTV-5560) - Cannot disable FEATURE_USE_CONVERSION_CR via ForkliftController CR
- [MTV-5439](https://issues.redhat.com/browse/MTV-5439) - Add XFSv4 compatibility option to deep inspection
- [MTV-3516](https://issues.redhat.com/browse/MTV-3516) - forklift-controller doesn't handle "Skipped" status from vmexport

## Patterns

**Migration is the #1 problem area in both projects.** In CNV, 118 of 501 open bugs (24%) involve migration. In MTV, migration is the entire product, but warm migration specifically accounts for a disproportionate share of Critical bugs.

**Upgrade paths break migration.** Multiple Critical/Blocker bugs are triggered by upgrading CNV versions, particularly around CPU model compatibility (host-model, cmp_legacy, HLE/RTM features). Customers upgrade CNV and then VMs can't migrate.

**Snapshot and backup are fragile.** Incremental backup, snapshot quiesce on Windows, and restore operations have multiple open Blockers. The interaction between snapshots and hotplug (hotplugged state not preserved in snapshots) adds to this.

**Scale is untested.** The 10k VMI migration deadlock (CNV-67849) and the migration priority queue not working (CNV-67852) suggest that large-scale deployments hit issues that aren't caught in CI.

**Cleanup and lifecycle management is a recurring gap.** Both projects have bugs about leftover resources (PVCs, pods, snapshots) from failed operations blocking subsequent operations.

**Windows is a second-class citizen.** Disk offline after upgrade, memory limits, snapshot quiesce timeouts, performance degradation with Memory Integrity, legacy driver issues post-migration.

# VMware vSphere vs. OpenShift Virtualization

Architectural differences and conceptual mappings for people coming from a VMware background.

## Architectural Difference

VMware vSphere uses a **hypervisor-centric** architecture. ESXi is a Type-1 (bare-metal) hypervisor that sits directly on hardware. VMs are first-class citizens, defined as sets of files (VMDK, VMX) on VMFS datastores. vCenter provides centralized management. The entire stack is proprietary and tightly integrated.

OpenShift Virtualization uses a **container-native** architecture. It runs on RHEL CoreOS with the KVM hypervisor built into the Linux kernel. VMs are wrapped inside Kubernetes pods using KubeVirt: each VM runs as a QEMU-KVM process inside a virt-launcher pod. VMs become Kubernetes-native objects, managed via the same API, RBAC, networking, and storage abstractions as containers.

## Conceptual Mappings

| VMware Concept | OpenShift Equivalent | Notes |
|---|---|---|
| vCenter Server | OpenShift API Server + Console | Unified management for VMs and containers |
| ESXi hypervisor | RHEL CoreOS + KVM + KubeVirt | KVM is the hypervisor; KubeVirt is the management layer |
| VMDK disk images | PVCs with qcow2/raw images | VM disks are Kubernetes storage objects |
| VMX config files | VirtualMachine / VMI CRs | Declarative YAML instead of config files |
| VMFS / vVols / Datastores | CSI drivers / StorageClasses / PVs | Standard Container Storage Interface |
| vSwitch / dvSwitch | OVN-Kubernetes / Multus / Linux Bridge | Multiple CNI plugins supported |
| vMotion | Live Migration | Comparable; requires RWX storage |
| Storage vMotion | No direct equivalent | Active area of development |
| vSphere HA / DRS | K8s HA / Machine Health Checks / Pod scheduling | Automatic rescheduling on node failure |
| vSphere FT | No direct equivalent | No synchronized secondary VM replica |
| SRM | ACM Metro-DR / Regional-DR | Multi-cluster DR orchestration |
| NSX | OVN-Kubernetes / NetworkPolicies | Native microsegmentation |
| vSphere Tags | Kubernetes Labels / Annotations | Kubernetes-native metadata |

## What You Gain

**Unified platform.** VMs and containers on the same infrastructure, sharing CI/CD pipelines, GitOps workflows, RBAC, monitoring (Prometheus/Grafana), and service mesh.

**Open source foundation.** KubeVirt is CNCF-hosted; KVM is mainline Linux. No proprietary hypervisor lock-in.

**Cloud-native operations.** Declarative infrastructure-as-code, Operators for lifecycle management, admission controllers and OPA/Gatekeeper for policy enforcement.

**Cost predictability.** Subscription pricing is simpler than VMware's post-Broadcom licensing model.

## What You Lose (or What's Less Mature)

**Memory management.** VMware's Transparent Page Sharing, memory ballooning, and memory overcommitment are more refined. KVM has KSM and virtio-balloon but the tooling is less automated.

**Fault Tolerance.** VMware FT provides zero-downtime failover via a synchronized secondary VM. There is no OpenShift equivalent.

**Storage vMotion.** Cannot live-migrate VM storage between storage backends.

**Third-party ecosystem.** VMware has 20+ years of backup, monitoring, security, and automation integrations. OpenShift's ecosystem is growing but shallower.

**Operational familiarity.** VMware admins need to learn Kubernetes concepts (pods, CRs, CSI, CNI). This is consistently cited as the steepest adoption barrier.

**DR sophistication.** VMware SRM is more mature than ACM's DR capabilities.

## Common Workload Patterns on OpenShift Virtualization

**Windows Server VMs**: SVVP-certified. Platform ships optimized templates. VirtIO bus is strongly recommended over SATA for disk and network performance.

**Legacy Linux applications**: The primary driver for many adoptions. Applications that cannot be containerized run as VMs alongside modern containerized services.

**Database servers**: Validated reference architectures exist for Oracle 19c, MariaDB, PostgreSQL, MSSQL. Database throughput approaches bare-metal performance without special tuning, though storage latency is critical.

**Telco / NFV**: Network functions not yet containerized. SR-IOV and Multus multi-NIC support are important here.

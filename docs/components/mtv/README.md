# Migration Toolkit for Virtualization (MTV)

MTV automates bulk migration of VMs from source hypervisors into OpenShift Virtualization. Built on the Konveyor project, installable from OperatorHub.

## What It Does

Connects to external hypervisors (VMware vSphere, Red Hat Virtualization, OpenStack, OVA files), inventories VMs, transfers disk data, converts disk images to work with KubeVirt, and creates VirtualMachine CRs on the target cluster.

## Repo

[kubev2v/forklift](https://github.com/kubev2v/forklift)

## Components

| File | What it covers |
| ---- | -------------- |
| [migration-pod.md](migration-pod.md) | The pod that runs virt-v2v, connects to source hypervisors, and converts disk images |

## Migration Workflow

1. **Connect Providers**: Register a source provider (vCenter endpoint, credentials, TLS certificate) and a target provider (OpenShift cluster). MTV uses the vCenter API to discover the inventory of VMs, networks, and datastores.

2. **Create Network and Storage Mappings**: Define a `NetworkMap` CR that maps source vSphere PortGroups to OpenShift `NetworkAttachmentDefinition` resources. Define a `StorageMap` CR that maps vSphere Datastores to OpenShift StorageClasses. These mappings are reusable across multiple migration plans.

3. **Build a Migration Plan**: A `Plan` CR selects VMs and assigns the network/storage mappings. Choose cold or warm migration at this point.

4. **Execute the Migration**: 
   - **Cold migration** (default): Source VMs are shut down, disk data is copied via the VDDK SDK into PVs on the target cluster, then `virt-v2v` runs to install VirtIO drivers and reconfigure the guest OS. Faster total elapsed time, but longer downtime.
   - **Warm migration**: An initial full snapshot is copied while the VM keeps running. Incremental Changed Block Tracking (CBT) deltas are copied at scheduled intervals (default: one hour). When you trigger cutover, the VM is shut down, a final delta is copied, and conversion runs. Minimizes downtime but takes longer overall. Requires CBT enabled on the source VM (max 28 snapshots).

5. **Conversion and Boot**: The conversion pod runs `virt-v2v`, which installs/configures VirtIO device drivers on the target disk images. A `VirtualMachine` CR is created, and KubeVirt boots the VM.

## Supported Sources

- VMware vSphere 6.7+
- Red Hat Virtualization (oVirt)
- OpenStack
- VMware OVA files
- Remote OpenShift Virtualization clusters

## Key Challenges

**VDDK dependency.** While technically optional, VDDK is effectively required for VMware migrations (mandatory for vSAN-backed VMs). You must download the SDK from VMware, build a container image, and push it to a private registry.

**Resource contention at scale.** Concurrent migrations are resource-intensive. The `MAX_VM_INFLIGHT` setting controls parallelism. If Kubernetes resource quotas are too tight, migrations fail. Migrating more than 10 VMs from a single ESXi host requires increasing the NFC service memory on that host.

**Guest OS compatibility.** Warm migrations support fewer guest OS types than cold migrations. Multi-boot/dual-boot VMs have limited support. Hibernated VMs are not supported.

**Missing qemu-guest-agent.** In cold migrations where package managers are unavailable, MTV cannot install the qemu-guest-agent, which degrades some post-migration functionality (IP reporting, filesystem freeze for snapshots).

**Performance tuning.** Block volume mode is faster than filesystem volume mode. Network speed, storage IOPS, and vSphere API rate limits all constrain throughput.

## At Scale

Organizations running large-scale migrations (thousands of VMs) typically use Red Hat Ansible Automation Platform alongside MTV and execute in controlled waves. Emirates NBD migrated 9,000+ VMs at up to 200 per night using this approach.

# virt-playground

A learning journal for understanding OpenShift Virtualization from the ground up.

This repo documents how the full virtualization stack works, from hardware-assisted virtualization at the CPU level through KVM, QEMU, and libvirt, up to KubeVirt and its productization as OpenShift Virtualization.

## Contents

### Architecture

- [The Full Stack](docs/architecture.md) - Bottom-up walkthrough of the entire virtualization stack: hardware, KVM, QEMU, libvirt, virtio, KubeVirt, and OpenShift Virtualization
- [VM Lifecycle and Isolation](docs/vm-lifecycle-and-isolation.md) - How a VM starts at the KVM API level, how the host manages the QEMU process, and how four layers of isolation keep the guest contained
- [Component Deep Dive](docs/components.md) - KubeVirt's runtime components and how they interact
- [Networking](docs/networking.md) - How VMs get network connectivity: pod network bindings, Multus, SR-IOV
- [Storage](docs/storage.md) - VM disk management: PVCs, DataVolumes, CDI, containerDisks
- [Live Migration](docs/live-migration.md) - How live migration works, from QEMU's pre-copy algorithm through KubeVirt's orchestration

### Ecosystem

- [VMware Comparison](docs/vmware-comparison.md) - Architectural differences and conceptual mappings between vSphere and OpenShift Virtualization
- [Migration Toolkit](docs/migration-toolkit.md) - MTV: migrating VMs from vSphere, RHV, and OpenStack into OpenShift Virtualization

### Labs

#### CRC + ESXi + MTV

End-to-end lab: install OpenShift Virtualization on CRC, set up a nested ESXi host, and migrate a VM using MTV.

- [01 - Install OpenShift Virtualization](labs/crc-esxi-mtv/01-install-openshift-virtualization.md) - Deploy the operator and HyperConverged CR on a local single-node cluster
- [02 - Create a VM on OCP Virt](labs/crc-esxi-mtv/02-create-vm-on-ocp-virt.md) - Create a Fedora VM with SSH keys, explore the three-object model and virt-launcher internals
- [03 - Nested ESXi Setup](labs/crc-esxi-mtv/03-nested-esxi-setup.md) - Run ESXi 8.0U3e as a KVM guest, create a Fedora Cloud VM with cloud-init
- [04 - Migrate VM with MTV](labs/crc-esxi-mtv/04-migrate-vm-with-mtv.md) - End-to-end migration from ESXi to OpenShift Virtualization using MTV and VDDK

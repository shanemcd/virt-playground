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

#### CRC (CodeReady Containers)

- [01 - Install OpenShift Virtualization](labs/crc/01-install-openshift-virtualization.md) - Deploy the operator and HyperConverged CR on a local single-node cluster
- [02 - Create a VM](labs/crc/02-create-vm.md) - Create a Fedora VM with SSH keys, explore the three-object model and virt-launcher internals

#### ESXi

- [01 - Nested ESXi Setup](labs/esxi/01-nested-esxi-setup.md) - Run ESXi 8.0U3e as a KVM guest, create a Fedora Cloud VM with cloud-init, lessons on disk formats and driver compatibility
- [02 - Migrate VM with MTV](labs/esxi/02-migrate-vm-with-mtv.md) - End-to-end migration from ESXi to OpenShift Virtualization using MTV and VDDK

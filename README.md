# virt-playground

A learning journal for understanding OpenShift Virtualization from the ground up.

This repo documents how the full virtualization stack works, from hardware-assisted virtualization at the CPU level through KVM, QEMU, and libvirt, up to KubeVirt and its productization as OpenShift Virtualization.

## Contents

### Architecture

- [The Full Stack](docs/architecture.md) - Bottom-up walkthrough of the entire virtualization stack: hardware, KVM, QEMU, libvirt, virtio, KubeVirt, and OpenShift Virtualization
- [VM Lifecycle and Isolation](docs/vm-lifecycle-and-isolation.md) - How a VM starts at the KVM API level, how the host manages the QEMU process, and how four layers of isolation keep the guest contained
- [Components](docs/components/) - KubeVirt's runtime components end to end: operator, api, controller, handler, launcher
- [Networking](docs/networking.md) - How VMs get network connectivity: pod network bindings, Multus, SR-IOV
- [Storage](docs/storage.md) - VM disk management: PVCs, DataVolumes, CDI, containerDisks
- [Live Migration](docs/live-migration.md) - How live migration works, from QEMU's pre-copy algorithm through KubeVirt's orchestration

### Ecosystem

- [VMware Comparison](docs/vmware-comparison.md) - Architectural differences and conceptual mappings between vSphere and OpenShift Virtualization
- [Migration Toolkit](docs/migration-toolkit.md) - MTV: migrating VMs from vSphere, RHV, and OpenStack into OpenShift Virtualization
- [Ecosystem Map](docs/ecosystem-map.md) - All the projects, repos, and components in the virt space and how they fit together

### Labs

#### Reverse Engineering Console Access

Minimal Python clients that connect directly to VM console endpoints, demonstrating the WebSocket protocol:

- [Reverse Engineer Console](labs/reverse-engineer-console/) - Build custom serial console and VNC proxy clients from scratch

#### CRC + ESXi + MTV

End-to-end lab: install OpenShift Virtualization on CRC, set up a nested ESXi host, and migrate a VM using MTV.

- [01 - Install OpenShift Virtualization](labs/crc-esxi-mtv/01-install-openshift-virtualization.md) - Deploy the operator and HyperConverged CR on a local single-node cluster
- [02 - Create a VM on OCP Virt](labs/crc-esxi-mtv/02-create-vm-on-ocp-virt.md) - Create a Fedora VM with SSH keys, explore the three-object model and virt-launcher internals
- [03 - Nested ESXi Setup](labs/crc-esxi-mtv/03-nested-esxi-setup.md) - Run ESXi 8.0U3e as a KVM guest, create a Fedora Cloud VM with cloud-init
- [04 - Migrate VM with MTV](labs/crc-esxi-mtv/04-migrate-vm-with-mtv.md) - End-to-end migration from ESXi to OpenShift Virtualization using MTV and VDDK

#### CRC + oVirt + MTV

- [01 - Install oVirt Engine](labs/crc-ovirt-mtv/01-install-ovirt-engine.md) - Create a CentOS Stream 9 VM, install oVirt engine and host packages
- [02 - Configure oVirt](labs/crc-ovirt-mtv/02-configure-ovirt.md) - Add the host, set up local storage, Keycloak API authentication
- [03 - Create a VM on oVirt](labs/crc-ovirt-mtv/03-create-vm-on-ovirt.md) - Upload a Fedora Cloud image and create a VM via the REST API
- [04 - Migrate VM with MTV](labs/crc-ovirt-mtv/04-migrate-vm-with-mtv.md) - Add oVirt as an MTV source provider and migrate the VM to OCP Virt

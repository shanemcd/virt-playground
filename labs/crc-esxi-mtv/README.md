# Lab: CRC + ESXi + MTV

End-to-end lab that walks through the full OpenShift Virtualization and Migration Toolkit for Virtualization (MTV) workflow on a single workstation.

By the end, you'll have migrated a VM from a nested ESXi host to OpenShift Virtualization running on CRC, all on local hardware using nested virtualization.

## What you'll need

- A Linux workstation with nested virtualization enabled and at least 64 GB RAM
- CRC (CodeReady Containers) installed
- ESXi 8.0U3e ISO from [support.broadcom.com](https://support.broadcom.com)
- A vSphere license with full API access (the free ESXi edition won't work for MTV)
- VDDK SDK from [developer.broadcom.com](https://developer.broadcom.com/sdks/vmware-virtual-disk-development-kit-vddk/latest)

## Labs

| # | Lab | What it does |
|---|-----|-------------|
| 01 | [Install OpenShift Virtualization](01-install-openshift-virtualization.md) | Deploy the OCP Virt operator and HyperConverged CR on CRC |
| 02 | [Create a VM on OCP Virt](02-create-vm-on-ocp-virt.md) | Create a Fedora VM with SSH keys, explore the three-object model (VM/VMI/Pod) |
| 03 | [Nested ESXi Setup](03-nested-esxi-setup.md) | Run ESXi as a KVM guest, create a Fedora Cloud VM with cloud-init |
| 04 | [Migrate VM with MTV](04-migrate-vm-with-mtv.md) | Install MTV, build VDDK image, migrate the VM from ESXi to OCP Virt |

## Architecture

Everything runs on one machine using nested virtualization:

```
Linux workstation (KVM)
├── CRC VM (OpenShift 4.21, single-node)
│   ├── OpenShift Virtualization (KubeVirt)
│   │   └── Migrated Fedora VM (KVM inside KVM)
│   └── MTV (Forklift)
│       └── Connects to ESXi via vSphere SDK + VDDK
└── ESXi VM (nested, 8.0U3e)
    └── Fedora VM (source for migration)
```

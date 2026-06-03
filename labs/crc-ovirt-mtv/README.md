# Lab: oVirt to OpenShift Virtualization

Set up a local oVirt environment and migrate a VM to OpenShift Virtualization using MTV.

oVirt is the upstream project for Red Hat Virtualization (RHV). It provides a web-based management interface for KVM hypervisors, similar to VMware vCenter managing ESXi hosts. RHV is deprecated by Red Hat in favor of OpenShift Virtualization. oVirt continues as a community project.

## What you'll need

- A Linux workstation with nested virtualization enabled
- CRC with OpenShift Virtualization and MTV installed (from the [CRC + ESXi + MTV lab](../crc-esxi-mtv/))
- CentOS Stream 9 boot ISO

## Labs

| # | Lab | What it does |
|---|-----|-------------|
| 01 | [Install oVirt Engine](01-install-ovirt-engine.md) | Create a CentOS Stream 9 VM, install oVirt engine and host packages |
| 02 | [Configure oVirt](02-configure-ovirt.md) | Add the host, set up local storage, Keycloak API authentication |
| 03 | [Create a VM on oVirt](03-create-vm-on-ovirt.md) | Upload a Fedora Cloud image and create a VM via the REST API |
| 04 | [Migrate VM with MTV](04-migrate-vm-with-mtv.md) | Add oVirt as an MTV source provider and migrate the VM to OCP Virt |

## Architecture

```
Linux workstation (KVM)
├── CRC VM (OpenShift 4.21, single-node)
│   ├── OpenShift Virtualization (KubeVirt)
│   │   └── Migrated Fedora VM
│   └── MTV (Forklift)
│       └── Connects to oVirt via REST API + imageio
└── oVirt VM (CentOS Stream 9)
    ├── ovirt-engine (management)
    ├── VDSM (host agent)
    └── Fedora VM (source for migration)
```

## oVirt migration vs ESXi migration

- **No VDDK required**. oVirt uses its own imageio service for disk transfers.
- **Simpler pipeline**. Skips the ImageConversion step (no virt-v2v needed since oVirt VMs already use virtio drivers).
- **Faster**. Our test completed in under 2 minutes vs several minutes for ESXi.
- **Same CRDs**. Provider, Plan, Migration, NetworkMap, StorageMap all work the same way. The Forklift adapter pattern handles the provider differences internally.

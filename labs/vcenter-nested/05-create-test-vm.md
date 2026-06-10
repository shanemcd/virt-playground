# Lab: Create a Test VM on vCenter

Create a Fedora Server VM managed by vCenter, ready to be migrated with MTV.

## Prerequisites

- vCenter running with ESXi host added ([lab 04](04-configure-vcenter.md))
- `govc` installed
- Fedora Server netinst ISO on the datastore

## 1. Install govc

```bash
curl -sL https://github.com/vmware/govmomi/releases/latest/download/govc_Linux_x86_64.tar.gz \
  | tar xz -C /usr/local/bin govc
```

## 2. Set environment variables

```bash
export GOVC_URL="https://vcsa.lab.local/sdk"
export GOVC_USERNAME="administrator@vsphere.local"
export GOVC_PASSWORD='<sso-password>'
export GOVC_INSECURE=true
export GOVC_DATACENTER="Datacenter"
```

## 3. Upload the Fedora Server ISO

```bash
curl -L -o /tmp/fedora-server-netinst.iso \
  "https://download.fedoraproject.org/pub/fedora/linux/releases/44/Server/x86_64/iso/Fedora-Server-netinst-x86_64-44-1.7.iso"

govc datastore.upload -ds datastore1 /tmp/fedora-server-netinst.iso fedora-server-netinst.iso
```

## 4. Create the VM

```bash
govc vm.create \
  -ds=datastore1 \
  -net="VM Network" \
  -net.adapter=e1000e \
  -m=2048 \
  -c=1 \
  -g=other4xLinux64Guest \
  -disk=10GB \
  -disk.controller=scsi \
  -on=false \
  fedora-01

govc device.cdrom.add -vm fedora-01
govc device.cdrom.insert -vm fedora-01 -ds datastore1 fedora-server-netinst.iso
govc device.boot -vm fedora-01 -order cdrom,disk
```

### Why Fedora Server and not Fedora Cloud?

The Fedora Cloud image is built for KVM/virtio. It lacks SCSI drivers (LSI Logic, PVSCSI) in its initramfs, so it can't boot on a VM with a SCSI disk controller.

VDDK-based migration requires SCSI controllers. ESXi does not create delta VMDKs when snapshotting SATA-attached disks on powered-off VMs, and VDDK needs those delta disks to transfer data. This is a [documented VMware limitation](https://github.com/openshift/openshift-docs/blob/enterprise-4.21/modules/virt-importing-vm-wizard.adoc#L20): "Virtual disks must be connected to IDE or SCSI controllers."

The Fedora Server installer loads LSI Logic drivers during installation, so the resulting system boots fine on SCSI.

### Why `other4xLinux64Guest`?

ESXi 8.x on nested KVM doesn't recognize `fedora64Guest`. Use `other4xLinux64Guest` instead.

## 5. Install Fedora

```bash
govc vm.power -on fedora-01
```

Open the VM console in the vSphere Client (`https://vcsa.lab.local/ui`) and complete the Fedora Server installer:

1. Set the root password or create a user
2. Configure networking (DHCP is fine)
3. Accept the default disk partitioning
4. Start the installation and wait for it to finish
5. Reboot

After reboot, verify you can SSH in from your workstation (the VM will get a DHCP address on the 192.168.122.0/24 network).

## 6. Power off

Power off the VM before migration:

```bash
govc vm.power -off fedora-01
```

## What you have now

A Fedora Server VM on ESXi with an LSI Logic SCSI controller, managed by vCenter, ready for VDDK-based migration to OpenShift Virtualization.

```
vCenter (vcsa.lab.local)
└── Datacenter
    └── ESXi Host (192.168.122.51)
        ├── fedora-01 (Fedora Server, SCSI disk, e1000e NIC)
        └── vCenter Server Appliance
```

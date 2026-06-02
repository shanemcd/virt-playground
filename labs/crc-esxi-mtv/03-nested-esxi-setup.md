# Lab: Nested ESXi on KVM/libvirt

Set up ESXi 8.0U3e as a nested VM on a Fedora workstation using KVM/libvirt, with a guest VM ready for migration testing.

## Prerequisites

- Fedora workstation with nested virtualization enabled (`/sys/module/kvm_intel/parameters/nested` = `Y`)
- ESXi 8.0U3e ISO (download from [support.broadcom.com](https://support.broadcom.com) under Free Software Downloads)
- A vSphere license that enables full API access (the free edition restricts the API to read-only)

## ESXi Free Edition Limitations

The free ESXi ISO (build 24677879) has API write restrictions baked into the binary. This means:

- You can create VMs through the web UI, but not through the vSphere API
- Tools like MTV, Ansible, Terraform, and Veeam cannot interact with VMs programmatically
- The vStorage APIs (used by VDDK for disk transfers) are disabled

For migration testing with MTV, you need a paid license (Essentials or higher) applied to the host. The free ISO accepts paid license keys without reinstallation.

## 1. Create the ESXi VM

```bash
LIBVIRT_DEFAULT_URI=qemu:///system virt-install \
  --name esxi \
  --ram 16384 \
  --vcpus 4 \
  --cpu host-passthrough \
  --os-variant generic \
  --disk size=100,bus=sata \
  --cdrom /path/to/VMware-VMvisor-Installer-8.0U3e.x86_64.iso \
  --network network=default,model=vmxnet3 \
  --graphics vnc,listen=0.0.0.0 \
  --boot uefi \
  --noautoconsole
```

Key settings:
- `host-passthrough` CPU mode exposes VMX flags for nested virtualization
- `vmxnet3` NIC model (ESXi's native driver)
- UEFI boot
- 100 GB SATA disk for the ESXi boot volume

## 2. Install ESXi

Connect to the VNC console (or use `virt-manager`) and complete the interactive installer. Set a root password.

## 3. Add a datastore disk

ESXi uses the entire boot disk for its partitions. Add a second disk for VM storage:

```bash
# Shut down ESXi
LIBVIRT_DEFAULT_URI=qemu:///system virsh shutdown esxi

# Create and attach a second disk
sudo qemu-img create -f qcow2 /var/lib/libvirt/images/esxi-datastore.qcow2 200G
sudo virsh attach-disk esxi /var/lib/libvirt/images/esxi-datastore.qcow2 sdb \
  --subdriver qcow2 --persistent --targetbus sata

# Start ESXi
sudo virsh start esxi
```

Then in the ESXi web UI, go to **Storage** > **New datastore** and create a VMFS datastore on the new disk.

## 4. Enable SSH

In the ESXi web UI: **Host** > **Actions** > **Services** > **Enable Secure Shell (SSH)**.

ESXi uses a non-standard SSH key path:
```bash
# This won't work:
ssh-copy-id root@<esxi-ip>

# Do this instead:
ssh root@<esxi-ip> "cat >> /etc/ssh/keys-root/authorized_keys" < ~/.ssh/id_rsa.pub
```

## 5. Create a guest VM with Fedora Cloud image

### Prepare the disk image

Download the Fedora Cloud qcow2 and convert it to VMDK:

```bash
# Download
curl -L -o /tmp/fedora-cloud.qcow2 \
  "https://download.fedoraproject.org/pub/fedora/linux/releases/44/Cloud/x86_64/images/Fedora-Cloud-Base-Generic-44-1.7.x86_64.qcow2"

# Convert to streamOptimized VMDK for upload
qemu-img convert -f qcow2 -O vmdk -o subformat=streamOptimized \
  /tmp/fedora-cloud.qcow2 /tmp/fedora-cloud.vmdk
```

Upload to the ESXi datastore:

```bash
curl -sk --user 'root:<password>' \
  -T /tmp/fedora-cloud.vmdk \
  "https://<esxi-ip>/folder/fedora-cloud.vmdk?dcPath=ha-datacenter&dsName=datastore1"
```

Convert to native ESXi format on the host (the uploaded streamOptimized VMDK cannot be used directly as a VM disk):

```bash
ssh root@<esxi-ip> "mkdir /vmfs/volumes/datastore1/fedora-test && \
  vmkfstools -i /vmfs/volumes/datastore1/fedora-cloud.vmdk \
  /vmfs/volumes/datastore1/fedora-test/fedora-test.vmdk -d thin"
```

### Prepare cloud-init ISO

Cloud-init on the Fedora Cloud image uses the NoCloud datasource. Create a seed ISO with user credentials:

```bash
mkdir -p /tmp/cidata

cat > /tmp/cidata/meta-data << 'EOF'
instance-id: fedora-test
local-hostname: fedora-test
EOF

cat > /tmp/cidata/user-data << 'EOF'
#cloud-config
users:
  - name: fedora
    plain_text_passwd: fedora
    lock_passwd: false
    sudo: ALL=(ALL) NOPASSWD:ALL
    shell: /bin/bash
    ssh_authorized_keys:
      - <your-ssh-public-key>
ssh_pwauth: true
EOF

genisoimage -output /tmp/cidata.iso -volid cidata -joliet -rock \
  /tmp/cidata/user-data /tmp/cidata/meta-data
```

Upload the ISO:

```bash
curl -sk --user 'root:<password>' \
  -T /tmp/cidata.iso \
  "https://<esxi-ip>/folder/cidata.iso?dcPath=ha-datacenter&dsName=datastore1"
```

### Cloud-init gotchas

- The `password` field at the top level of user-data does NOT work when you also define a `users` block. Use `plain_text_passwd` inside the user definition.
- `lock_passwd: false` is required, otherwise the password is set but the account stays locked for console login.
- If cloud-init already ran on a previous boot, change the `instance-id` in meta-data to force it to re-run.
- The ISO volume label MUST be `cidata` (lowercase). Cloud-init looks for this specific label.

### Create the VM

The Fedora Cloud image requires a SATA disk controller (it doesn't include PVSCSI or LSI Logic drivers in its initramfs). Use an e1000 NIC for broadest compatibility:

```bash
ssh root@<esxi-ip> << 'SSHEOF'
cat > /vmfs/volumes/datastore1/fedora-test/fedora-test.vmx << 'VMX'
.encoding = "UTF-8"
config.version = "8"
virtualHW.version = "21"
displayName = "fedora-test"
guestOS = "fedora64Guest"
numvcpus = "1"
memSize = "2048"

sata0.present = "TRUE"
sata0:0.present = "TRUE"
sata0:0.fileName = "fedora-test.vmdk"
sata0:0.deviceType = "disk"

ide0:0.present = "TRUE"
ide0:0.deviceType = "cdrom-image"
ide0:0.fileName = "/vmfs/volumes/datastore1/cidata.iso"
ide0:0.startConnected = "TRUE"

ethernet0.present = "TRUE"
ethernet0.virtualDev = "e1000"
ethernet0.networkName = "VM Network"
ethernet0.addressType = "generated"
ethernet0.startConnected = "TRUE"

serial0.present = "TRUE"
serial0.fileType = "file"
serial0.fileName = "/vmfs/volumes/datastore1/fedora-test/console.log"
serial0.yieldOnMsrRead = "TRUE"
VMX

vim-cmd solo/registervm /vmfs/volumes/datastore1/fedora-test/fedora-test.vmx
SSHEOF
```

Power on (replace `<vmid>` with the ID returned by registervm):

```bash
ssh root@<esxi-ip> "vim-cmd vmsvc/power.on <vmid>"
```

Or with a paid license, create the VM programmatically via pyvmomi.

### Verify

Check serial console output to confirm cloud-init ran:

```bash
ssh root@<esxi-ip> "grep cloud-init /vmfs/volumes/datastore1/fedora-test/console.log | tail -5"
```

Look for: `Datasource DataSourceNoCloud [seed=/dev/sr0]`

Log in at the ESXi web console with `fedora` / `fedora`.

## Lessons learned

- **ESXi free edition has API restrictions baked into the binary**, not just the license config. You cannot put the free ISO into evaluation mode.
- **vmkfstools** is required to convert uploaded VMDKs to native ESXi format. The streamOptimized VMDK from `qemu-img convert` is an import format, not a runtime format.
- **Fedora Cloud images need SATA or IDE controllers on ESXi**. The initramfs doesn't include PVSCSI or LSI Logic drivers. It will get stuck in dracut's initqueue trying to find the root filesystem.
- **Cloud-init user-data formatting matters**: when using a `users` block, credentials must be inside the user definition (`plain_text_passwd`, `lock_passwd: false`), not at the top level.
- **ESXi SSH authorized_keys** live at `/etc/ssh/keys-<username>/authorized_keys`, not the standard `~/.ssh/authorized_keys`.
- **VMFS file locks** can become stale and survive reboots. The fix is to clone the disk with `vmkfstools -i` to a new file, or destroy and recreate.

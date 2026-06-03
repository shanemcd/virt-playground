# Lab 01: Install oVirt Engine on CentOS Stream 9

Create a CentOS Stream 9 VM and install the oVirt engine.

## Prerequisites

- CentOS Stream 9 boot ISO (download from [mirror.stream.centos.org](https://mirror.stream.centos.org/9-stream/BaseOS/x86_64/iso/))

## 1. Create the VM

```bash
LIBVIRT_DEFAULT_URI=qemu:///system virt-install \
  --name ovirt \
  --ram 16384 \
  --vcpus 4 \
  --cpu host-passthrough \
  --os-variant centos-stream9 \
  --disk size=80,bus=virtio \
  --cdrom /path/to/CentOS-Stream-9-latest-x86_64-boot.iso \
  --network network=default,model=virtio \
  --graphics vnc,listen=0.0.0.0 \
  --boot cdrom,hd \
  --noautoconsole
```

Use `--boot cdrom,hd` to ensure the installer boots first. Without this, the VM tries to boot from the empty disk.

## 2. Install CentOS Stream 9

Open the VM in virt-manager. The boot ISO is a network installer:

1. Enable networking first (toggle the interface on in **Network & Hostname**)
2. Set installation source to: `https://mirror.stream.centos.org/9-stream/BaseOS/x86_64/os/`
3. Select **Server** installation (minimal, no GUI)
4. Set root password
5. Use the full 80 GB disk

If networking won't connect, restart libvirtd on the host (`sudo systemctl restart libvirtd`). After a host reboot, the dnsmasq DHCP process sometimes doesn't start correctly.

## 3. Set hostname

```bash
ssh root@<ovirt-ip> "hostnamectl set-hostname ovirt.localdomain"
ssh root@<ovirt-ip> "echo '<ovirt-ip> ovirt.localdomain' >> /etc/hosts"
```

## 4. Install oVirt packages

```bash
ssh root@<ovirt-ip> "dnf copr enable -y ovirt/ovirt-master-snapshot centos-stream-9-x86_64"
ssh root@<ovirt-ip> "dnf install -y ovirt-release-master"
ssh root@<ovirt-ip> "dnf install -y ovirt-engine ovirt-host"
```

The official docs mention enabling `pki-deps`, `javapackages-tools`, and `postgresql:12` modules. On CentOS Stream 9 with the master snapshot, these modules don't exist. Skip them.

## 5. Run engine-setup

This must be run interactively (the password prompt reads from the terminal directly).

```bash
ssh -t root@<ovirt-ip> engine-setup
```

Answers for the prompts:
- Configure managed block integration: **No**
- Configure Engine on this host: **Yes**
- Configure ovirt-provider-ovn: **Yes**
- Configure WebSocket Proxy: **Yes**
- Configure Data Warehouse: **Yes**
- Configure Grafana: **Yes**
- FQDN: **accept default** (ovirt.localdomain)
- Configure firewall: **Yes**
- Application mode: **Virt**
- Default SAN wipe after delete: **No**
- All database questions: **accept defaults** (Automatic/Local)
- Admin password: set one you'll remember
- Everything else: **accept defaults**

After completion, restart the engine as instructed:

```bash
ssh root@<ovirt-ip> "systemctl restart ovirt-engine"
```

## 6. Access the web UI

Add oVirt to your local hosts file:

```bash
echo '<ovirt-ip> ovirt.localdomain' | sudo tee -a /etc/hosts
```

Open `https://ovirt.localdomain/ovirt-engine`. Login: `admin@ovirt` with the password from setup.

The engine serves its UI over HTTPS with a self-signed certificate. No GUI is needed on the server itself.

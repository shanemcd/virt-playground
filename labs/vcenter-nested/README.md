# Lab: Deploy vCenter on Nested ESXi

Deploy a vCenter Server Appliance (VCSA) onto a nested ESXi host running as a KVM guest, all on one Linux workstation. By the end you'll have a working vCenter managing your ESXi host, ready for use as an MTV migration source or general vSphere lab.

## What you'll need

- A Linux workstation with nested virtualization enabled and at least 64 GB RAM
- ESXi 8.x already running as a KVM guest (see [crc-esxi-mtv lab 03](../crc-esxi-mtv/03-nested-esxi-setup.md))
- VCSA 8.0.3+ ISO (`VMware-VCSA-all-8.0.3-*.iso`)
- A vSphere ESXi license with full API access
- A vCenter Server Standard license

## Labs

| # | Lab | What it does |
|---|-----|-------------|
| 01 | [Set Up Lab DNS](01-setup-lab-dns.md) | Configure libvirt dnsmasq with forward and reverse DNS for the lab network |
| 02 | [Prepare ESXi Host](02-prepare-esxi-host.md) | Verify ESXi resources and enable SSH |
| 03 | [Deploy vCenter](03-deploy-vcenter.md) | Deploy the VCSA using the CLI installer |
| 04 | [Configure vCenter](04-configure-vcenter.md) | Log in, apply licenses, and add the ESXi host to inventory |
| 05 | [Create a Test VM](05-create-test-vm.md) | Create a Fedora Server VM via govc with SCSI controller |
| 06 | [Migrate VM with MTV](06-migrate-vm-with-mtv.md) | Migrate the VM from vCenter to OpenShift Virtualization |

## Architecture

```
Linux workstation (KVM)
├── libvirt dnsmasq
│   ├── esxi.lab.local  → 192.168.122.51
│   └── vcsa.lab.local  → 192.168.122.100
└── ESXi VM (nested, 4 vCPU, 20 GB RAM)
    └── vCenter Server Appliance (tiny profile, 2 vCPU, 14 GB RAM)
        └── Manages ESXi host via vSphere API
```

## Gotchas we hit

**DNS is critical.** The VCSA firstboot process registers every service with the SSO Lookup Service via SOAP calls. Without working forward and reverse DNS, these calls hang indefinitely. The VCSA will appear to be stuck at "Starting VMware License Service" (31%) for hours. Configure DNS before deploying.

**The `tiny` deployment profile works fine with proper DNS.** Earlier attempts with `tiny` appeared to hang, but the root cause was DNS, not resources. With working forward and reverse DNS, `tiny` (2 vCPU, 14 GB RAM) completes firstboot without issues.

**NTP must be reachable.** An earlier attempt failed immediately because the VCSA couldn't sync time with the configured NTP server. Use `pool.ntp.org` or another server the VCSA can reach. Your workstation is not an NTP server by default.

**The VCSA GUI installer crashes on Fedora 44.** The Electron app segfaults. Use the CLI deployer instead (`vcsa-cli-installer/lin64/vcsa-deploy`).

**The CLI deployer's ovftool needs legacy libraries.** On Fedora 43/44, install `libnsl` and `libxcrypt-compat` (in a toolbox if you're on an atomic desktop) before running the installer.

**ESXi SSL thumbprint prompt blocks non-interactive deploys.** Add the thumbprint to the deploy JSON to avoid the interactive prompt.
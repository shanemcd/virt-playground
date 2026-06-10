# Lab: Deploy vCenter Server Appliance

Deploy the VCSA onto the nested ESXi host using the CLI installer.

## Prerequisites

- ESXi host running with SSH enabled ([lab 02](02-prepare-esxi-host.md))
- Lab DNS configured with forward and reverse records ([lab 01](01-setup-lab-dns.md))
- VCSA 8.0.3+ ISO downloaded

## 1. Mount the ISO

```bash
sudo mkdir -p /tmp/vcsa
sudo mount -o loop /path/to/VMware-VCSA-all-8.0.3-*.iso /tmp/vcsa
```

## 2. Install required libraries

The VCSA CLI deployer bundles an `ovftool` binary that depends on libraries removed from recent Fedora releases.

If you're on Fedora Atomic (Silverblue/Kinoite), run these inside a toolbox:

```bash
toolbox enter
sudo dnf install -y libnsl libxcrypt-compat
```

Verify ovftool works:

```bash
/tmp/vcsa/vcsa/ovftool/lin64/ovftool --version
```

Should print `VMware ovftool 4.6.x`.

## 3. Get the ESXi SSL thumbprint

```bash
echo | openssl s_client -connect 192.168.122.51:443 2>/dev/null \
  | openssl x509 -fingerprint -sha1 -noout \
  | sed 's/sha1 Fingerprint=//'
```

Save the output for the deploy config.

## 4. Create the deploy config

Create `/tmp/vcsa-deploy.json`:

```json
{
    "__version": "2.13.0",
    "new_vcsa": {
        "esxi": {
            "hostname": "192.168.122.51",
            "username": "root",
            "password": "<esxi-root-password>",
            "deployment_network": "VM Network",
            "datastore": "datastore1",
            "ssl_certificate_verification": {
                "thumbprint": "<esxi-thumbprint-from-step-3>"
            }
        },
        "appliance": {
            "thin_disk_mode": true,
            "deployment_option": "tiny",
            "name": "vcsa"
        },
        "network": {
            "ip_family": "ipv4",
            "mode": "static",
            "ip": "192.168.122.100",
            "prefix": "24",
            "gateway": "192.168.122.1",
            "dns_servers": [
                "192.168.122.1"
            ],
            "system_name": "vcsa.lab.local"
        },
        "os": {
            "password": "<vcsa-root-password>",
            "ntp_servers": "pool.ntp.org",
            "ssh_enable": true
        },
        "sso": {
            "password": "<sso-admin-password>",
            "domain_name": "vsphere.local"
        }
    },
    "ceip": {
        "settings": {
            "ceip_enabled": false
        }
    }
}
```

### Config notes

| Field | Value | Why |
|-------|-------|-----|
| `deployment_option` | `tiny` | 2 vCPU, 14 GB RAM. Sufficient for a lab with up to 10 hosts. |
| `system_name` | `vcsa.lab.local` | FQDN that resolves via the lab DNS we configured in step 01. Do not use an IP address unless you also set `dns_servers` to `["127.0.0.1"]`. |
| `dns_servers` | `["192.168.122.1"]` | The libvirt dnsmasq server. Must serve forward and reverse records for the VCSA. |
| `ntp_servers` | `pool.ntp.org` | Must be reachable from the VCSA. Your workstation is not an NTP server by default. |
| `ssl_certificate_verification` | thumbprint | Avoids an interactive prompt that blocks non-interactive deploys. |
| `ssh_enable` | `true` | Lets you SSH in to troubleshoot if needed. |

### Password requirements

The VCSA OS and SSO passwords must meet VMware's policy:
- 8-20 characters
- At least 1 uppercase, 1 lowercase, 1 number, 1 special character
- No spaces

## 5. Deploy

```bash
/tmp/vcsa/vcsa-cli-installer/lin64/vcsa-deploy install \
  --accept-eula --acknowledge-ceip /tmp/vcsa-deploy.json
```

The deploy takes 30-60 minutes and progresses through two phases:

1. **OVF deployment** (5-10 min): Transfers the VCSA disk images to ESXi via the NFC protocol on port 902.
2. **Firstboot** (20-50 min): Installs RPMs, then runs 51 firstboot scripts that initialize all vCenter services. The slowest steps are the SSO identity service and the Lookup Service registrations.

### What to expect during firstboot

The deploy command prints progress reports. Key milestones:

| % | Step | Notes |
|---|------|-------|
| 3% | Starting VMware Authentication Framework | SSO/identity setup, takes several minutes |
| 31% | Starting VMware License Service | Registers with the Lookup Service |
| 50% | Starting VMware vCenter Server | Core vpxd daemon |
| 66% | Starting VMware Update Manager | Near the end |
| 100% | Complete | All 51 firstboot scripts succeeded |

If the deploy hangs at 31% for more than 15 minutes, DNS is almost certainly the problem. Verify reverse DNS works from the VCSA.

## 6. Verify

Once the deploy completes:

```bash
# vSphere Client responds
curl -sk -o /dev/null -w "%{http_code}" https://vcsa.lab.local/ui

# All services running
ssh root@192.168.122.100 "service-control --status"
```

Open **https://vcsa.lab.local/ui** (or https://192.168.122.100/ui) in a browser. You may need to add `vcsa.lab.local` to your workstation's `/etc/hosts` or configure your system to use 192.168.122.1 for `.lab.local` resolution.

Log in with `administrator@vsphere.local` and the SSO password from the deploy config.

## Cleanup

To unmount the ISO after deployment:

```bash
sudo umount /tmp/vcsa
rmdir /tmp/vcsa
```

## Troubleshooting

**OVF transfer fails at 19%**: Retry. Transient NFC connection issues between the ovftool and ESXi. If it keeps failing, check that ESXi port 902 is reachable.

**Firstboot hangs**: SSH into the VCSA and check progress:

```bash
ssh root@192.168.122.100
# Check which step is running
cat /var/log/firstboot/firstbootStatus.json | python3 -m json.tool
# Check the current step's log
tail -20 /var/log/firstboot/<step-name>_*_stdout.log
```

**GUI installer crashes**: Use the CLI deployer. The Electron-based GUI installer segfaults on Fedora 44 with KDE.

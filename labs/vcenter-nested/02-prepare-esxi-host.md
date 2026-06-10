# Lab: Prepare ESXi Host

The VCSA `tiny` deployment profile requires 2 vCPUs and 14 GB RAM. The ESXi host VM needs at least 20 GB RAM to run the VCSA with headroom for guest VMs.

## Prerequisites

Your ESXi VM should have at least:
- 4 vCPUs
- 20 GB RAM

If you're setting up ESXi from scratch, see [crc-esxi-mtv lab 03](../crc-esxi-mtv/03-nested-esxi-setup.md) and use these specs when creating the VM.

## 1. Enable SSH on ESXi

SSH is not enabled by default. Enable it through one of:

**Option A: ESXi Host Client (browser)**
1. Open `https://192.168.122.51` in a browser
2. Log in as root
3. Go to Host > Manage > Services
4. Find TSM-SSH and click Start

**Option B: ESXi console (virt-manager)**
1. Open the ESXi console in virt-manager
2. Press F2 to enter configuration
3. Navigate to Troubleshooting Options > Enable SSH

## 2. Verify SSH access

```bash
ssh root@192.168.122.51 "uptime"
```

## 3. Verify ESXi can resolve DNS

```bash
ssh root@192.168.122.51 "nslookup vcsa.lab.local 192.168.122.1"
```

## Resource summary

| Component | vCPUs | RAM |
|-----------|-------|-----|
| ESXi VM (total) | 4 | 20 GB |
| VCSA (inside ESXi) | 2 | 14 GB |
| Remaining for guest VMs | 2 | ~4 GB |
| Workstation minimum | - | 32 GB |

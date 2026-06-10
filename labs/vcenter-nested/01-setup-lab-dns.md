# Lab: Set Up Lab DNS

Configure the libvirt default network's built-in dnsmasq to serve DNS for the lab. This gives us forward and reverse DNS resolution for all lab hosts without running a separate DNS server.

## Why this matters

The VCSA firstboot process makes hundreds of SOAP calls to register services with the SSO Lookup Service. Each call involves SASL SRP LDAP binds and token operations that depend on DNS resolution. Without working reverse DNS, these calls hang for minutes or time out entirely. A deploy that should take 30 minutes can take hours or fail completely.

## 1. Add DNS host entries to the libvirt network

```bash
virsh net-update default add dns-host \
  '<host ip="192.168.122.51"><hostname>esxi.lab.local</hostname></host>' \
  --live --config

virsh net-update default add dns-host \
  '<host ip="192.168.122.100"><hostname>vcsa.lab.local</hostname></host>' \
  --live --config
```

This tells dnsmasq to serve both forward (hostname -> IP) and reverse (IP -> hostname) records.

## 2. Add a DHCP reservation for ESXi

```bash
# Get the ESXi VM's MAC address
virsh domiflist esxi

# Add the reservation (replace the MAC with yours)
virsh net-update default add ip-dhcp-host \
  '<host mac="52:54:00:e8:c7:09" name="esxi.lab.local" ip="192.168.122.51"/>' \
  --live --config
```

The VCSA will use a static IP configured in the deploy JSON, so it doesn't need a DHCP reservation.

## 3. Verify

```bash
# Forward lookups
dig @192.168.122.1 esxi.lab.local +short
dig @192.168.122.1 vcsa.lab.local +short

# Reverse lookups
dig @192.168.122.1 -x 192.168.122.51 +short
dig @192.168.122.1 -x 192.168.122.100 +short

# From ESXi
ssh root@<esxi-ip> "nslookup vcsa.lab.local 192.168.122.1"
ssh root@<esxi-ip> "nslookup 192.168.122.100 192.168.122.1"
```

All four lookups should resolve. If reverse DNS doesn't work, the VCSA deploy will hang during firstboot.

## 4. Verify the final network config

```bash
virsh net-dumpxml default
```

Should look like:

```xml
<network>
  <name>default</name>
  ...
  <dns>
    <host ip='192.168.122.51'>
      <hostname>esxi.lab.local</hostname>
    </host>
    <host ip='192.168.122.100'>
      <hostname>vcsa.lab.local</hostname>
    </host>
  </dns>
  <ip address='192.168.122.1' netmask='255.255.255.0'>
    <dhcp>
      <range start='192.168.122.2' end='192.168.122.254'/>
      <host mac='52:54:00:e8:c7:09' name='esxi.lab.local' ip='192.168.122.51'/>
    </dhcp>
  </ip>
</network>
```

## How this works

Libvirt runs its own dnsmasq instance for each virtual network, bound to the bridge interface (virbr0 at 192.168.122.1). The `<dns>` section adds static host entries, and dnsmasq automatically serves PTR records for them. The `--live --config` flags update both the running dnsmasq and the persistent config, so records survive host reboots.

All VMs on this network (ESXi, VCSA, any future lab VMs) can use 192.168.122.1 as their DNS server.

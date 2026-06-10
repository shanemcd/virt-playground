# Lab: Configure vCenter

Log in to vCenter, apply licenses, and add the ESXi host to the inventory.

## 1. Access the vSphere Client

Open **https://vcsa.lab.local/ui** in a browser.

If your workstation doesn't resolve `vcsa.lab.local`, either:
- Add `192.168.122.100 vcsa.lab.local` to `/etc/hosts`
- Use the IP directly: `https://192.168.122.100/ui`

Log in:
- Username: `administrator@vsphere.local`
- Password: the SSO password from the deploy config

## 2. Create a Datacenter

In the vSphere Client:

1. Right-click on the vCenter Server node in the left panel
2. New Datacenter
3. Name it (e.g., `lab-dc`)

## 3. Add the ESXi host

1. Right-click the new Datacenter
2. Add Host
3. Enter `esxi.lab.local` (or `192.168.122.51`)
4. Enter ESXi root credentials
5. Accept the SSL certificate
6. Finish the wizard

The ESXi host and all its VMs should appear in the inventory.

## 4. Apply licenses

Navigate to Administration > Licenses > Licenses:

1. Click Add New Licenses
2. Enter your vCenter Server Standard license key
3. Enter your vSphere ESXi Enterprise Plus license key
4. Assign the vCenter license to the vCenter Server
5. Assign the ESXi license to the ESXi host under Assets > Hosts

## 5. Verify

Check that the ESXi host shows as Connected with a green status icon. You should be able to see:

- Host hardware summary (CPU, memory, storage)
- Any VMs running on the host
- Datastore contents
- Network configuration

## What you have now

```
vCenter Server (vcsa.lab.local)
└── Datacenter: lab-dc
    └── Host: esxi.lab.local
        ├── Datastore: datastore1
        └── Network: VM Network
```

This is a working vCenter-managed vSphere environment. You can use it as an MTV migration source by creating a vSphere Provider in MTV that connects to `vcsa.lab.local` instead of the ESXi host directly. This is how most production migrations work.

## Management interfaces

| Interface | URL | Credentials |
|-----------|-----|-------------|
| vSphere Client | https://vcsa.lab.local/ui | administrator@vsphere.local |
| VAMI (appliance management) | https://vcsa.lab.local:5480 | root |
| ESXi Host Client | https://esxi.lab.local/ui | root |

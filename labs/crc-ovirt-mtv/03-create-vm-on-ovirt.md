# Lab 03: Create a VM on oVirt

Upload a Fedora Cloud image and create a VM using the oVirt REST API.

## Prerequisites

- oVirt configured with a host and active storage domain ([lab 02](02-configure-ovirt.md))
- Fedora Cloud Base qcow2 image

## 1. Download the Fedora Cloud image

```bash
curl -L -o /tmp/fedora-cloud.qcow2 \
  "https://download.fedoraproject.org/pub/fedora/linux/releases/44/Cloud/x86_64/images/Fedora-Cloud-Base-Generic-44-1.7.x86_64.qcow2"
```

Copy it to the oVirt host:

```bash
scp /tmp/fedora-cloud.qcow2 root@<ovirt-ip>:/tmp/
```

## 2. Upload the disk image

oVirt uses image transfers to upload disk images. The upload goes through the imageio service. Run this from the oVirt engine host, using the local transfer URL (port 54322).

```bash
ssh root@<ovirt-ip> 'python3 << "PY"
import requests, time, urllib3
urllib3.disable_warnings()

BASE = "https://ovirt.localdomain/ovirt-engine/api"

def get_token():
    r = requests.post(BASE.replace("/api","") + "/sso/oauth/token",
        params={"grant_type":"password","username":"admin@ovirt@internalsso",
                "password":"<password>","scope":"ovirt-app-api"},
        headers={"Accept":"application/json"}, verify=False)
    return r.json()["access_token"]

def h(t):
    return {"Authorization":"Bearer "+t, "Accept":"application/json",
            "Content-Type":"application/json"}

token = get_token()

# Get storage domain ID
r = requests.get(BASE+"/storagedomains", headers=h(token), verify=False)
sd_id = [s["id"] for s in r.json()["storage_domain"]
         if s["name"]=="local-data"][0]

# Create disk
r = requests.post(BASE+"/disks", headers=h(token), verify=False, json={
    "provisioned_size": "5368709120",
    "format": "cow",
    "name": "fedora-test-disk",
    "storage_domains": {"storage_domain": [{"name": "local-data"}]}
})
disk_id = r.json()["id"]
print("Disk:", disk_id)

# Wait for disk to be ready
for i in range(30):
    time.sleep(2)
    r = requests.get(BASE+"/disks/"+disk_id, headers=h(token), verify=False)
    if r.json().get("status") == "ok":
        break

# Create image transfer
token = get_token()
r = requests.post(BASE+"/imagetransfers", headers=h(token), verify=False,
    json={"disk":{"id":disk_id},"direction":"upload","format":"cow"})
transfer_url = r.json()["transfer_url"]
tf_id = r.json()["id"]

# Upload the qcow2
with open("/tmp/fedora-cloud.qcow2", "rb") as f:
    r = requests.put(transfer_url, data=f,
        headers={"Content-Type": "application/octet-stream"}, verify=False)
print("Upload:", r.status_code)

# Finalize
token = get_token()
requests.post(BASE+"/imagetransfers/"+tf_id+"/finalize",
    headers=h(token), verify=False, json={})
print("Done")
PY'
```

### Image transfer gotchas

- Use the **`transfer_url`** (port 54322), not the `proxy_url` (port 54323). The proxy may not be running.
- If a transfer fails, the disk gets **locked**. Cancel via `/imagetransfers/<id>/cancel`. If that doesn't clear it, delete the transfer record from PostgreSQL: `DELETE FROM image_transfers WHERE disk_id='...'`.
- The oVirt web UI upload (**Storage > Disks > Upload > Start**) uses the proxy URL and may fail silently if port 54323 isn't listening.

## 3. Create the VM

```bash
TOKEN=$(curl -sk -H "Accept: application/json" \
  "https://ovirt.localdomain/ovirt-engine/sso/oauth/token?grant_type=password&username=admin@ovirt@internalsso&password=<password>&scope=ovirt-app-api" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Create VM
VM_ID=$(curl -sk -X POST -H "Accept: application/json" -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  "https://ovirt.localdomain/ovirt-engine/api/vms" \
  -d '{"name":"fedora-test","cluster":{"name":"Default"},"template":{"name":"Blank"},"memory":"2147483648","os":{"type":"other_linux","boot":{"devices":{"device":["hd"]}}}}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

# Attach disk (must set active: true)
curl -sk -X POST -H "Accept: application/json" -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  "https://ovirt.localdomain/ovirt-engine/api/vms/$VM_ID/diskattachments" \
  -d "{\"bootable\":true,\"active\":true,\"interface\":\"virtio_scsi\",\"disk\":{\"id\":\"<disk-id>\"}}"

# Add NIC (use XML to ensure vNIC profile is set correctly)
PROFILE_ID=$(curl -sk -H "Accept: application/json" -H "Authorization: Bearer $TOKEN" \
  "https://ovirt.localdomain/ovirt-engine/api/vnicprofiles" \
  | python3 -c "import sys,json; [print(p['id']) for p in json.load(sys.stdin).get('vnic_profile',[]) if p['name']=='ovirtmgmt']")

curl -sk -X POST -H "Accept: application/json" -H "Content-Type: application/xml" \
  -H "Authorization: Bearer $TOKEN" \
  "https://ovirt.localdomain/ovirt-engine/api/vms/$VM_ID/nics" \
  -d "<nic><name>nic1</name><vnic_profile id=\"$PROFILE_ID\"/></nic>"
```

## 4. Start the VM with cloud-init

oVirt supports cloud-init natively. Pass credentials in the start request:

```bash
curl -sk -X POST -H "Accept: application/json" -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  "https://ovirt.localdomain/ovirt-engine/api/vms/$VM_ID/start" \
  -d '{"use_cloud_init":true,"vm":{"initialization":{"user_name":"fedora","root_password":"fedora","host_name":"fedora-test"}}}'
```

### API gotchas

- **Disk attachments must be `active: true`** to be bootable. Defaults to inactive when attaching an existing disk.
- **vNIC profiles**: Use XML content type with an explicit profile ID (`<vnic_profile id="..."/>`) rather than JSON with a profile name. JSON may create the NIC with an empty profile, which breaks MTV network mapping later.
- **cloud-init** is passed in the VM start action, not the VM definition.

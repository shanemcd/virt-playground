# Lab 02: Configure oVirt

Add the engine machine as a managed host, set up local storage, and learn how to authenticate with the oVirt REST API.

## Prerequisites

- oVirt engine installed and running ([lab 01](01-install-ovirt-engine.md))

## Authenticating with the oVirt REST API

oVirt 4.5+ uses Keycloak for SSO. To use the REST API:

- **Token endpoint**: Use oVirt's SSO proxy at `/ovirt-engine/sso/oauth/token`, not the Keycloak endpoint directly
- **Username format**: `admin@ovirt@internalsso` (the `@internalsso` suffix is required)
- **Accept header is required** on the token request

```bash
TOKEN=$(curl -sk -H "Accept: application/json" \
  "https://ovirt.localdomain/ovirt-engine/sso/oauth/token?grant_type=password&username=admin@ovirt@internalsso&password=<password>&scope=ovirt-app-api" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Test it
curl -sk -H "Accept: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  "https://ovirt.localdomain/ovirt-engine/api"
```

### Authentication gotchas

- The **Python SDK** (`python3-ovirt-engine-sdk4`) shipped with oVirt 4.5.7 doesn't handle Keycloak auth correctly. Use curl with the SSO proxy endpoint instead.
- **Don't use the Keycloak token endpoint directly** (`/ovirt-engine-auth/realms/ovirt-internal/protocol/openid-connect/token`). The tokens it returns aren't accepted by the engine API. The engine's SSO proxy handles the translation.
- The `admin-cli` Keycloak client doesn't have the right scopes for the oVirt API.

## 1. Add the host

```bash
curl -sk -X POST \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  "https://ovirt.localdomain/ovirt-engine/api/hosts" \
  -d '{"name":"localhost","address":"ovirt.localdomain","root_password":"<root-password>","cluster":{"name":"Default"}}'
```

The host goes through `installing` > `up`. Takes a few minutes. Check status:

```bash
curl -sk -H "Accept: application/json" -H "Authorization: Bearer $TOKEN" \
  "https://ovirt.localdomain/ovirt-engine/api/hosts" \
  | python3 -c "import sys,json; [print(h['name'], h['status']) for h in json.load(sys.stdin).get('host',[])]"
```

## 2. Configure local storage

Change the datacenter to local storage type:

```bash
DC_ID=$(curl -sk -H "Accept: application/json" -H "Authorization: Bearer $TOKEN" \
  "https://ovirt.localdomain/ovirt-engine/api/datacenters" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data_center'][0]['id'])")

curl -sk -X PUT -H "Accept: application/json" -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  "https://ovirt.localdomain/ovirt-engine/api/datacenters/$DC_ID" \
  -d '{"local":true}'
```

Create the storage directories (on the oVirt host):

```bash
ssh root@<ovirt-ip> "mkdir -p /data/images /data/iso && chown vdsm:kvm /data/images /data/iso"
```

Create and attach a storage domain:

```bash
# Create storage domain
curl -sk -X POST -H "Accept: application/json" -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  "https://ovirt.localdomain/ovirt-engine/api/storagedomains" \
  -d '{"name":"local-data","type":"data","host":{"name":"localhost"},"storage":{"type":"localfs","path":"/data/images"}}'

# Get the storage domain ID
SD_ID=$(curl -sk -H "Accept: application/json" -H "Authorization: Bearer $TOKEN" \
  "https://ovirt.localdomain/ovirt-engine/api/storagedomains" \
  | python3 -c "import sys,json; [print(s['id']) for s in json.load(sys.stdin).get('storage_domain',[]) if s['name']=='local-data']")

# Attach to datacenter
curl -sk -X POST -H "Accept: application/json" -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  "https://ovirt.localdomain/ovirt-engine/api/datacenters/$DC_ID/storagedomains" \
  -d "{\"id\":\"$SD_ID\"}"
```

Verify it's active:

```bash
curl -sk -H "Accept: application/json" -H "Authorization: Bearer $TOKEN" \
  "https://ovirt.localdomain/ovirt-engine/api/datacenters/$DC_ID/storagedomains" \
  | python3 -c "import sys,json; [print(s.get('name','?'), s.get('status','?')) for s in json.load(sys.stdin).get('storage_domain',[])]"
```

# Lab 03: Console and Tailscale

Deploy the OpenShift console in off-cluster mode (MicroShift has no Console Operator), then expose it and the API over Tailscale.

## Console on MicroShift

There is no `consoles.operator.openshift.io`. Run the bridge as a normal Deployment with auth disabled and a ServiceAccount token.

### 1. Namespace, SA, token

```bash
oc create namespace openshift-console
oc create sa openshift-console -n openshift-console
oc adm policy add-cluster-role-to-user cluster-admin -z openshift-console -n openshift-console
# long-lived token secret for BRIDGE_K8S_AUTH_BEARER_TOKEN (pattern varies by k8s version)
```

### 2. Deploy console

Image options that worked:

- Start with `quay.io/openshift/origin-console:4.22.0`
- Switch to `registry.redhat.io/openshift4/ose-console-rhel9:v4.22` when a pull secret (`rh-pull-secret`) is available — closer to product UI chrome

Critical env:

```yaml
BRIDGE_USER_AUTH: "disabled"
BRIDGE_K8S_MODE: "off-cluster"
BRIDGE_K8S_MODE_OFF_CLUSTER_ENDPOINT: "https://kubernetes.default.svc"
BRIDGE_K8S_MODE_OFF_CLUSTER_SKIP_VERIFY_TLS: "true"
BRIDGE_K8S_AUTH: "bearer-token"
BRIDGE_K8S_AUTH_BEARER_TOKEN: "<from SA secret>"
BRIDGE_USER_SETTINGS_LOCATION: "localstorage"
BRIDGE_BRANDING: "okd"
```

`BRIDGE_BRANDING=okd` matters later: the kubevirt-plugin defaults the HCO namespace to `kubevirt-hyperconverged` for OKD branding (vs `openshift-cnv` for OpenShift).

Expose via Route/Ingress or LoadBalancer so the local hostname resolves:

```
http://console-openshift-console.apps.crc.testing
```

Plugin wiring is added in lab 04 (`BRIDGE_PLUGINS`, `BRIDGE_I18N_NAMESPACES`). Monitoring wiring is added in lab 05 (`BRIDGE_K8S_MODE_OFF_CLUSTER_THANOS`, `BRIDGE_K8S_MODE_OFF_CLUSTER_ALERTMANAGER`).

### 3. Expect OpenShift-only 404s

Without stubs (lab 05), the console and plugin call APIs MicroShift does not have:

- `user.openshift.io`
- `project.openshift.io` (until stubbed)
- `config.openshift.io/infrastructures`
- Prometheus / Alertmanager (`/api/v1/query`, etc.)

Workloads and KubeVirt CR browsing still work through the k8s proxy.

## Tailscale operator

Prefer the **in-cluster** operator over host `tailscale serve` so CRC can keep host `:443`.

### 1. ACL tags

In the Tailscale admin ACL policy, ensure:

```json
"tagOwners": {
  "tag:k8s-operator": [],
  "tag:k8s": ["tag:k8s-operator"]
}
```

### 2. OAuth client

Create an OAuth client with write scopes for devices/keys tagged `tag:k8s-operator`. Store credentials locally (example with libsecret):

```bash
secret-tool store --label='Tailscale OAuth Client ID' \
  service tailscale attribute oauth-client-id

secret-tool store --label='Tailscale OAuth Client Secret' \
  service tailscale attribute oauth-client-secret
```

### 3. Helm install

```bash
helm repo add tailscale https://pkgs.tailscale.com/helmcharts
helm repo update

export TS_CLIENT_ID="$(secret-tool lookup service tailscale attribute oauth-client-id)"
export TS_CLIENT_SECRET="$(secret-tool lookup service tailscale attribute oauth-client-secret)"

helm upgrade --install tailscale-operator tailscale/tailscale-operator \
  --namespace=tailscale --create-namespace \
  --set-string oauth.clientId="$TS_CLIENT_ID" \
  --set-string oauth.clientSecret="$TS_CLIENT_SECRET" \
  --set operatorConfig.hostname=microshift-operator \
  --wait
```

OpenShift/MicroShift extras that were required in practice:

- Grant the operator / proxies appropriate SCCs (`privileged` for proxy pods as needed)
- Fix HOME / filesystem constraints if the operator pod crashes on OpenShift-style SCC defaults

Enable API server proxy per current Tailscale docs, then bind your Tailscale identity (for example `you@github`) to `cluster-admin` via a ClusterRoleBinding.

### 4. Expose the console

Create a LoadBalancer Service annotated for Tailscale (hostname recorded here: `microshift-console`):

```
http://microshift-console.<tailnet>.ts.net
```

MagicDNS + HTTPS is Tailscale-side; the Service can still target the console's HTTP port inside the cluster.

## Next

[04 - KubeVirt console plugin](04-kubevirt-console-plugin.md)

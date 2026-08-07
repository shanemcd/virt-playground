# Lab 05: Stubs and monitoring

Fill the OpenShift API and monitoring gaps that still break overview cards after the plugin loads.

## Project API stub

All-namespaces VirtualMachine list used **Model does not exist** because the console/plugin expect `project.openshift.io/v1` Projects. MicroShift has none.

Install a minimal Project CRD and mirror Namespaces:

```bash
oc apply -f - <<'EOF'
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: projects.project.openshift.io
spec:
  group: project.openshift.io
  scope: Cluster
  names:
    plural: projects
    singular: project
    kind: Project
    shortNames: [proj]
  versions:
    - name: v1
      served: true
      storage: true
      schema:
        openAPIV3Schema:
          type: object
          properties:
            spec:
              type: object
              x-kubernetes-preserve-unknown-fields: true
            status:
              type: object
              x-kubernetes-preserve-unknown-fields: true
---
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: projectrequests.project.openshift.io
spec:
  group: project.openshift.io
  scope: Cluster
  names:
    plural: projectrequests
    singular: projectrequest
    kind: ProjectRequest
  versions:
    - name: v1
      served: true
      storage: true
      schema:
        openAPIV3Schema:
          type: object
          x-kubernetes-preserve-unknown-fields: true
EOF

for ns in $(oc get ns -o jsonpath='{.items[*].metadata.name}'); do
  oc apply -f - <<EOF
apiVersion: project.openshift.io/v1
kind: Project
metadata:
  name: ${ns}
status:
  phase: Active
EOF
done
```

Restart the console Deployment so API discovery picks up the new group.

**Note:** Overview "Projects" tile counts namespaces that have VMs, not total Projects. With zero VMs it correctly shows `0`.

## Infrastructure stub

Quiets `config.openshift.io/v1/infrastructures/cluster` 404s:

```bash
oc apply -f - <<'EOF'
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: infrastructures.config.openshift.io
spec:
  group: config.openshift.io
  scope: Cluster
  names:
    plural: infrastructures
    singular: infrastructure
    kind: Infrastructure
  versions:
    - name: v1
      served: true
      storage: true
      schema:
        openAPIV3Schema:
          type: object
          x-kubernetes-preserve-unknown-fields: true
EOF

# wait until CRD Established, then:
oc apply -f - <<'EOF'
apiVersion: config.openshift.io/v1
kind: Infrastructure
metadata:
  name: cluster
spec:
  platformSpec:
    type: None
status:
  infrastructureName: crc-microshift
  platform: None
  platformStatus:
    type: None
  apiServerURL: https://api.crc.testing:6443
EOF
```

## Metrics stub (fixes overview danger alerts)

### Symptoms

On `/k8s/all-namespaces/kubevirt.io~v1~VirtualMachine` Overview:

- OpenShift Virtualization card: **An error occurred / Not Found**
- Virtual machine alerts: **Failed to load alerts**

### Cause

The plugin polls:

- `kubevirt_hyperconverged_operator_health_status` via Prometheus (`useCNVHealth`)
- Alert rules / silences via Alertmanager

MicroShift has no cluster monitoring. Console `/api/v1/query` and `/api/v1/rules` 404 until Thanos/Alertmanager backends are configured.

### Stub Deployment

Namespace: `openshift-monitoring`  
Deployment: `metrics-stub` — small Python HTTP server that answers PromQL / Alertmanager v2 with success payloads.

For HCO health, return vector value `"0"` (`HCOHealthStatus.none` → Available). Other queries can return a zero sample or empty results. Rules/silences can be empty lists.

Services (names match OpenShift conventions the console defaults expect):

| Service | Port | Role |
|---------|------|------|
| `thanos-querier` | 9090 | Prometheus/Thanos API |
| `alertmanager-main` | 9093 (and 9092 tenancy) | Alertmanager API |

### Point console (off-cluster mode)

```bash
oc set env deploy/console -n openshift-console \
  BRIDGE_K8S_MODE_OFF_CLUSTER_THANOS=http://thanos-querier.openshift-monitoring.svc:9090 \
  BRIDGE_K8S_MODE_OFF_CLUSTER_ALERTMANAGER=http://alertmanager-main.openshift-monitoring.svc:9093
```

After rollout, overview should show:

- Status **Available**, Alerts **0**
- Cluster utilization at 0% (stub data, not real node scrapes)
- No **Failed to load alerts**

Working proxy paths after wiring: `/api/prometheus/api/v1/query`, `/api/alertmanager-tenancy/...`. The stub does not scrape real kubevirt metrics — it only stops the UI from erroring.

## Still missing / noisy

These remain OpenShift-only and are safe to ignore for a lab:

| Call | Notes |
|------|--------|
| `user.openshift.io/v1/users/~` | No OpenShift user API |
| `image.openshift.io` ImageStreams | No image registry API |
| `metal3.io` Provisioning | Bare metal only |
| `/api/proxy/plugin/.../kubevirt-apiserver-proxy` | Needs ConsolePlugin proxy support |
| Lightspeed packagemanifest check | Console probes a package that is not in OperatorHub.io |

## Full console env checklist

After labs 03–05, console env should include:

```text
BRIDGE_USER_AUTH=disabled
BRIDGE_K8S_MODE=off-cluster
BRIDGE_K8S_MODE_OFF_CLUSTER_ENDPOINT=https://kubernetes.default.svc
BRIDGE_K8S_MODE_OFF_CLUSTER_SKIP_VERIFY_TLS=true
BRIDGE_K8S_AUTH=bearer-token
BRIDGE_USER_SETTINGS_LOCATION=localstorage
BRIDGE_BRANDING=okd
BRIDGE_PLUGINS=kubevirt-plugin=https://kubevirt-plugin.kubevirt-plugin.svc:9443/
BRIDGE_I18N_NAMESPACES=plugin__kubevirt-plugin
BRIDGE_K8S_MODE_OFF_CLUSTER_THANOS=http://thanos-querier.openshift-monitoring.svc:9090
BRIDGE_K8S_MODE_OFF_CLUSTER_ALERTMANAGER=http://alertmanager-main.openshift-monitoring.svc:9093
```

## When to stop hacking

This stack is a learning/lab path. For a supported Virtualization console on CRC, switch to the **`openshift`** preset and install OpenShift Virtualization normally (see [labs/crc-esxi-mtv/01-install-openshift-virtualization.md](../crc-esxi-mtv/01-install-openshift-virtualization.md)).

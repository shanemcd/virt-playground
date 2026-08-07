# Lab 04: KubeVirt console plugin

Deploy `kubevirt-ui/kubevirt-plugin` and patch its webpack bundles so the Virtualization perspective and admin nav appear on MicroShift.

## Why patches are required

On full OpenShift, HCO registers a `ConsolePlugin` CR and the console operator loads it. MicroShift has **no `ConsolePlugin` CRD**. Load the plugin via console env instead:

```bash
BRIDGE_PLUGINS=kubevirt-plugin=https://kubevirt-plugin.kubevirt-plugin.svc:9443/
BRIDGE_I18N_NAMESPACES=plugin__kubevirt-plugin
```

Even after the bundle loads, two MicroShift gaps break nav registration:

1. **Module federation semver** — console SDK reports `0.0.0-fixed`, which does **not** satisfy `>=0.0.0` (prerelease rules). Shared deps fail with "Unsatisfied version".
2. **`KUBEVIRT_VIRTUALIZATION_NAV` flag** — `useVirtualizationNavVisibilityFlag` watches OpenShift `Project` and does access reviews. On MicroShift the Project API is missing (until stubbed), so the flag never becomes true and the perspective stays hidden.

## Steps

### 1. Deploy the plugin

Image used: `quay.io/kubevirt-ui/kubevirt-plugin:v4.22.0` in namespace `kubevirt-plugin`.

Typical pieces:

- Deployment (nginx serving `/usr/share/nginx/html` on 9443/TLS)
- Service + service-ca serving cert annotation
- ConfigMap for nginx.conf
- No `ConsolePlugin` CR (CRD absent)

### 2. Point the console at the plugin

```bash
oc set env deploy/console -n openshift-console \
  BRIDGE_PLUGINS=kubevirt-plugin=https://kubevirt-plugin.kubevirt-plugin.svc:9443/ \
  BRIDGE_I18N_NAMESPACES=plugin__kubevirt-plugin \
  BRIDGE_BRANDING=okd
```

Keep `BRIDGE_BRANDING=okd` so the plugin looks for HCO in `kubevirt-hyperconverged`.

### 3. Patch plugin-entry (federation versions)

Copy the served `plugin-entry.*.min.js`, relax shared singleton version arrays for the console SDK / react-router compat modules to the encoded form that accepts `0.0.0-fixed`:

```text
[0,0,0,0,,"0"]   # means >=0.0.0-0
```

Mount over the original file with a ConfigMap:

```bash
# ConfigMap name used in this lab:
#   kubevirt-plugin-entry-patch
# Key: plugin-entry.<hash>.min.js
```

Mount as a `subPath` onto the matching filename under `/usr/share/nginx/html/`. **Restart the plugin pod** after ConfigMap changes — subPath mounts do not update in place.

### 4. Patch kubevirtFlags chunk (nav flag)

ConfigMap: `kubevirt-flags-patch`  
File: `exposed-kubevirtFlags-chunk-24936d7776e640722f8e.min.js` (hash is image-specific)

Two edits:

**A. Operator namespace signal** — initialize to the HCO namespace instead of `null`:

```js
// before
const a=(0,e(24472).vP)(null);
// after
const a=(0,e(24472).vP)("kubevirt-hyperconverged");
```

**B. Force Virtualization nav flag** — replace the Project/access-review `useEffect` with an unconditional enable:

```js
// before (simplified)
(0,c.useEffect)(()=>{e?t(r.Km,!0):o&&t(r.Km,!l||!!A)},[t,A,l,o,e,w])
// after
(0,c.useEffect)(()=>{t(r.Km,!0);t(r.kb,!0)},[t])
```

`r.Km` is `KUBEVIRT_VIRTUALIZATION_NAV`; `r.kb` is `KUBEVIRT_DYNAMIC`.

Restart the plugin Deployment after applying.

### 5. Verify

Hard-refresh the console. Perspective switcher should list **Virtualization**. Core platform sidebar should show a **Virtualization** section (VirtualMachines, Templates, Bootable volumes, …).

Direct VM list URL:

```
/k8s/all-namespaces/kubevirt.io~v1~VirtualMachine
```

Without Project stubs (lab 05), all-namespaces list pages may show **Model does not exist**; namespaced URLs like `/k8s/ns/default/kubevirt.io~v1~VirtualMachine` still work.

Browser console should log `Dynamic plugins: [kubevirt-plugin]`.

## ConfigMaps to keep

| ConfigMap | Purpose |
|-----------|---------|
| `kubevirt-plugin-entry-patch` | Federation shared-version relax |
| `kubevirt-flags-patch` | HCO namespace default + force nav flags |

Re-extract and re-patch if you change the plugin image tag (chunk hashes change).

## Next

[05 - Stubs and monitoring](05-stubs-and-monitoring.md)

# 02 - Deploy KubeVirt to CRC

Deploy upstream KubeVirt from your custom-built images to a CRC cluster with the Plugins feature gate enabled.

## Prerequisites

- CRC running: `crc status` should show OpenShift as Running
- Images from step 01 pushed and public on quay.io
- `oc` logged in as kubeadmin: `oc login -u kubeadmin -p $(crc console --credentials | grep kubeadmin | awk -F"'" '{print $2}') https://api.crc.testing:6443`

## Check for existing virtualization

If CNV (OpenShift Virtualization) is already installed, you'll need to remove it first. Check:

```bash
oc get csv -A | grep -i virt
oc get ns | grep -i virt
```

If clean, proceed. If CNV is installed, uninstall it through the OperatorHub UI or delete the HyperConverged CR and CSV.

## Deploy into the `openshift-cnv` namespace

**Important:** Deploy into `openshift-cnv`, not `kubevirt`. The KubeVirt console plugin (kubevirt-ui/kubevirt-plugin) hardcodes namespace detection based on OpenShift branding. On OCP (not OKD), it looks for the KubeVirt CR at `openshift-cnv/kubevirt-kubevirt-hyperconverged`. If you deploy to `kubevirt` instead, the Virtualization UI will never appear in the console sidebar.

Patch the generated operator manifest to use `openshift-cnv`:

```bash
sed 's/namespace: kubevirt/namespace: openshift-cnv/g; s/^  name: kubevirt$/  name: openshift-cnv/' \
  ~/github/kubevirt/kubevirt/_out/manifests/release/kubevirt-operator.yaml \
  > /tmp/kubevirt-operator-cnv.yaml

oc create namespace openshift-cnv
oc apply -f /tmp/kubevirt-operator-cnv.yaml
```

Wait for it:

```bash
oc wait --for=condition=Available deployment/virt-operator -n openshift-cnv --timeout=120s
```

## Deploy the KubeVirt CR with Plugins enabled

The CR name must be `kubevirt-kubevirt-hyperconverged` for the console plugin to find it:

```bash
cat << 'EOF' | oc apply -f -
apiVersion: kubevirt.io/v1
kind: KubeVirt
metadata:
  name: kubevirt-kubevirt-hyperconverged
  namespace: openshift-cnv
spec:
  certificateRotateStrategy: {}
  configuration:
    developerConfiguration:
      featureGates:
        - Plugins
    imagePullPolicy: Always
  customizeComponents: {}
  imagePullPolicy: Always
  workloadUpdateStrategy: {}
EOF
```

## Wait for deployment

```bash
oc wait --for=jsonpath='{.status.phase}'=Deployed \
  kubevirt/kubevirt-kubevirt-hyperconverged -n openshift-cnv --timeout=300s
```

Watch the pods come up:

```bash
oc get pods -n openshift-cnv -w
```

You should see: virt-operator (2), virt-api (2), virt-controller (2), virt-handler (1, DaemonSet), virt-exportproxy (2), virt-template-apiserver (1), virt-template-controller (1).

## Verify the Plugin CRD

```bash
oc get crd plugins.plugin.kubevirt.io
```

If this returns the CRD, the Plugins feature gate is active and you're ready to deploy plugins.

## Install the console UI plugin

The KubeVirt console plugin adds the Virtualization section to the OpenShift console sidebar.

**The image tag must match your OpenShift version.** The `latest` tag tracks upstream and will fail with `__load_plugin_entry__ is not defined` if the console SDK version doesn't match. Check your OpenShift version with `oc version` and use the corresponding tag (e.g., `v4.21.0` for OpenShift 4.21).

```bash
OCP_VERSION=$(oc version -o json | python3 -c "import sys,json; print(json.load(sys.stdin)['openshiftVersion'][:4])")
PLUGIN_TAG="v${OCP_VERSION}.0"
echo "Using plugin tag: ${PLUGIN_TAG}"

oc create namespace kubevirt-plugin

cat << EOF | oc apply -f -
apiVersion: v1
kind: ConfigMap
metadata:
  name: nginx-conf
  namespace: kubevirt-plugin
data:
  nginx.conf: |
    error_log /dev/stdout info;
    events {}
    http {
      access_log /dev/stdout;
      include /etc/nginx/mime.types;
      server {
        listen 9443 ssl;
        ssl_certificate /var/serving-cert/tls.crt;
        ssl_certificate_key /var/serving-cert/tls.key;
        root /usr/share/nginx/html;
        location /health {
          return 200 'OK';
          add_header Content-Type text/plain;
        }
      }
    }
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kubevirt-plugin
  namespace: kubevirt-plugin
  labels:
    app: kubevirt-plugin
spec:
  replicas: 1
  selector:
    matchLabels:
      app: kubevirt-plugin
  template:
    metadata:
      labels:
        app: kubevirt-plugin
    spec:
      containers:
        - name: kubevirt-plugin
          image: quay.io/kubevirt-ui/kubevirt-plugin:${PLUGIN_TAG}
          ports:
            - containerPort: 9443
              protocol: TCP
          volumeMounts:
            - name: plugin-serving-cert
              readOnly: true
              mountPath: /var/serving-cert
            - name: nginx-conf
              readOnly: true
              mountPath: /etc/nginx/nginx.conf
              subPath: nginx.conf
      volumes:
        - name: plugin-serving-cert
          secret:
            secretName: plugin-serving-cert
            defaultMode: 420
        - name: nginx-conf
          configMap:
            name: nginx-conf
            defaultMode: 420
---
apiVersion: v1
kind: Service
metadata:
  name: kubevirt-plugin
  namespace: kubevirt-plugin
  annotations:
    service.alpha.openshift.io/serving-cert-secret-name: plugin-serving-cert
  labels:
    app: kubevirt-plugin
spec:
  ports:
    - name: 9443-tcp
      protocol: TCP
      port: 9443
      targetPort: 9443
  selector:
    app: kubevirt-plugin
  type: ClusterIP
---
apiVersion: console.openshift.io/v1
kind: ConsolePlugin
metadata:
  name: kubevirt-plugin
spec:
  displayName: KubeVirt Plugin
  backend:
    type: Service
    service:
      name: kubevirt-plugin
      namespace: kubevirt-plugin
      port: 9443
      basePath: /
EOF

# Enable the plugin on the console
oc patch consoles.operator.openshift.io cluster \
  --patch '{ "spec": { "plugins": ["kubevirt-plugin"] } }' --type=merge
```

The console pod will restart automatically. After ~30 seconds, hard refresh the browser (Ctrl+Shift+R) and the Virtualization section should appear in the sidebar.

## Troubleshooting

**No Virtualization in sidebar**: Check the ConsolePlugin status at `https://console-openshift-console.apps-crc.testing/k8s/cluster/console.openshift.io~v1~ConsolePlugin/kubevirt-plugin/`. If it says "Failed to load scripts", you have a version mismatch. Use `oc set image deployment/kubevirt-plugin -n kubevirt-plugin kubevirt-plugin=quay.io/kubevirt-ui/kubevirt-plugin:vX.Y.0` with the correct version.

**Console plugin namespace detection**: The plugin code (`src/utils/store/operatorNamespace.ts`) looks for namespaces `openshift-virtualization-os-images` or `kubevirt-os-images` to detect the operator namespace. If neither exists, it falls back to `openshift-cnv` (on OCP) or `kubevirt-hyperconverged` (on OKD). It then watches for a KubeVirt CR named `kubevirt-kubevirt-hyperconverged` in that namespace. This is why the namespace and CR name must match exactly.

**ErrImagePull on template components**: The virt-template-apiserver and virt-template-controller images aren't built by KubeVirt. See the gotchas in [step 01](01-build-upstream-kubevirt.md).

**Transient CDN errors**: quay.io occasionally returns EOF during image pulls. Delete the pod to force a retry:
```bash
oc delete pod <pod-name> -n openshift-cnv
```

**Operator reconciles scaled-down deployments**: You can't just `oc scale --replicas=0` a component. The virt-operator watches all managed resources and will recreate them. Fix the root cause (usually a missing image) instead.

## What's running

After deployment, the Plugin framework is wired into virt-handler. When a Plugin CR is created, virt-handler:
1. Watches for Plugin objects in the cluster
2. On VM lifecycle events, checks if any plugin's NodeHook matches (hook point + CEL condition)
3. Dials the plugin's Unix socket and calls `ExecuteNodeHook` via gRPC
4. Passes the full VMI JSON and node name to the plugin

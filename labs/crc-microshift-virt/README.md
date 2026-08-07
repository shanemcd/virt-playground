# Lab: CRC MicroShift + KubeVirt Console

Stand up OpenShift Virtualization (community HCO) on CRC's **MicroShift** preset, then force enough of the OpenShift console + kubevirt-plugin stack to get a usable Virtualization UI — including remote access over Tailscale.

MicroShift deliberately omits Console, OAuth, OperatorHub, and cluster monitoring. This lab records the workarounds that make the Virtualization perspective work anyway. Prefer the `openshift` CRC preset for a supported CNV console experience.

## What you'll need

- Linux workstation with nested virtualization and roughly **16 CPU / 40 GB RAM / 200 GB disk** free for the CRC VM
- [CRC](https://crc.dev/) installed
- OpenShift pull secret (for CRC start and Red Hat console image pulls)
- Tailscale account + OAuth client (for the Kubernetes operator)
- `helm`, `oc` (via `crc oc-env`), and optionally `secret-tool` for OAuth credentials

## Labs

| # | Lab | What it does |
|---|-----|-------------|
| 01 | [Start CRC MicroShift](01-start-crc-microshift.md) | Size the VM, free host `:443`, start MicroShift |
| 02 | [OLM and KubeVirt](02-olm-and-kubevirt.md) | Upstream OLM, OperatorHub.io catalog, cert-manager, Multus, community HCO |
| 03 | [Console and Tailscale](03-console-and-tailscale.md) | Off-cluster console Deployment, Tailscale operator, MagicDNS hostname |
| 04 | [KubeVirt console plugin](04-kubevirt-console-plugin.md) | Deploy plugin, federation patches, force Virtualization nav/perspective |
| 05 | [Stubs and monitoring](05-stubs-and-monitoring.md) | Project/Infrastructure CR stubs, Prometheus/Alertmanager stub for overview cards |

## Architecture

```
Linux workstation
├── CRC VM (MicroShift 4.22, 16 CPU / 40 GB / 200 GB)
│   ├── OLM (upstream) + OperatorHub.io catalog
│   ├── cert-manager, Multus
│   ├── community-kubevirt-hyperconverged (HCO 1.18.x)
│   ├── openshift-console (ose-console / origin-console, auth disabled)
│   ├── kubevirt-plugin (nginx + JS bundle patches via ConfigMaps)
│   ├── openshift-monitoring/metrics-stub (fake Thanos + Alertmanager)
│   ├── project.openshift.io + config.openshift.io stubs
│   └── Tailscale operator
│       ├── API proxy (oc over tailnet)
│       └── console-tailscale Service → http://microshift-console.<tailnet>.ts.net
└── Host Tailscale node (do not bind host :443 while CRC needs it)
```

## Access

| Path | URL |
|------|-----|
| Local console | `http://console-openshift-console.apps.crc.testing` |
| Tailscale console | `http://microshift-console.<tailnet>.ts.net` |
| `oc` | `eval $(crc oc-env)` (local) or Tailscale API proxy (remote) |

Auth is disabled on the console; the bridge uses a cluster-admin ServiceAccount token.

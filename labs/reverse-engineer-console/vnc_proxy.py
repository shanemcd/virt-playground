#!/usr/bin/env python3
"""
VNC proxy for KubeVirt VMs.
Connects to the /vnc WebSocket endpoint and exposes a local TCP socket
that a VNC viewer can connect to.
"""

import asyncio
import ssl
import sys
from pathlib import Path
import yaml
import websockets


def load_kubeconfig():
    """Load current context from kubeconfig."""
    kubeconfig_path = Path.home() / '.kube' / 'config'
    with open(kubeconfig_path) as f:
        config = yaml.safe_load(f)

    current_context = config['current-context']
    context = next(c for c in config['contexts'] if c['name'] == current_context)

    cluster_name = context['context']['cluster']
    user_name = context['context']['user']

    cluster = next(c for c in config['clusters'] if c['name'] == cluster_name)
    user = next(u for u in config['users'] if u['name'] == user_name)

    return {
        'server': cluster['cluster']['server'],
        'ca_cert': cluster['cluster'].get('certificate-authority-data'),
        'token': user['user'].get('token'),
    }


def build_vnc_url(server, namespace, vmi_name, preserve_session=False):
    """Construct the WebSocket URL for VNC access."""
    server = server.replace('https://', 'wss://').replace('http://', 'ws://')
    path = f'/apis/subresources.kubevirt.io/v1/namespaces/{namespace}/virtualmachineinstances/{vmi_name}/vnc'

    if preserve_session:
        path += '?preserveSession=true'

    return f'{server}{path}'


def create_ssl_context(ca_cert_data):
    """Create SSL context with cluster CA certificate."""
    import base64
    import tempfile

    ca_cert = base64.b64decode(ca_cert_data)
    with tempfile.NamedTemporaryFile(mode='wb', delete=False, suffix='.crt') as f:
        f.write(ca_cert)
        ca_file = f.name

    ssl_context = ssl.create_default_context(cafile=ca_file)
    return ssl_context


async def proxy_vnc(reader, writer, ws):
    """Proxy VNC traffic between TCP socket and WebSocket."""
    async def tcp_to_ws():
        """Read from TCP socket and send to WebSocket."""
        try:
            while True:
                data = await reader.read(4096)
                if not data:
                    break
                await ws.send(data)
        except Exception as e:
            print(f'TCP → WS error: {e}', file=sys.stderr)

    async def ws_to_tcp():
        """Read from WebSocket and send to TCP socket."""
        try:
            async for message in ws:
                writer.write(message)
                await writer.drain()
        except Exception as e:
            print(f'WS → TCP error: {e}', file=sys.stderr)

    # Run both directions concurrently
    await asyncio.gather(tcp_to_ws(), ws_to_tcp(), return_exceptions=True)

    writer.close()
    await writer.wait_closed()


async def handle_vnc_client(reader, writer, url, token, ssl_context):
    """Handle incoming VNC viewer connection."""
    client_addr = writer.get_extra_info('peername')
    print(f'VNC viewer connected from {client_addr}', file=sys.stderr)

    headers = {'Authorization': f'Bearer {token}'}
    subprotocols = ['plain.kubevirt.io']

    try:
        async with websockets.connect(
            url,
            additional_headers=headers,
            ssl=ssl_context,
            subprotocols=subprotocols,
        ) as ws:
            print(f'WebSocket connected to VM', file=sys.stderr)
            await proxy_vnc(reader, writer, ws)
    except Exception as e:
        print(f'Proxy error: {e}', file=sys.stderr)
    finally:
        print(f'Connection from {client_addr} closed', file=sys.stderr)


async def run_vnc_proxy(host, port, url, token, ssl_context):
    """Run VNC proxy server."""
    async def client_handler(reader, writer):
        await handle_vnc_client(reader, writer, url, token, ssl_context)

    server = await asyncio.start_server(client_handler, host, port)
    addr = server.sockets[0].getsockname()

    print(f'VNC proxy listening on {addr[0]}:{addr[1]}', file=sys.stderr)
    print(f'Connect your VNC viewer to: {addr[0]}:{addr[1]}', file=sys.stderr)
    print(f'Example: remote-viewer vnc://{addr[0]}:{addr[1]}', file=sys.stderr)

    async with server:
        await server.serve_forever()


def main():
    if len(sys.argv) < 3:
        print('Usage: vnc-proxy <vmi-name> <namespace> [host] [port]', file=sys.stderr)
        print('  host defaults to 127.0.0.1', file=sys.stderr)
        print('  port defaults to 5900', file=sys.stderr)
        sys.exit(1)

    vmi_name = sys.argv[1]
    namespace = sys.argv[2]
    host = sys.argv[3] if len(sys.argv) > 3 else '127.0.0.1'
    port = int(sys.argv[4]) if len(sys.argv) > 4 else 5900

    # Load config
    config = load_kubeconfig()

    # Build WebSocket URL
    url = build_vnc_url(config['server'], namespace, vmi_name)

    # Create SSL context
    ssl_context = create_ssl_context(config['ca_cert'])

    # Run proxy
    try:
        asyncio.run(run_vnc_proxy(host, port, url, config['token'], ssl_context))
    except KeyboardInterrupt:
        print('\nShutting down...', file=sys.stderr)


if __name__ == '__main__':
    main()

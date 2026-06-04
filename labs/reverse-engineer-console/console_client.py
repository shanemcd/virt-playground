#!/usr/bin/env python3
"""
Minimal serial console client for KubeVirt VMs.
Demonstrates how to connect directly to the console WebSocket endpoint.
"""

import asyncio
import ssl
import sys
import termios
import tty
from pathlib import Path
import yaml
import websockets


def load_kubeconfig():
    """Load current context from kubeconfig."""
    kubeconfig_path = Path.home() / '.kube' / 'config'
    with open(kubeconfig_path) as f:
        config = yaml.safe_load(f)

    # Find current context
    current_context = config['current-context']
    context = next(c for c in config['contexts'] if c['name'] == current_context)

    # Extract cluster and user
    cluster_name = context['context']['cluster']
    user_name = context['context']['user']

    cluster = next(c for c in config['clusters'] if c['name'] == cluster_name)
    user = next(u for u in config['users'] if u['name'] == user_name)

    return {
        'server': cluster['cluster']['server'],
        'ca_cert': cluster['cluster'].get('certificate-authority-data'),
        'token': user['user'].get('token'),
    }


def build_websocket_url(server, namespace, vmi_name):
    """Construct the WebSocket URL for console access."""
    # Convert https:// to wss://
    server = server.replace('https://', 'wss://').replace('http://', 'ws://')

    # Build subresource path
    path = f'/apis/subresources.kubevirt.io/v1/namespaces/{namespace}/virtualmachineinstances/{vmi_name}/console'

    return f'{server}{path}'


def create_ssl_context(ca_cert_data):
    """Create SSL context with cluster CA certificate."""
    import base64
    import tempfile

    # Decode base64 CA cert and write to temp file
    ca_cert = base64.b64decode(ca_cert_data)
    with tempfile.NamedTemporaryFile(mode='wb', delete=False, suffix='.crt') as f:
        f.write(ca_cert)
        ca_file = f.name

    ssl_context = ssl.create_default_context(cafile=ca_file)
    return ssl_context


async def stdin_to_websocket(ws):
    """Read from stdin and send to WebSocket."""
    loop = asyncio.get_event_loop()

    # Escape sequence: Ctrl+] or Ctrl+5 (ASCII 29)
    ESCAPE_CODE = 29

    while True:
        # Read one byte at a time for raw terminal input
        data = await loop.run_in_executor(None, sys.stdin.buffer.read, 1)
        if not data:
            break

        # Check for escape sequence
        if data[0] == ESCAPE_CODE:
            break

        await ws.send(data)


async def websocket_to_stdout(ws):
    """Read from WebSocket and write to stdout."""
    async for message in ws:
        # WebSocket returns bytes in binary mode
        sys.stdout.buffer.write(message)
        sys.stdout.buffer.flush()


async def connect_console(url, token, ssl_context):
    """Connect to VM console and handle bidirectional streaming."""
    headers = {
        'Authorization': f'Bearer {token}',
    }

    # The subprotocol is critical - server requires plain.kubevirt.io
    subprotocols = ['plain.kubevirt.io']

    try:
        async with websockets.connect(
            url,
            additional_headers=headers,
            ssl=ssl_context,
            subprotocols=subprotocols,
        ) as ws:
            print('Connected to console. Press Ctrl+] to exit.', file=sys.stderr)

            # Send a newline to trigger a fresh prompt
            await ws.send(b'\n')

            # Run stdin → ws and ws → stdout concurrently
            # When either task completes, cancel the other
            stdin_task = asyncio.create_task(stdin_to_websocket(ws))
            stdout_task = asyncio.create_task(websocket_to_stdout(ws))

            done, pending = await asyncio.wait(
                [stdin_task, stdout_task],
                return_when=asyncio.FIRST_COMPLETED
            )

            # Cancel any remaining tasks
            for task in pending:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

    except websockets.exceptions.InvalidStatusCode as e:
        print(f'Connection failed: {e}', file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f'Error: {e}', file=sys.stderr)
        sys.exit(1)


def main():
    if len(sys.argv) != 3:
        print('Usage: console-client <vmi-name> <namespace>', file=sys.stderr)
        sys.exit(1)

    vmi_name = sys.argv[1]
    namespace = sys.argv[2]

    # Load config from kubeconfig
    config = load_kubeconfig()

    # Build WebSocket URL
    url = build_websocket_url(config['server'], namespace, vmi_name)

    # Create SSL context
    ssl_context = create_ssl_context(config['ca_cert'])

    # Save terminal settings to restore later
    old_settings = termios.tcgetattr(sys.stdin)

    try:
        # Set terminal to raw mode for proper console interaction
        tty.setraw(sys.stdin.fileno())

        # Connect and stream
        asyncio.run(connect_console(url, config['token'], ssl_context))
    finally:
        # Restore terminal settings
        termios.tcsetattr(sys.stdin, termios.TCSADRAIN, old_settings)
        print()  # Print newline after exiting


if __name__ == '__main__':
    main()

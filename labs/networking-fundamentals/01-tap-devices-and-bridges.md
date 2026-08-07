# Lab 01: TAP Devices and Linux Bridges

## What You'll Learn

- What a TAP device is and how it works
- How to create and configure TAP devices manually
- What a Linux bridge does
- How to connect TAP devices to bridges
- How to route traffic between network namespaces using bridges

## Background

A **TAP device** is a kernel driver that creates a virtual network interface. When you write to the TAP device's file descriptor, the kernel delivers those bytes as network packets to the virtual interface. When packets arrive at the interface, you can read them from the file descriptor.

From the **guest's perspective** (VM or container), it's a normal network interface (like eth0).
From the **host's perspective**, it's a file descriptor you can read/write.

A **Linux bridge** works like a physical network switch. It connects multiple network interfaces together at layer 2, forwarding frames between them based on MAC addresses.

VMs use TAP devices as their virtual network cards. QEMU opens the TAP device and connects it to the guest's virtio-net driver. The bridge connects that TAP device to other TAP devices or to physical interfaces.

## Lab Setup

We'll create two network namespaces (simulating two VMs), give each a TAP device, bridge them together, and ping between them.

### Step 1: Verify ip and bridge utilities

```bash
# Check that you have the ip command (iproute2)
ip --version

# Check for bridge utilities
brctl --version
```

If missing, install with: `sudo dnf install iproute bridge-utils`

### Step 2: Create a Linux bridge

```bash
# Create a bridge named br0
sudo ip link add name br0 type bridge

# Verify it exists
ip link show br0

# Bring it up
sudo ip link set br0 up

# Check status
ip link show br0
```

You should see `br0` in state `UP`. No IP address yet, that's fine. The bridge operates at layer 2.

### Step 3: Create two network namespaces

Network namespaces isolate network interfaces. Each namespace has its own routing table, interfaces, etc. We'll use them to simulate separate VMs.

```bash
# Create two namespaces
sudo ip netns add vm1
sudo ip netns add vm2

# Verify they exist
ip netns list
```

### Step 4: Create TAP devices and attach to namespaces

```bash
# Create tap0 for vm1
sudo ip tuntap add dev tap0 mode tap

# Move tap0 into vm1 namespace
sudo ip link set tap0 netns vm1

# Create tap1 for vm2
sudo ip tuntap add dev tap1 mode tap

# Move tap1 into vm2 namespace
sudo ip link set tap1 netns vm2

# Verify: these commands should now fail because the devices are in namespaces
ip link show tap0  # Should error: Device "tap0" does not exist
ip link show tap1  # Should error: Device "tap1" does not exist
```

### Step 5: Configure interfaces inside namespaces

```bash
# Configure vm1's tap0
sudo ip netns exec vm1 ip addr add 192.168.100.10/24 dev tap0
sudo ip netns exec vm1 ip link set tap0 up
sudo ip netns exec vm1 ip link set lo up

# Configure vm2's tap1
sudo ip netns exec vm2 ip addr add 192.168.100.20/24 dev tap1
sudo ip netns exec vm2 ip link set tap1 up
sudo ip netns exec vm2 ip link set lo up

# Verify IP assignments
sudo ip netns exec vm1 ip addr show tap0
sudo ip netns exec vm2 ip addr show tap1
```

### Step 6: Try to ping (will fail)

```bash
# Try to ping vm2 from vm1
sudo ip netns exec vm1 ping -c 2 192.168.100.20
```

**This will fail.** The interfaces exist but they're not connected. That's where the bridge comes in.

### Step 7: Create veth pairs to connect namespaces to bridge

TAP devices inside namespaces can't directly attach to a bridge in the root namespace. We need **veth pairs** (virtual ethernet cables). One end goes in the namespace, the other end attaches to the bridge.

```bash
# Create veth pair for vm1
sudo ip link add veth-vm1 type veth peer name veth-vm1-br

# Move veth-vm1 into vm1 namespace
sudo ip link set veth-vm1 netns vm1

# Attach veth-vm1-br to the bridge
sudo ip link set veth-vm1-br master br0
sudo ip link set veth-vm1-br up

# Configure veth-vm1 inside vm1 namespace
sudo ip netns exec vm1 ip addr add 192.168.100.11/24 dev veth-vm1
sudo ip netns exec vm1 ip link set veth-vm1 up

# Create veth pair for vm2
sudo ip link add veth-vm2 type veth peer name veth-vm2-br
sudo ip link set veth-vm2 netns vm2
sudo ip link set veth-vm2-br master br0
sudo ip link set veth-vm2-br up

sudo ip netns exec vm2 ip addr add 192.168.100.21/24 dev veth-vm2
sudo ip netns exec vm2 ip link set veth-vm2 up
```

### Step 8: Ping across the bridge

```bash
# Ping vm2 from vm1 via the veth interfaces
sudo ip netns exec vm1 ping -c 4 192.168.100.21
```

**This should succeed.** Packets flow: vm1 veth-vm1 → veth-vm1-br → br0 → veth-vm2-br → veth-vm2 → vm2.

### Step 9: Inspect the bridge

```bash
# Show bridge members
bridge link show br0

# Show MAC address table (learned addresses)
bridge fdb show br0
```

You'll see veth-vm1-br and veth-vm2-br as members. The MAC table shows which MAC addresses the bridge has learned on which ports.

### Step 10: Run tcpdump to see packets

```bash
# Capture on the bridge in one terminal
sudo tcpdump -i br0 -n

# In another terminal, ping again
sudo ip netns exec vm1 ping -c 2 192.168.100.21
```

Watch the ICMP echo request and reply frames traverse the bridge.

## What You Learned

1. **TAP devices** are virtual network interfaces backed by file descriptors
2. **Network namespaces** isolate network stacks (like separate VMs)
3. **veth pairs** are virtual ethernet cables connecting namespaces
4. **Linux bridges** forward frames between interfaces at layer 2, just like physical switches
5. Packet path: namespace interface → veth → bridge → veth → namespace interface

This is the foundation. QEMU uses TAP devices exactly like this. Containers use veth pairs exactly like this. KubeVirt combines both.

## Cleanup

```bash
# Delete namespaces (automatically removes interfaces inside them)
sudo ip netns del vm1
sudo ip netns del vm2

# Delete bridge
sudo ip link del br0
```

## Next

In Lab 02, you'll create an actual QEMU VM that uses a TAP device to connect to this bridge.

# 01 - NBD Kit Fundamentals

**Goal:** Understand how NBD Kit enables block-level access to remote/compressed disk images without mounting or credentials.

## What is NBD Kit?

NBD (Network Block Device) Kit is a toolkit for creating custom NBD servers. Created by Richard Jones (Red Hat), it's a core technology enabling MTV's migration capabilities.

## Key Concepts

**Plugins** - Source connectors:
- `curl` - HTTP/HTTPS endpoints
- `vddk` - VMware VDDK API
- Many others (SSH, file, memory, etc.)

**Filters** - Transform/intercept blocks:
- `xz` - Decompress XZ-compressed images
- `partition` - Expose individual partitions
- `cow` - Copy-on-write overlay
- `error` - Inject failures for testing
- Filters are chainable

## Architecture

```
[Remote compressed image] 
    ↓ (NBD Kit curl plugin)
[HTTP block requests]
    ↓ (XZ filter)
[Decompressed blocks]
    ↓ (Partition filter)
[Individual partition access]
    ↓ (COW filter)
[Local writes, no remote changes]
    ↓
[Mount point / libguestfs]
```

## Why This Matters for MTV

1. **Minimal data transfer** - Only reads necessary blocks, not entire disk
2. **No source modification** - COW filter means zero writes to source
3. **No credentials needed** - Works at block level, doesn't need guest OS access
4. **Compression support** - Handles compressed images transparently
5. **Testability** - Error filter enables fault injection

## Demo from Martin

Martin's demo showed:
- HTTP server exposing XZ-compressed Fedora image
- NBD Kit with curl plugin + XZ filter + COW filter
- Mount the filesystem, write changes locally
- Unmount, verify changes don't persist to source

Command structure:
```bash
nbdkit \
  --socket=/tmp/nbd.sock \
  --filter=xz \
  --filter=cow \
  curl url=http://localhost:8000/fedora.raw.xz

# Then mount via the socket
guestfish --add nbd://localhost --ro
```

## Lab Exercise (TODO)

1. Download a compressed Fedora cloud image
2. Serve it via simple HTTP server
3. Use NBD Kit to expose it as a block device
4. Mount and explore the filesystem
5. Make changes, verify they're local only
6. Compare to direct mount (what happens without NBD Kit?)

## Open Questions

- What's the performance overhead of the filter chain?
- How does NBD Kit know which blocks to request?
- What happens if the HTTP connection drops mid-read?
- How does this integrate with VDDK (VMware's proprietary API)?

## Next Steps

→ 02-libguestfs.md - How the mounted filesystem is manipulated safely

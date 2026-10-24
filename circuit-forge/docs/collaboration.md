# Local collaboration

The Node server is authoritative. Each typed replace operation has a UUID, project ID, base revision, and schema-validated circuit. Accepted revisions increase by one. UUID retry records make an accepted retry idempotent. The server derives object changes from the base revision rather than treating every stale payload as permission to overwrite the latest project.

If the base is stale but retained, a three-way comparison merges independent node/wire edits by stable ID. Comparison ignores JSON property ordering. Simultaneous edits to the same node, wire, project name, or definition collection conflict deterministically. A wire referencing a concurrently deleted endpoint also conflicts. A conflict returns the current authoritative snapshot and an explanation; the UI preserves its local draft for export and offers an explicit discard/reload action. No arbitrary offline merge or CRDT is claimed.

Accepted content, operation ID, and revision are committed atomically in SQLite WAL mode, then broadcast. The last 100 revisions are retained for comparison; a stale base older than this conflicts. Reconnect joins a project and receives its complete current snapshot. During disconnection shared structural controls are disabled. If a connection drops before acknowledgment, the draft is retained and clearly marked; it is not silently replaced.

Undo sends another validated operation. A remote edit clears local undo/redo history. If a remote edit races with undo, normal revision/conflict validation still applies. This avoids restoring a historical whole-project snapshot over acknowledged remote work. Edits in flight remain pending until the sender's acknowledgment snapshot arrives; an intervening remote snapshot does not erase the pending draft.

Presence uses random local session IDs and transient cursor/selection messages, separate from persisted edits. The toolbar reports connected clients. Each browser simulates independently from its displayed shared revision; live simulation state and input switches are local to that browser.

The server binds `127.0.0.1`. It validates host/origin, schema, 512-KB bodies/messages, 32 active sessions, and 120 messages/s per session. It provides project APIs, not filesystem access. These are local-demo bounds, not public-service authentication or a production security claim. Do not expose the collaboration server publicly.

`npm run test:protocol` launches two genuine Node WebSocket clients, exercises nonconflicting edits, a same-object conflict, retries, malformed input, reconnect, rejected origin, and a real SQLite server restart. `npm run test:browser` uses two actual browser contexts against the local server; it also checks UI convergence and a conflict with both operations held briefly to share the same base revision. Messages still travel to the real server.

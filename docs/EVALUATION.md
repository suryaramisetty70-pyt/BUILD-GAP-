# Evaluation and data contract

Each dataset case has `id`, `task`, `category`, `split` (`train` or `holdout`), `provenance`, and 1–12 `checks`. `baseline` and `improved` response strings are optional until collection. Drafts contain 0–100 tasks; evaluation requires at least two tasks and both splits. Dataset size is capped at 500 KB. Responses are capped at 24,000 characters each.

```json
{
  "id":"extract-001",
  "task":"Extract name and age from Maya is 24. Return JSON.",
  "category":"Information extraction",
  "split":"train",
  "provenance":"User-authored task and human-verified expected values",
  "checks":[{"type":"json","keys":["name","age"],"fields":{"name":"Maya","age":24},"dimension":"Response format"}]
}
```

| Check | Rule |
|---|---|
| `exact`, `value` | Equality after NFKC, trim, lowercase and whitespace collapse |
| `contains`, `value` | Normalized substring presence; not token or semantic matching |
| `json`, `keys` / `fields` | JSON object with own required keys and strictly equal primitive field values |
| `words`, `min` / `max` | Whitespace-delimited word count within bounds |
| `unique_steps`, `max` | JSON steps array with bounded, distinct normalized nonempty strings |

Dimensions: Correctness, Completeness, Response format, Instruction adherence, Planner control, Context retention. Empty responses fail. A case succeeds only when every declared check passes. Success rate is passed cases / all cases; delta is candidate minus baseline in percentage points. Recovered = fail to pass; regression = pass to fail. Gap denominators include only applicable cases. The candidate Wilson interval is descriptive and assumes independent trials.

## Data sources

- **Saved pairs:** re-evaluates dataset responses. Prompt selections are annotations and cannot change prewritten outputs.
- **Manual:** evaluates user-provided response pairs; model/provenance conditions are not verified.
- **Live:** generates new responses on Groq, with the same model/task/settings on each side and different saved instructions. Temperature 0, maximum completion tokens 1,200, timeout 25 seconds/call. No expected checks or reference values are sent in model messages. At most 20 tasks per live run.

Live initialization freezes task and prompt snapshots. Each subsequent request generates one baseline or candidate response and saves it before the next call. Interrupted runs are listed in Experiments. A lease and expected-step number prevent two tabs from intentionally executing the same saved step. A lost unsaved provider response can still consume quota and require another call on retry.

Prompt suggestions inspect only baseline training failures from the selected saved report, or from the current dataset when no report is selected. Expected reference values and holdout outputs are not copied into the generated patch. Users can still leak answers through manual prompt edits; independent holdouts and human review remain necessary.

Reports retain snapshots and are capped at 1.5 MB. The interface shows the latest 30 reports, including trash/restore handling, and recent unfinished live evaluations. CSV exports quote fields and prefix formula-like values for safer spreadsheet import. JSON exports preserve detailed evidence.

## Anonymous access

The public site has no login requirement. A random HttpOnly, SameSite cookie identifies a browser workspace; its SHA-256 digest scopes records on the server. Cookie expiry is 30 days. Records are not automatically deleted when a cookie expires, and the interface has no cross-device account recovery. Export data you need to carry elsewhere. Old authenticated records are kept separate and are not exposed in anonymous workspaces.

## Storage and deployment

Hosted D1 and portable SQLite/PostgreSQL implement the same record-store operations. SQLite is tested across restarts on a persistent local file. PostgreSQL is selected with DATABASE_URL; no live PostgreSQL integration test was possible without a connection string. Render Free filesystems are ephemeral, so durable deployment there requires an external persistent database.

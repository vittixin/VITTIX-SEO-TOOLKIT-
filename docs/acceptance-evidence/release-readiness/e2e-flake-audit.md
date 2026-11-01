# E2E stale-highlight reliability audit

The baseline was run against the production and e2e builds from the current committed application code. Each full run executed 26 tests with one worker and no retries.

| Baseline full run | Result                                                  |
| ----------------- | ------------------------------------------------------- |
| 1–4               | 26 passed each                                          |
| 5                 | 25 passed; stale-highlight test timed out at 60 seconds |
| 6–10              | 26 passed each                                          |

The failing suite took 4.3 minutes; green suites took 3.2–3.6 minutes. Repeating the stale-highlight test 20 times reproduced the same timeout once, on iteration 18; the other 19 passed. No other test failed in the baseline runs.

The test raced Chrome tab activation and IndexedDB transaction completion. It called `bringToFront()` and immediately asked the extension for the active tab, without waiting for Chrome to make the target tab active. It also resolved the audit-seeding promise on the individual `add` request's success event and closed the database before observing transaction completion. Under suite load, those asynchronous boundaries could stall the test until its 60-second timeout.

The test now waits for the production popup and audit database, waits until `chrome.tabs.query()` reports the expected tab ID after each tab activation, and resolves audit seeding only on transaction completion. Navigation has explicit bounded timeouts. The focused stale-highlight test passed 20/20 after the change.

The post-fix full suite was run ten consecutive times: **10/10 runs passed, 26/26 tests each (260 passing test executions, zero failures)**. Per-run summaries and logs are in the ignored local directory `node_modules/.cache/vittix-release-e2e-soak/`.

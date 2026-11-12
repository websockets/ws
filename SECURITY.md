# Security Guidelines

## Reporting a Vulnerability

Please report security vulnerabilities privately via
[GitHub Private Vulnerability Reporting](https://github.com/websockets/ws/security/advisories/new).
Feedback is generally provided within **72 hours**. If no response is received
within that time frame, please follow up directly with the maintainers. Email
addresses for the lead developers can be found in the git commit history, for
example, by running the following command:

```
git --no-pager show -s --format='%an <%ae>' <gitsha>
```

where `<gitsha>` is the SHA of their latest commit in the project.

Once the report is acknowledged and the vulnerability is confirmed, a fix will
be developed in collaboration with the reporter and a public security advisory
published on
[GitHub Security Advisories](https://github.com/websockets/ws/security/advisories?state=published).

## History

- 04 Jan 2016:
  [Buffer vulnerability](https://github.com/websockets/ws/releases/tag/1.0.1)
- 08 Nov 2017:
  [DoS in the `Sec-Websocket-Extensions` header parser](https://github.com/websockets/ws/releases/tag/3.3.1)
- 25 May 2021:
  [ReDoS in `Sec-Websocket-Protocol` header](https://github.com/websockets/ws/releases/tag/7.4.6)
- 16 Jun 2024:
  [DoS when handling a request with many HTTP headers](https://github.com/websockets/ws/releases/tag/8.17.1)
- 12 May 2026:
  [Uninitialized memory disclosure in `websocket.close()`](https://github.com/websockets/ws/releases/tag/8.20.1)
- 22 May 2026:
  [Memory exhaustion DoS from tiny fragments and data chunks](https://github.com/websockets/ws/releases/tag/8.21.0)
- 12 Nov 2026:
  [Memory exhaustion DoS via unbounded automatic pong responses](https://github.com/websockets/ws/releases/tag/8.23.0)

# Security Guidelines

Please contact us directly at **security@3rd-Eden.com** for any bug that might
impact the security of this project. Please prefix the subject of your email
with `[security]` in lowercase and square brackets. Our email filters will
automatically prevent these messages from being moved to our spam box.

You will receive an acknowledgement of your report within **24 hours**.

All emails that do not include security vulnerabilities will be removed and
blocked instantly.

## Exceptions

If you do not receive an acknowledgement within the said time frame please give
us the benefit of the doubt as it's possible that we haven't seen it yet. In
this case please send us a message **without details** using one of the
following methods:

- Contact the lead developers of this project on their personal e-mails. You can
  find the e-mails in the git logs, for example using the following command:
  `git --no-pager show -s --format='%an <%ae>' <gitsha>` where `<gitsha>` is the
  SHA1 of their latest commit in the project.
- Create a GitHub issue stating contact details and the severity of the issue.

Once we have acknowledged receipt of your report and confirmed the bug ourselves
we will work with you to fix the vulnerability and publicly acknowledge your
responsible disclosure, if you wish. In addition to that we will create and
publish a security advisory to
[GitHub Security Advisories](https://github.com/websockets/ws/security/advisories?state=published).

## History

- 04 Jan 2016:
  [Buffer vulnerability](https://github.com/websockets/ws/releases/tag/1.0.1)
- 08 Nov 2017:
  [DoS vulnerability](https://github.com/websockets/ws/releases/tag/3.3.1)
- 25 May 2021:
  [ReDoS in `Sec-Websocket-Protocol` header](https://github.com/websockets/ws/releases/tag/7.4.6)

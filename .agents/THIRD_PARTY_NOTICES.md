# Third-party agent skills

The project-local skills under `.agents/skills/` are imported third-party
materials. `skills-lock.json` records their upstream source paths and content
hashes.

| Installed skill | Upstream source | Declared license | Included notice |
| --- | --- | --- | --- |
| `ask-matt` | `mattpocock/skills`, `skills/engineering/ask-matt` | MIT | `.agents/licenses/mattpocock-skills-MIT.txt` |
| `code-review` | `mattpocock/skills`, `skills/engineering/code-review` | MIT | `.agents/licenses/mattpocock-skills-MIT.txt` |
| `codebase-design` | `mattpocock/skills`, `skills/engineering/codebase-design` | MIT | `.agents/licenses/mattpocock-skills-MIT.txt` |
| `diagnosing-bugs` | `mattpocock/skills`, `skills/engineering/diagnosing-bugs` | MIT | `.agents/licenses/mattpocock-skills-MIT.txt` |
| `domain-modeling` | `mattpocock/skills`, `skills/engineering/domain-modeling` | MIT | `.agents/licenses/mattpocock-skills-MIT.txt` |
| `find-skills` | `vercel-labs/skills`, `skills/find-skills` | MIT | `.agents/licenses/vercel-labs-skills-MIT.txt` |
| `frontend-design` | `anthropics/skills`, `skills/frontend-design` | Apache-2.0 | `.agents/skills/frontend-design/LICENSE.txt` |
| `grill-me` | `mattpocock/skills`, `skills/productivity/grill-me` | MIT | `.agents/licenses/mattpocock-skills-MIT.txt` |
| `grill-with-docs` | `mattpocock/skills`, `skills/engineering/grill-with-docs` | MIT | `.agents/licenses/mattpocock-skills-MIT.txt` |
| `grilling` | `mattpocock/skills`, `skills/productivity/grilling` | MIT | `.agents/licenses/mattpocock-skills-MIT.txt` |
| `handoff` | `mattpocock/skills`, `skills/productivity/handoff` | MIT | `.agents/licenses/mattpocock-skills-MIT.txt` |
| `implement` | `mattpocock/skills`, `skills/engineering/implement` | MIT | `.agents/licenses/mattpocock-skills-MIT.txt` |
| `improve-codebase-architecture` | `mattpocock/skills`, `skills/engineering/improve-codebase-architecture` | MIT | `.agents/licenses/mattpocock-skills-MIT.txt` |
| `prototype` | `mattpocock/skills`, `skills/engineering/prototype` | MIT | `.agents/licenses/mattpocock-skills-MIT.txt` |
| `research` | `mattpocock/skills`, `skills/engineering/research` | MIT | `.agents/licenses/mattpocock-skills-MIT.txt` |
| `resolving-merge-conflicts` | `mattpocock/skills`, `skills/engineering/resolving-merge-conflicts` | MIT | `.agents/licenses/mattpocock-skills-MIT.txt` |
| `setup-matt-pocock-skills` | `mattpocock/skills`, `skills/engineering/setup-matt-pocock-skills` | MIT | `.agents/licenses/mattpocock-skills-MIT.txt` |
| `sleek-design-mobile-apps` | `sleekdotdesign/agent-skills`, `skills/design-mobile-apps` | MIT | `.agents/licenses/sleekdotdesign-agent-skills-MIT.txt` |
| `tdd` | `mattpocock/skills`, `skills/engineering/tdd` | MIT | `.agents/licenses/mattpocock-skills-MIT.txt` |
| `teach` | `mattpocock/skills`, `skills/productivity/teach` | MIT | `.agents/licenses/mattpocock-skills-MIT.txt` |
| `to-spec` | `mattpocock/skills`, `skills/engineering/to-spec` | MIT | `.agents/licenses/mattpocock-skills-MIT.txt` |
| `to-tickets` | `mattpocock/skills`, `skills/engineering/to-tickets` | MIT | `.agents/licenses/mattpocock-skills-MIT.txt` |
| `triage` | `mattpocock/skills`, `skills/engineering/triage` | MIT | `.agents/licenses/mattpocock-skills-MIT.txt` |
| `vercel-react-best-practices` | `vercel-labs/agent-skills`, `skills/react-best-practices` | MIT | `.agents/licenses/vercel-labs-agent-skills-MIT.txt` |
| `wayfinder` | `mattpocock/skills`, `skills/engineering/wayfinder` | MIT | `.agents/licenses/mattpocock-skills-MIT.txt` |
| `writing-great-skills` | `mattpocock/skills`, `skills/productivity/writing-great-skills` | MIT | `.agents/licenses/mattpocock-skills-MIT.txt` |

The additional notices live outside the imported skill directories so the
locked skill payloads remain unchanged. Review upstream changes and their
licenses before updating a locked skill.

Upstream repositories:

- https://github.com/vercel-labs/skills
- https://github.com/anthropics/skills
- https://github.com/sleekdotdesign/agent-skills
- https://github.com/vercel-labs/agent-skills
- https://github.com/mattpocock/skills
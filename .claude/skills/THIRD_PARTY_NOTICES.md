# Third-party agent skills

The skills under `.claude/skills/` listed below are imported third-party
materials, kept verbatim from their upstream sources.

| Installed skill | Upstream source | Declared license | Included notice |
| --- | --- | --- | --- |
| `code-review` | `mattpocock/skills`, `skills/engineering/code-review` | MIT | `licenses/mattpocock-skills-MIT.txt` |
| `codebase-design` | `mattpocock/skills`, `skills/engineering/codebase-design` | MIT | `licenses/mattpocock-skills-MIT.txt` |
| `diagnosing-bugs` | `mattpocock/skills`, `skills/engineering/diagnosing-bugs` | MIT | `licenses/mattpocock-skills-MIT.txt` |
| `domain-modeling` | `mattpocock/skills`, `skills/engineering/domain-modeling` | MIT | `licenses/mattpocock-skills-MIT.txt` |
| `frontend-design` | `anthropics/skills`, `skills/frontend-design` | Apache-2.0 | `frontend-design/LICENSE.txt` |
| `grill-with-docs` | `mattpocock/skills`, `skills/engineering/grill-with-docs` | MIT | `licenses/mattpocock-skills-MIT.txt` |
| `grilling` | `mattpocock/skills`, `skills/productivity/grilling` | MIT | `licenses/mattpocock-skills-MIT.txt` |
| `improve-codebase-architecture` | `mattpocock/skills`, `skills/engineering/improve-codebase-architecture` | MIT | `licenses/mattpocock-skills-MIT.txt` |
| `prototype` | `mattpocock/skills`, `skills/engineering/prototype` | MIT | `licenses/mattpocock-skills-MIT.txt` |
| `research` | `mattpocock/skills`, `skills/engineering/research` | MIT | `licenses/mattpocock-skills-MIT.txt` |
| `resolving-merge-conflicts` | `mattpocock/skills`, `skills/engineering/resolving-merge-conflicts` | MIT | `licenses/mattpocock-skills-MIT.txt` |
| `tdd` | `mattpocock/skills`, `skills/engineering/tdd` | MIT | `licenses/mattpocock-skills-MIT.txt` |
| `vercel-react-best-practices` | `vercel-labs/agent-skills`, `skills/react-best-practices` | MIT | `licenses/vercel-labs-agent-skills-MIT.txt` |

`mobile-e2e` and `schema-change` are FitTip's own skills, not imported.

Notices live beside the skills rather than inside them, so an imported payload
stays byte-identical to its upstream copy. Review upstream changes and their
licenses before updating an imported skill.

Upstream repositories:

- https://github.com/mattpocock/skills
- https://github.com/anthropics/skills
- https://github.com/vercel-labs/agent-skills

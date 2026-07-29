# Third-party agent skills

The project-local skills under `.agents/skills/` are imported third-party
materials. `skills-lock.json` records their upstream source paths and content
hashes.

| Installed skill | Upstream source | Declared license | Included notice |
| --- | --- | --- | --- |
| `find-skills` | `vercel-labs/skills`, `skills/find-skills` | MIT | `.agents/licenses/vercel-labs-skills-MIT.txt` |
| `frontend-design` | `anthropics/skills`, `skills/frontend-design` | Apache-2.0 | `.agents/skills/frontend-design/LICENSE.txt` |
| `sleek-design-mobile-apps` | `sleekdotdesign/agent-skills`, `skills/design-mobile-apps` | MIT | `.agents/licenses/sleekdotdesign-agent-skills-MIT.txt` |
| `vercel-react-best-practices` | `vercel-labs/agent-skills`, `skills/react-best-practices` | MIT | `.agents/licenses/vercel-labs-agent-skills-MIT.txt` |

The additional notices live outside the imported skill directories so the
locked skill payloads remain unchanged. Review upstream changes and their
licenses before updating a locked skill.

Upstream repositories:

- https://github.com/vercel-labs/skills
- https://github.com/anthropics/skills
- https://github.com/sleekdotdesign/agent-skills
- https://github.com/vercel-labs/agent-skills

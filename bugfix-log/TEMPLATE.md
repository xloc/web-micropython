> instructions in this template are put under markdown block quotes `>`

# Bug Fix: [Short Title]

> one file for each independent bug

- **Date:** YYYY-MM-DD
- symptom: [one sentence summary]
- root cause: [one sentence summary]
- solution: [one sentence summary]


---

> About writing, always make it structural. 
> Start with a summary, and then details. 
> Use bullet points instead of long sentences when possible to keep the description concise and easy to understand.
> When refering code, use <path>:<line-number> format that vscode understand. If less than 5 lines, prefer to copy related lines here.

## Symptom

> Describe the observed problem from the user's perspective. What went wrong? 
> Use examples if it is easier to explain in that way
> Generally, it should not contain subsections. 

## Root Cause

> Explain the technical reason why the bug occurred. Be specific about which code or design decision caused the issue.
> Generally, it should not contain subsections. 

## Investigation

> Briefly describe how the bug was diagnosed. What evidence led to finding the root cause?
> Focus on the key steps that help to reveal the root-cause and ignore the ones that don't (or only briefly mention if absolutely necessary).

## Solution

> Describe the fix implemented. Focus on why this approach solves the problem. Include key code snippets if they clarify the solution.

## Lessons Learned

> Key takeaways for future debugging and development.
> Use bullet points. Describe each point perferrablely one sentence.
> Include the ones that you will not try unless prompted or discovered by accident
> - key debug technique. include but not limited to: special logging, web search, refer to best practice
> - design trap that need to avoid. include but not limited to: race condition
> - good design practice. like: keep one souce-of-truth for states

---

## References (Optional)

> Links to relevant documentation, specifications, issues, or related bug fixes.

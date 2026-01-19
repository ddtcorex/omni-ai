---
description: Full lifecycle workflow - Create issue -> Plan -> Develop -> Test -> Documentation -> Squash -> Merge
---

# GitHub Issue Workflow

## 1. Create Issue

Create a new GitHub issue with proper labels and milestone:

```bash
gh issue create --title "<title>" --body "<body>" --label "<labels>" --milestone "<milestone>"
```

## 2. Plan

- Break down the issue into subtasks
- Create implementation plan in issue comments
- Assign to yourself if ready to work

## 3. Create Branch

// turbo

```bash
git checkout develop
git pull origin develop
git checkout -b feature/<issue-number>-<short-description>
```

## 4. Develop

- Implement the feature/fix
- Follow code style guidelines
- Write clean, documented code

## 5. Test

- Run tests locally
- Verify functionality in browser
- Test edge cases

## 6. Commit & Push

```bash
git add .
git commit -m "feat: <description> (#<issue-number>)"
git push -u origin feature/<issue-number>-<short-description>
```

## 7. Create PR

```bash
gh pr create --title "<title>" --body "Closes #<issue-number>" --base develop --assignee @me
```

## 8. Review & Merge

- Address review comments
- Squash and merge when approved
- Delete branch after merge

## 9. Close Issue

Issue auto-closes when PR is merged with "Closes #<issue-number>"

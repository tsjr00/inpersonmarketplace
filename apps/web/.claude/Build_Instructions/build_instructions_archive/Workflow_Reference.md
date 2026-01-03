# Chet ↔ CC Workflow Reference

## Folder Structure

```
C:\FastWrks-Fireworks\BuildApp\apps\web\.claude\
├── Build_Instructions\        # Instructions FROM Chet TO CC
│   ├── Build_Instructions_[Feature].md
│   └── Session_Summary_Template.md (reference copy)
│
└── Session_Summaries\         # Summaries FROM CC TO Chet
    └── Session_Summary_YYYY-MM-DD_[Feature].md
```

---

## Workflow Process

### Phase 1: Planning (Chet + User)
1. User discusses goals/features with Chet
2. Chet asks clarifying questions
3. User makes decisions
4. Chet creates Build_Instructions_[Feature].md
5. User saves file to: `.claude\Build_Instructions\`

### Phase 2: Execution (CC)
1. User opens CC in project terminal
2. User references Build_Instructions file
3. CC executes tasks
4. CC uses Session_Summary_Template.md as guide
5. CC creates Session_Summary_YYYY-MM-DD_[Feature].md
6. CC saves to: `.claude\Session_Summaries\`

### Phase 3: Review (User + Chet)
1. User copies Session_Summary content
2. User pastes into Chet conversation
3. Chet reviews summary
4. Chet asks questions based on summary
5. User + Chet plan next phase
6. Cycle repeats

---

## File Naming Conventions

### Build Instructions (FROM Chet)
```
Build_Instructions_[Feature].md

Examples:
Build_Instructions_Deployment.md
Build_Instructions_Auth_Setup.md
Build_Instructions_Database_Schema.md
Build_Instructions_Vendor_Listing_Flow.md
```

### Session Summaries (FROM CC)
```
Session_Summary_YYYY-MM-DD_[Feature].md

Examples:
Session_Summary_2026-01-03_Deployment.md
Session_Summary_2026-01-04_Auth_Setup.md
Session_Summary_2026-01-05_Database_Schema.md
```

---

## Standard Instructions for CC

**Every Build_Instructions file should include:**

```markdown
## Session Summary Requirements

When this work session is complete, create a Session Summary using the 
template located at: .claude\Build_Instructions\Session_Summary_Template.md

Save your completed summary to: 
.claude\Session_Summaries\Session_Summary_YYYY-MM-DD_[Feature].md

Replace YYYY-MM-DD with today's date and [Feature] with this session's focus.
```

---

## Benefits of This System

### For Continuity
- Chet sees full context of what CC did
- No information lost between sessions
- Easy to track progress over time

### For Decision Making
- Questions clearly documented
- Assumptions visible
- Options presented with context

### For Troubleshooting
- Changes tracked
- Errors documented
- Solutions recorded

### For Planning
- Next steps clearly defined
- Dependencies identified
- Priorities established

---

## Template Philosophy

### What the Template Captures

**Factual:**
- What was actually done
- What changed in codebase
- What works/doesn't work
- What errors occurred

**Analytical:**
- Why decisions were made
- What alternatives existed
- What assumptions were made
- What risks exist

**Forward-Looking:**
- What should happen next
- What needs deciding
- What needs clarifying
- What's blocked

### What the Template Avoids
- Unnecessary verbosity
- Speculation without context
- Missing critical details
- Dumping raw code (unless needed for debugging)

---

## CC Instructions Integration

### Standard Opening (in all Build_Instructions)
```markdown
# Build Instructions - [Feature Name]

**Session Date:** [Date these instructions created]  
**Created by:** Chet (Claude Chat)  
**Folder:** .claude\Build_Instructions\

---

## Objective
[Clear statement of what this session should accomplish]
```

### Standard Closing (in all Build_Instructions)
```markdown
---

## Session Summary Requirements

When all tasks are complete (or you reach a stopping point), create your 
Session Summary:

1. Copy template from: `.claude\Build_Instructions\Session_Summary_Template.md`
2. Fill in all relevant sections
3. Save as: `.claude\Session_Summaries\Session_Summary_YYYY-MM-DD_[Feature].md`
4. Let the user know summary is ready

**Critical:** Fill out ALL sections, even if some are "N/A" or "None". 
This ensures nothing is overlooked.
```

---

## Quality Checklist for CC

Before completing a session summary, verify:

- [ ] All tasks listed with completion status
- [ ] All file changes documented
- [ ] Testing results included
- [ ] Questions clearly stated with context
- [ ] Next steps prioritized
- [ ] No sensitive credentials in summary
- [ ] Decisions explained with rationale
- [ ] Issues documented with attempted solutions

---

## Chet's Review Checklist

When receiving a session summary, Chet reviews for:

- [ ] Clarity - Can I understand what happened?
- [ ] Completeness - Are there gaps in information?
- [ ] Decisions - Are there choices I need to make?
- [ ] Blockers - What's preventing progress?
- [ ] Quality - Any technical debt or concerns?
- [ ] Next Steps - Is the path forward clear?

---

## Evolution of This System

**This workflow document may be updated as we:**
- Discover better practices
- Identify missing information in summaries
- Refine the handoff process
- Learn what Chet needs most for planning

**When changes occur:**
- Update this reference doc
- Update Session_Summary_Template.md
- Note changes in next Build_Instructions

---

*Maintained by: Chet (Claude Chat)*  
*Last Updated: 2026-01-03*

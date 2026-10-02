# PolicyPilot UI/UX Specification

## Design Direction

PolicyPilot should feel like a **calm personal insurance assistant**, not a traditional insurance portal.

Use:
- Sage green
- Muted teal
- Warm cream / beige
- Soft peach
- Light blue accents
- Rounded cards
- Subtle shadows
- Generous whitespace
- Minimal borders
- Simple, friendly icons and illustrations

Avoid:
- Bland white/black layouts
- Heavy corporate blue
- Too many buttons
- Dense dashboards
- Excessive information on the first screen

---

# 1. Home / Dashboard

### Purpose

The Home page should answer:

> **"What needs my attention?"**

It should NOT duplicate the My Policies page.

### Header

- PolicyPilot logo
- Search: "Search anything about your policies..."
- Notifications
- User profile

### Greeting

**Good morning, Rishabh 👋**

"Here's what you need to know about your insurance today."

### Summary Cards

Show only high-level information:

- Active Policies
- Renewal Due
- Total Coverage

### Things to Take Care Of

Show only items that require attention.

Examples:

- **Health Insurance renewal due soon**
  - Renewal date
  - `Review →`

- **Health policy is being processed**
  - "We're extracting your policy details."
  - `View Status →`

Do not show all policy cards here.

### Quick Actions

Section title:

**What would you like to do?**

Actions:

- Upload a Policy
- Ask PolicyPilot
- Start a Claim
- Find Cashless Hospitals

Each action should be a simple card with one CTA.

### PolicyPilot Insights

AI-generated useful observations based on the user's policies.

Examples:

- "You have ₹5L coverage in your health policy."
- "Your motor policy expires in 45 days."
- "Two of your policies may have overlapping coverage."

Use this section to make the AI/RAG capabilities visible.

---

# 2. My Policies

### Purpose

The My Policies page should answer:

> **"Show me all my policies."**

This is the complete policy library.

### Header

**My Policies**

"Manage and view all your insurance policies in one place."

Primary CTA:

**Upload Policy**

### Filters

- All
- Health
- Life
- Motor

Optional:
- Search policies
- Sort by latest / oldest / renewal date

### Policy Cards

Each card should show:

- Policy type/icon
- Policy name
- Insurer
- Status
- Policy number
- Coverage
- Renewal date
- View Details

For policies still being processed:

- Show `Processing`
- Hide unavailable extracted information
- Show `View Status`

### Upload Area

At the bottom of the page:

**Upload another policy**

Support:
- PDF
- JPG
- PNG

Include drag-and-drop and browse functionality.

---

# 3. Difference Between Home and My Policies

## Home

Focus on:
- Attention
- Reminders
- Quick actions
- AI insights
- Upcoming renewals
- Processing status

Home = **"What should I know/do?"**

## My Policies

Focus on:
- All policies
- Filtering
- Searching
- Policy metadata
- Uploading
- Opening policy details

My Policies = **"What policies do I have?"**

Do NOT repeat the same policy cards on both pages.

---

# 4. Floating PolicyPilot Assistant

The assistant should remain available across the application.

Collapsed:

**Ask about your policies**

Expanded:
- Chat
- Voice
- Suggested questions
- Text input
- Microphone button

Example questions:

- "What's covered in my policy?"
- "How do I make a claim?"
- "Find cashless hospitals"
- "Explain this in simple terms."

The assistant should automatically understand the **currently selected policy** and use it as context.

---

# 5. Core UX Principle

The main user journey is:

**Upload Policy → Understand Policy → Ask Questions → Take Action**

PolicyPilot should hide insurance complexity and present information in simple, reassuring language.

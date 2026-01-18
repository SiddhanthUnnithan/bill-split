# Bill Split - Implementation Plan

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Next.js App   │────▶│  FastAPI Backend │────▶│    Supabase     │
│   (Vercel)      │     │   (Vercel)       │     │  (DB + Storage) │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                    ┌──────────┼──────────┐
                    ▼          ▼          ▼
              ┌─────────┐ ┌─────────┐ ┌─────────┐
              │ OpenAI  │ │ Twilio  │ │Supabase │
              │ Vision  │ │   SMS   │ │   OTP   │
              └─────────┘ └─────────┘ └─────────┘
```

### Stack

- **Frontend**: Next.js (deployed to Vercel)
- **Backend**: FastAPI (deployed to Vercel)
- **Database & Storage**: Supabase (PostgreSQL + file storage)
- **Bill Parsing**: OpenAI Vision API
- **SMS**: Twilio
- **Phone Verification**: Supabase OTP

### Repository Structure

```
bill-split/
├── frontend/          # Next.js application
├── backend/           # FastAPI application
├── .env.example       # Environment variable template
├── CLAUDE.md          # AI assistant guidance
└── PLAN.md            # This file
```

---

## Data Models

### Bill
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| creator_token | string | Unique token for creator access |
| share_token | string | Unique token for participant access |
| status | enum | 'editing', 'active', 'complete' |
| image_url | string | Supabase storage path |
| subtotal | decimal | Parsed bill subtotal |
| tax | decimal | Parsed tax amount |
| tip | decimal | Parsed tip amount |
| venmo_handle | string | Optional payment handle |
| zelle_handle | string | Optional payment handle |
| cashapp_handle | string | Optional payment handle |
| created_at | timestamp | |
| updated_at | timestamp | |

### BillItem
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| bill_id | uuid | Foreign key to Bill |
| name | string | Item name |
| price | decimal | Item price |
| created_at | timestamp | |

### Participant
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| bill_id | uuid | Foreign key to Bill |
| name | string | Participant name |
| phone | string | Optional phone number |
| phone_verified | boolean | Whether phone was verified via OTP |
| is_creator | boolean | Whether this is the bill creator |
| status | enum | 'selecting', 'done' |
| created_at | timestamp | |

### ItemClaim
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| item_id | uuid | Foreign key to BillItem |
| participant_id | uuid | Foreign key to Participant |
| created_at | timestamp | |

---

## URL Structure

| Route | Purpose |
|-------|---------|
| `/` | Home page, bill upload |
| `/b/[creatorToken]` | Creator dashboard (edit, claim, manage, mark complete) |
| `/s/[shareToken]` | Participant view (claim items, submit name/phone) |
| `/s/[shareToken]/final` | Final results after bill completion |

---

## Calculation Logic

### Running Total (During Active Phase)

For each participant while bill is active:
```
participant_subtotal = 0
for each item the participant claimed:
    participant_subtotal += item_price / number_of_claimants_for_that_item

Display: "$X.XX (provisional - may change as others claim shared items)"
```

### Final Total (After Completion)

Once bill creator marks bill as complete:
```
participant_final = participant_subtotal + (tax + tip) / total_num_participants
```

Tax and tip are split equally among all participants.

---

## Build Steps

Each step will be reviewed before proceeding to the next.

### Step 1: Project Scaffolding
- Initialize Next.js app in `/frontend`
- Initialize FastAPI app in `/backend`
- Set up Supabase client in both
- Configure Vercel deployment
- Create database tables in Supabase

### Step 2: Bill Upload
- Home page with image upload UI
- Backend endpoint to receive image
- Store image in Supabase storage
- Generate creator_token and share_token
- Create bill record with status='editing'
- Redirect creator to `/b/[creatorToken]`

### Step 3: Bill Parsing
- Backend endpoint that calls OpenAI Vision API
- Extract: item names, item prices, subtotal, tax, tip
- Return structured JSON to frontend
- Store parsed items in BillItem table

### Step 4: Creator Review/Edit
- UI showing parsed items in editable form
- Edit item names and prices
- Remove items
- Confirm button to finalize parsing
- Update bill status to 'active' on confirm

### Step 5: Creator Item Claiming
- After confirming parsed items, creator can claim their own items
- Create Participant record with is_creator=true
- Reuse claiming UI (same as participants)

### Step 6: Share Link + Participant View
- Generate shareable link using share_token
- Participant view shows read-only bill items
- Display which items have been claimed and by how many people

### Step 7: Participant Claiming
- Participants can toggle claiming items
- Show provisional running total
- Indicate that totals may change as others claim shared items

### Step 8: Participant Submission
- "Done" button when finished claiming
- Prompt for name (required)
- Prompt for phone (optional)
- If phone provided, verify via Supabase OTP
- Send confirmation SMS via Twilio
- Update participant status to 'done'

### Step 9: Creator Live Dashboard
- Show all participants and their status
- Show which items each participant claimed
- Show current totals per participant
- "Mark Complete" button

### Step 10: Completion Flow
- Prompt creator for Venmo/Zelle/CashApp handles
- Calculate final totals (including equal tax/tip split)
- Update bill status to 'complete'
- Send final SMS to verified participants with amounts and payment details
- Generate final results page at `/s/[shareToken]/final`

---

## Design Decisions

1. **No user accounts**: Entire flow is link-based. Creator gets a unique management link, participants get a unique share link.

2. **Image-only upload**: Only image files accepted for bill upload (no PDFs, no manual entry for now).

3. **Line items as units**: Each line item is treated as one unit regardless of quantity displayed. Unit-level claiming deferred for future.

4. **Equal tax/tip split**: Tax and tip divided equally among all participants, not proportionally.

5. **Simple data refresh**: "Live" views show database snapshot on page load. Polling/real-time deferred for future.

6. **Bills persist forever**: No automatic cleanup or expiration.

7. **Payment tracking out of scope**: No marking participants as "paid" within the app.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Product Desire
We want users to be able to split bills with their friends in a more fun way. We assume that right now when a group of people go out, one person pays for the bill and then request the rest of the people to pay what they owe based on what they ate. In a setting where everyone splits equally, this is an easy problem to solve. In a setting where each person gets their own food and drinks and expects to only pay what they consumed, then reconciling the bill involves more work for the person paying. The most complex case is when there are shareables (some % of people eat this) and individual meals and drinks.

## Product Experience
We want an experience for the person paying the bill to upload their bill to the product, specifying (implicitly) that they're the one that paid. We then want the product to automatically parse the contents of the bill and outline each of the items in the bill including the tax and tip paid. Once the individual items have been parsed, the user that uploads the bill can make any necessary changes e.g., removing items or changing the dollar amount for the item. Given acceptance from the user that the bill has been parsed correctly, the product automatically generates a shareable link for the user to share with others that "participated" in the bill.

When an individual clicks on the link shared, they're taken to the bill page where they can see each of the items, their associated quantities, and the price for the items. The bill itself is read-only, but the individual (we'll call them participant), can specify which items belong to them. The expectation is that the participant will be truthful in selecting their items. As the participant selects items, the product provides a running total for the participant, exclusive of the tax and the tip. The reason we're not including the tax and the tip is because we don't know the total number of participants ahead of time. Technically this can be provided by the user that created the bill, but for now we'll rely on the bill creator to let us know when all of the participants have finished contributing to the bill.

Once the participant has finished adding themselves to items, they can state that they're "done". At this point the product will prompt them for their name and optionally their phone number. The product will let the participant know that if they provide their phone number, the product will provide them with text updates as the bill creator wraps up. If the participant inputs their phone number, the product will ask them for a verification code to ensure that the number is real. The participant should get an immediate text confirmation thanking them for specifying their contribution to the bill and then a link for them to view a live, read-only version of the bill as it's being updated by the rest of the group.

Note that the experience of "adding items" should also be made available to the bill creator right after they finish verifying that the parsed information is correct. The primary difference is that when the creator finishes adding their bill, they see a live, editable version of the bill wherein they can continue removing items or changing prices, but most importantly they can specify that the bill is "complete" (i.e., all participants have inputted their desired amounts). After specifying "completion", the creator is prompted to input their Venmo, Zelle, and/or CashApp handles for the participants to send them money. The product will then automatically do two things, the first being generating a new link for the creator to share with their friends so that they can view final totals and creator-payment-account details, the second being texting the participants that provided their numbers with their final totals and details of how to pay the creator.

## Form Factor
Web application, not mobile, with a responsive design as the expectation is that users will be sharing links via their phones and the product will be accessed from the phone.

## Build Approach
I want a plan first. I want to know how you're planning to approach building the overall experience, including data storage (and thus data models), authentication, individual screens, and 3rd-party integrations (e.g., Supabase for OTP). I want you to ask questions of me to refine the product experience before building. Once all of the questions have been answered, then proceed step by step. That is, start with the experience for the bill creator in uploading the bill (distinct step). We'll review the product experience together and refine what's needed. Once I give you explicit confirmation to move to the next step, then go ahead and build the next step (which in this case would be the parsing of the bill). This way we don't risk over-building ahead of time and can finely control what the step-by-step product experience is.

## Stack Preference
I'd prefer a Python backend and Javascript frontend. Supabase for authentication. OpenAI for bill parsing. Twilio for sending text messages.

---

## Technical Architecture

See `PLAN.md` for detailed implementation plan.

### Stack
- **Frontend**: Next.js (in `/frontend`)
- **Backend**: FastAPI (in `/backend`)
- **Database & Storage**: Supabase (PostgreSQL + file storage)
- **Deployment**: Vercel

### Key Design Decisions
- No user accounts - entire flow is link-based (creator token, share token)
- Image-only bill upload (no PDFs or manual entry)
- Line items treated as single units (no per-unit claiming)
- Tax and tip split equally among all participants
- Simple page-load data refresh (no real-time/polling)
- Bills persist forever, no expiration

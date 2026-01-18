import secrets
import uuid
import json
import re
import string
from typing import Optional, List
from fastapi import APIRouter, File, UploadFile, HTTPException
from pydantic import BaseModel
from openai import OpenAI
from app.supabase_client import get_supabase
from app.config import get_settings


def slugify(text: str) -> str:
    """Convert text to URL-friendly slug."""
    text = text.lower().strip()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[\s_-]+', '-', text)
    text = re.sub(r'^-+|-+$', '', text)
    return text[:20]  # Limit length


def generate_short_id(length: int = 4) -> str:
    """Generate a short alphanumeric ID."""
    chars = string.ascii_lowercase + string.digits
    return ''.join(secrets.choice(chars) for _ in range(length))

router = APIRouter(prefix="/bills", tags=["bills"])


class BillCreateResponse(BaseModel):
    id: str
    creator_token: str
    share_token: str


class BillResponse(BaseModel):
    id: str
    creator_token: str
    share_token: str
    status: str
    image_url: Optional[str]
    subtotal: Optional[float]
    tax: Optional[float]
    tip: Optional[float]


class BillItem(BaseModel):
    id: str
    bill_id: str
    name: str
    price: float


class ParsedBillResponse(BaseModel):
    items: List[BillItem]
    subtotal: Optional[float]
    tax: Optional[float]
    tip: Optional[float]
    share_token: Optional[str] = None


class BillWithItemsResponse(BaseModel):
    id: str
    creator_token: str
    share_token: str
    status: str
    image_url: Optional[str]
    subtotal: Optional[float]
    tax: Optional[float]
    tip: Optional[float]
    items: List[BillItem]


def generate_token(length: int = 32) -> str:
    return secrets.token_urlsafe(length)


@router.post("/upload", response_model=BillCreateResponse)
async def upload_bill(file: UploadFile = File(...)):
    # Validate file type
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail="Only image files are accepted"
        )

    supabase = get_supabase()

    # Generate unique tokens
    creator_token = generate_token()
    share_token = generate_token()
    bill_id = str(uuid.uuid4())

    # Read file content
    file_content = await file.read()

    # Determine file extension from content type
    ext_map = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/heic": "heic",
        "image/heif": "heif",
    }
    ext = ext_map.get(file.content_type, "jpg")

    # Upload to Supabase Storage
    storage_path = f"{bill_id}/bill.{ext}"

    storage_response = supabase.storage.from_("bill-images").upload(
        storage_path,
        file_content,
        {"content-type": file.content_type}
    )

    # Get public URL
    public_url = supabase.storage.from_("bill-images").get_public_url(storage_path)

    # Create bill record
    bill_data = {
        "id": bill_id,
        "creator_token": creator_token,
        "share_token": share_token,
        "status": "editing",
        "image_url": public_url,
    }

    result = supabase.table("bills").insert(bill_data).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create bill")

    return BillCreateResponse(
        id=bill_id,
        creator_token=creator_token,
        share_token=share_token,
    )


@router.get("/creator/{creator_token}", response_model=BillResponse)
async def get_bill_by_creator_token(creator_token: str):
    supabase = get_supabase()

    result = supabase.table("bills").select("*").eq("creator_token", creator_token).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Bill not found")

    bill = result.data[0]

    return BillResponse(
        id=bill["id"],
        creator_token=bill["creator_token"],
        share_token=bill["share_token"],
        status=bill["status"],
        image_url=bill["image_url"],
        subtotal=bill["subtotal"],
        tax=bill["tax"],
        tip=bill["tip"],
    )


@router.get("/creator/{creator_token}/full", response_model=BillWithItemsResponse)
async def get_bill_with_items(creator_token: str):
    supabase = get_supabase()

    # Fetch bill
    result = supabase.table("bills").select("*").eq("creator_token", creator_token).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Bill not found")

    bill = result.data[0]

    # Fetch items
    items_result = supabase.table("bill_items").select("*").eq("bill_id", bill["id"]).execute()
    items = [BillItem(**item) for item in (items_result.data or [])]

    return BillWithItemsResponse(
        id=bill["id"],
        creator_token=bill["creator_token"],
        share_token=bill["share_token"],
        status=bill["status"],
        image_url=bill["image_url"],
        subtotal=bill["subtotal"],
        tax=bill["tax"],
        tip=bill["tip"],
        items=items,
    )


@router.post("/creator/{creator_token}/parse", response_model=ParsedBillResponse)
async def parse_bill(creator_token: str):
    settings = get_settings()
    supabase = get_supabase()

    # Fetch bill by creator token
    result = supabase.table("bills").select("*").eq("creator_token", creator_token).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Bill not found")

    bill = result.data[0]

    if not bill.get("image_url"):
        raise HTTPException(status_code=400, detail="Bill has no image to parse")

    # Call OpenAI Vision API
    client = OpenAI(api_key=settings.openai_api_key)

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": """Analyze this receipt/bill image and extract all line items, subtotal, tax, tip, and venue name.

Return a JSON object with this exact structure:
{
    "venue": "Restaurant Name",
    "items": [
        {"name": "Item name", "price": 12.99},
        {"name": "Another item", "price": 8.50}
    ],
    "subtotal": 21.49,
    "tax": 1.87,
    "tip": null
}

Rules:
- Extract the restaurant/venue name if visible, otherwise use a short descriptor like "dinner" or "lunch"
- Extract each line item with its name and price
- Prices should be numbers (not strings), without currency symbols
- If subtotal, tax, or tip are not visible, use null
- Do not include subtotal, tax, or tip as line items
- Return ONLY the JSON object, no other text"""
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": bill["image_url"]}
                    }
                ]
            }
        ],
        max_tokens=1000
    )

    # Parse OpenAI response
    response_text = response.choices[0].message.content.strip()

    # Handle markdown code blocks if present
    if response_text.startswith("```"):
        lines = response_text.split("\n")
        response_text = "\n".join(lines[1:-1])

    try:
        parsed = json.loads(response_text)
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Failed to parse bill - invalid response from AI")

    # Store items in database
    bill_items = []
    for item in parsed.get("items", []):
        item_id = str(uuid.uuid4())
        item_data = {
            "id": item_id,
            "bill_id": bill["id"],
            "name": item["name"],
            "price": float(item["price"])
        }
        supabase.table("bill_items").insert(item_data).execute()
        bill_items.append(BillItem(**item_data))

    # Generate readable share token from venue name
    venue = parsed.get("venue", "bill")
    slug = slugify(venue) or "bill"
    short_id = generate_short_id(4)
    new_share_token = f"{slug}-{short_id}"

    # Update bill with subtotal, tax, tip, and new share token
    update_data = {
        "subtotal": parsed.get("subtotal"),
        "tax": parsed.get("tax"),
        "tip": parsed.get("tip"),
        "share_token": new_share_token
    }
    supabase.table("bills").update(update_data).eq("id", bill["id"]).execute()

    return ParsedBillResponse(
        items=bill_items,
        subtotal=parsed.get("subtotal"),
        tax=parsed.get("tax"),
        tip=parsed.get("tip"),
        share_token=new_share_token
    )


class ItemUpdateRequest(BaseModel):
    name: str
    price: float


class BillTotalsUpdateRequest(BaseModel):
    subtotal: Optional[float]
    tax: Optional[float]
    tip: Optional[float]


@router.patch("/creator/{creator_token}/items/{item_id}", response_model=BillItem)
async def update_item(creator_token: str, item_id: str, request: ItemUpdateRequest):
    supabase = get_supabase()

    # Verify bill ownership
    bill_result = supabase.table("bills").select("id").eq("creator_token", creator_token).execute()
    if not bill_result.data:
        raise HTTPException(status_code=404, detail="Bill not found")

    bill_id = bill_result.data[0]["id"]

    # Verify item belongs to this bill
    item_result = supabase.table("bill_items").select("*").eq("id", item_id).eq("bill_id", bill_id).execute()
    if not item_result.data:
        raise HTTPException(status_code=404, detail="Item not found")

    # Update item
    update_data = {"name": request.name, "price": request.price}
    supabase.table("bill_items").update(update_data).eq("id", item_id).execute()

    return BillItem(
        id=item_id,
        bill_id=bill_id,
        name=request.name,
        price=request.price
    )


@router.delete("/creator/{creator_token}/items/{item_id}")
async def delete_item(creator_token: str, item_id: str):
    supabase = get_supabase()

    # Verify bill ownership
    bill_result = supabase.table("bills").select("id").eq("creator_token", creator_token).execute()
    if not bill_result.data:
        raise HTTPException(status_code=404, detail="Bill not found")

    bill_id = bill_result.data[0]["id"]

    # Verify item belongs to this bill
    item_result = supabase.table("bill_items").select("*").eq("id", item_id).eq("bill_id", bill_id).execute()
    if not item_result.data:
        raise HTTPException(status_code=404, detail="Item not found")

    # Delete item
    supabase.table("bill_items").delete().eq("id", item_id).execute()

    return {"success": True}


@router.patch("/creator/{creator_token}/totals", response_model=BillResponse)
async def update_bill_totals(creator_token: str, request: BillTotalsUpdateRequest):
    supabase = get_supabase()

    # Fetch bill
    result = supabase.table("bills").select("*").eq("creator_token", creator_token).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Bill not found")

    bill = result.data[0]

    # Update totals
    update_data = {
        "subtotal": request.subtotal,
        "tax": request.tax,
        "tip": request.tip
    }
    supabase.table("bills").update(update_data).eq("id", bill["id"]).execute()

    return BillResponse(
        id=bill["id"],
        creator_token=bill["creator_token"],
        share_token=bill["share_token"],
        status=bill["status"],
        image_url=bill["image_url"],
        subtotal=request.subtotal,
        tax=request.tax,
        tip=request.tip,
    )


class ConfirmBillResponse(BaseModel):
    bill: BillResponse
    participant_token: str


@router.post("/creator/{creator_token}/confirm", response_model=ConfirmBillResponse)
async def confirm_bill(creator_token: str):
    supabase = get_supabase()

    # Fetch bill
    result = supabase.table("bills").select("*").eq("creator_token", creator_token).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Bill not found")

    bill = result.data[0]

    # Update status to active
    supabase.table("bills").update({"status": "active"}).eq("id", bill["id"]).execute()

    # Create a participant record for the creator
    participant_id = str(uuid.uuid4())
    participant_token = generate_short_id(8)

    participant_data = {
        "id": participant_id,
        "bill_id": bill["id"],
        "status": "selecting",
        "is_creator": True,
        "participant_token": participant_token
    }

    supabase.table("participants").insert(participant_data).execute()

    return ConfirmBillResponse(
        bill=BillResponse(
            id=bill["id"],
            creator_token=bill["creator_token"],
            share_token=bill["share_token"],
            status="active",
            image_url=bill["image_url"],
            subtotal=bill["subtotal"],
            tax=bill["tax"],
            tip=bill["tip"],
        ),
        participant_token=participant_token
    )


# ============ Participant Endpoints ============

class ItemWithClaims(BaseModel):
    id: str
    name: str
    price: float
    claimed_by: List[str]  # List of participant names who claimed this item


class ParticipantBillResponse(BaseModel):
    id: str
    share_token: str
    status: str
    subtotal: Optional[float]
    tax: Optional[float]
    tip: Optional[float]
    items: List[ItemWithClaims]
    participants: List[dict]


class ParticipantCreateResponse(BaseModel):
    participant_id: str
    participant_token: str


class ClaimRequest(BaseModel):
    item_ids: List[str]


class SubmitParticipantRequest(BaseModel):
    name: str


@router.get("/share/{share_token}", response_model=ParticipantBillResponse)
async def get_bill_by_share_token(share_token: str):
    supabase = get_supabase()

    # Fetch bill
    result = supabase.table("bills").select("*").eq("share_token", share_token).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Bill not found")

    bill = result.data[0]

    if bill["status"] == "editing":
        raise HTTPException(status_code=403, detail="Bill is not ready for sharing yet")

    # Fetch items
    items_result = supabase.table("bill_items").select("*").eq("bill_id", bill["id"]).execute()
    items = items_result.data or []

    # Fetch participants
    participants_result = supabase.table("participants").select("*").eq("bill_id", bill["id"]).execute()
    participants = participants_result.data or []

    # Fetch claims
    claims_result = supabase.table("item_claims").select("*").execute()
    claims = claims_result.data or []

    # Build participant lookup
    participant_map = {p["id"]: p for p in participants}

    # Build items with claims
    items_with_claims = []
    for item in items:
        item_claims = [c for c in claims if c["item_id"] == item["id"]]
        claimed_by = [
            participant_map[c["participant_id"]]["name"]
            for c in item_claims
            if c["participant_id"] in participant_map and participant_map[c["participant_id"]].get("name")
        ]
        items_with_claims.append(ItemWithClaims(
            id=item["id"],
            name=item["name"],
            price=item["price"],
            claimed_by=claimed_by
        ))

    return ParticipantBillResponse(
        id=bill["id"],
        share_token=bill["share_token"],
        status=bill["status"],
        subtotal=bill["subtotal"],
        tax=bill["tax"],
        tip=bill["tip"],
        items=items_with_claims,
        participants=[{"id": p["id"], "name": p.get("name"), "status": p["status"]} for p in participants]
    )


@router.post("/share/{share_token}/join", response_model=ParticipantCreateResponse)
async def join_bill(share_token: str):
    supabase = get_supabase()

    # Fetch bill
    result = supabase.table("bills").select("*").eq("share_token", share_token).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Bill not found")

    bill = result.data[0]

    if bill["status"] != "active":
        raise HTTPException(status_code=403, detail="Bill is not accepting participants")

    # Create participant
    participant_id = str(uuid.uuid4())
    participant_token = generate_short_id(8)

    participant_data = {
        "id": participant_id,
        "bill_id": bill["id"],
        "status": "selecting",
        "is_creator": False,
        "participant_token": participant_token
    }

    supabase.table("participants").insert(participant_data).execute()

    return ParticipantCreateResponse(
        participant_id=participant_id,
        participant_token=participant_token
    )


@router.post("/share/{share_token}/participant/{participant_token}/claims")
async def update_claims(share_token: str, participant_token: str, request: ClaimRequest):
    supabase = get_supabase()

    # Fetch bill
    bill_result = supabase.table("bills").select("*").eq("share_token", share_token).execute()
    if not bill_result.data:
        raise HTTPException(status_code=404, detail="Bill not found")

    bill = bill_result.data[0]

    # Fetch participant
    participant_result = supabase.table("participants").select("*").eq("participant_token", participant_token).eq("bill_id", bill["id"]).execute()
    if not participant_result.data:
        raise HTTPException(status_code=404, detail="Participant not found")

    participant = participant_result.data[0]

    if participant["status"] == "done":
        raise HTTPException(status_code=403, detail="Participant has already submitted")

    # Clear existing claims for this participant
    supabase.table("item_claims").delete().eq("participant_id", participant["id"]).execute()

    # Add new claims
    for item_id in request.item_ids:
        claim_data = {
            "id": str(uuid.uuid4()),
            "item_id": item_id,
            "participant_id": participant["id"]
        }
        supabase.table("item_claims").insert(claim_data).execute()

    return {"success": True, "claimed_count": len(request.item_ids)}


@router.get("/share/{share_token}/participant/{participant_token}/claims")
async def get_my_claims(share_token: str, participant_token: str):
    supabase = get_supabase()

    # Fetch bill
    bill_result = supabase.table("bills").select("*").eq("share_token", share_token).execute()
    if not bill_result.data:
        raise HTTPException(status_code=404, detail="Bill not found")

    bill = bill_result.data[0]

    # Fetch participant
    participant_result = supabase.table("participants").select("*").eq("participant_token", participant_token).eq("bill_id", bill["id"]).execute()
    if not participant_result.data:
        raise HTTPException(status_code=404, detail="Participant not found")

    participant = participant_result.data[0]

    # Fetch claims
    claims_result = supabase.table("item_claims").select("item_id").eq("participant_id", participant["id"]).execute()
    claimed_item_ids = [c["item_id"] for c in (claims_result.data or [])]

    return {
        "participant_id": participant["id"],
        "name": participant.get("name"),
        "status": participant["status"],
        "claimed_item_ids": claimed_item_ids
    }


@router.post("/share/{share_token}/participant/{participant_token}/submit")
async def submit_participant(share_token: str, participant_token: str, request: SubmitParticipantRequest):
    supabase = get_supabase()

    # Fetch bill
    bill_result = supabase.table("bills").select("*").eq("share_token", share_token).execute()
    if not bill_result.data:
        raise HTTPException(status_code=404, detail="Bill not found")

    bill = bill_result.data[0]

    # Fetch participant
    participant_result = supabase.table("participants").select("*").eq("participant_token", participant_token).eq("bill_id", bill["id"]).execute()
    if not participant_result.data:
        raise HTTPException(status_code=404, detail="Participant not found")

    participant = participant_result.data[0]

    # Update participant with name and status
    supabase.table("participants").update({
        "name": request.name,
        "status": "done"
    }).eq("id", participant["id"]).execute()

    return {"success": True, "name": request.name}


# ============ Creator Dashboard & Completion ============

class ParticipantSummary(BaseModel):
    id: str
    name: Optional[str]
    status: str
    items_total: float
    claimed_items: List[str]


class CreatorDashboardResponse(BaseModel):
    bill: BillResponse
    items: List[BillItem]
    participants: List[ParticipantSummary]


class CompleteBillRequest(BaseModel):
    venmo_handle: Optional[str] = None
    zelle_handle: Optional[str] = None
    cashapp_handle: Optional[str] = None


class FinalSplit(BaseModel):
    name: str
    items_total: float
    tax_share: float
    tip_share: float
    final_total: float


class FinalResultsResponse(BaseModel):
    status: str
    subtotal: Optional[float]
    tax: Optional[float]
    tip: Optional[float]
    venmo_handle: Optional[str]
    zelle_handle: Optional[str]
    cashapp_handle: Optional[str]
    splits: List[FinalSplit]


@router.get("/creator/{creator_token}/dashboard", response_model=CreatorDashboardResponse)
async def get_creator_dashboard(creator_token: str):
    supabase = get_supabase()

    # Fetch bill
    bill_result = supabase.table("bills").select("*").eq("creator_token", creator_token).execute()
    if not bill_result.data:
        raise HTTPException(status_code=404, detail="Bill not found")

    bill = bill_result.data[0]

    # Fetch items
    items_result = supabase.table("bill_items").select("*").eq("bill_id", bill["id"]).execute()
    items = items_result.data or []

    # Fetch participants
    participants_result = supabase.table("participants").select("*").eq("bill_id", bill["id"]).execute()
    participants = participants_result.data or []

    # Fetch all claims
    claims_result = supabase.table("item_claims").select("*").execute()
    claims = claims_result.data or []

    # Build item lookup
    item_map = {item["id"]: item for item in items}

    # Calculate each participant's total
    participant_summaries = []
    for p in participants:
        p_claims = [c for c in claims if c["participant_id"] == p["id"]]
        claimed_item_ids = [c["item_id"] for c in p_claims]

        # Calculate total (split shared items)
        items_total = 0.0
        claimed_item_names = []
        for item_id in claimed_item_ids:
            if item_id in item_map:
                item = item_map[item_id]
                # Count how many people claimed this item
                item_claim_count = len([c for c in claims if c["item_id"] == item_id])
                items_total += item["price"] / max(1, item_claim_count)
                claimed_item_names.append(item["name"])

        participant_summaries.append(ParticipantSummary(
            id=p["id"],
            name=p.get("name"),
            status=p["status"],
            items_total=round(items_total, 2),
            claimed_items=claimed_item_names
        ))

    return CreatorDashboardResponse(
        bill=BillResponse(
            id=bill["id"],
            creator_token=bill["creator_token"],
            share_token=bill["share_token"],
            status=bill["status"],
            image_url=bill["image_url"],
            subtotal=bill["subtotal"],
            tax=bill["tax"],
            tip=bill["tip"],
        ),
        items=[BillItem(**item) for item in items],
        participants=participant_summaries
    )


@router.post("/creator/{creator_token}/complete", response_model=BillResponse)
async def complete_bill(creator_token: str, request: CompleteBillRequest):
    supabase = get_supabase()

    # Fetch bill
    result = supabase.table("bills").select("*").eq("creator_token", creator_token).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Bill not found")

    bill = result.data[0]

    # Update bill with payment handles and status
    update_data = {
        "status": "complete",
        "venmo_handle": request.venmo_handle,
        "zelle_handle": request.zelle_handle,
        "cashapp_handle": request.cashapp_handle
    }
    supabase.table("bills").update(update_data).eq("id", bill["id"]).execute()

    return BillResponse(
        id=bill["id"],
        creator_token=bill["creator_token"],
        share_token=bill["share_token"],
        status="complete",
        image_url=bill["image_url"],
        subtotal=bill["subtotal"],
        tax=bill["tax"],
        tip=bill["tip"],
    )


@router.get("/share/{share_token}/final", response_model=FinalResultsResponse)
async def get_final_results(share_token: str):
    supabase = get_supabase()

    # Fetch bill
    bill_result = supabase.table("bills").select("*").eq("share_token", share_token).execute()
    if not bill_result.data:
        raise HTTPException(status_code=404, detail="Bill not found")

    bill = bill_result.data[0]

    if bill["status"] != "complete":
        raise HTTPException(status_code=403, detail="Bill is not complete yet")

    # Fetch items
    items_result = supabase.table("bill_items").select("*").eq("bill_id", bill["id"]).execute()
    items = items_result.data or []
    item_map = {item["id"]: item for item in items}

    # Fetch participants (only those who submitted)
    participants_result = supabase.table("participants").select("*").eq("bill_id", bill["id"]).eq("status", "done").execute()
    participants = participants_result.data or []

    # Fetch all claims
    claims_result = supabase.table("item_claims").select("*").execute()
    claims = claims_result.data or []

    num_participants = len(participants)
    tax = bill.get("tax") or 0
    tip = bill.get("tip") or 0
    tax_per_person = tax / max(1, num_participants)
    tip_per_person = tip / max(1, num_participants)

    # Calculate each participant's final total
    splits = []
    for p in participants:
        if not p.get("name"):
            continue

        p_claims = [c for c in claims if c["participant_id"] == p["id"]]
        claimed_item_ids = [c["item_id"] for c in p_claims]

        # Calculate items total (split shared items)
        items_total = 0.0
        for item_id in claimed_item_ids:
            if item_id in item_map:
                item = item_map[item_id]
                item_claim_count = len([c for c in claims if c["item_id"] == item_id])
                items_total += item["price"] / max(1, item_claim_count)

        final_total = items_total + tax_per_person + tip_per_person

        splits.append(FinalSplit(
            name=p["name"],
            items_total=round(items_total, 2),
            tax_share=round(tax_per_person, 2),
            tip_share=round(tip_per_person, 2),
            final_total=round(final_total, 2)
        ))

    # Sort by name
    splits.sort(key=lambda x: x.name.lower())

    return FinalResultsResponse(
        status=bill["status"],
        subtotal=bill["subtotal"],
        tax=bill["tax"],
        tip=bill["tip"],
        venmo_handle=bill.get("venmo_handle"),
        zelle_handle=bill.get("zelle_handle"),
        cashapp_handle=bill.get("cashapp_handle"),
        splits=splits
    )

# Setup Instructions

## 1. Supabase Setup

### Create Project
1. Go to [supabase.com](https://supabase.com) and sign in
2. Click "New Project"
3. Fill in project details and wait for it to provision

### Run Database Schema
1. In your Supabase dashboard, go to **SQL Editor** (left sidebar)
2. Click "New query"
3. Copy the entire contents of `supabase/schema.sql` and paste it
4. Click "Run" (or Cmd/Ctrl + Enter)
5. You should see "Success. No rows returned" - this means the tables were created

### Create Storage Bucket
1. Go to **Storage** (left sidebar)
2. Click "New bucket"
3. Name it `bill-images`
4. Toggle ON "Public bucket" (so images can be accessed via URL)
5. Click "Create bucket"

### Get API Keys
1. Go to **Settings** > **API** (left sidebar)
2. Copy these values for your `.env` files:
   - **Project URL** → `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (backend only, keep secret!)

---

## 2. Environment Files

### Backend
```bash
cp backend/.env.example backend/.env
```
Fill in the values in `backend/.env`

### Frontend
```bash
cp frontend/.env.local.example frontend/.env.local
```
Fill in the values in `frontend/.env.local`

---

## 3. Local Development

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```
Backend runs at http://localhost:8000

### Frontend
```bash
cd frontend
npm install  # Already done during setup
npm run dev
```
Frontend runs at http://localhost:3000

---

## 4. Vercel Deployment

You'll deploy the frontend and backend as **two separate Vercel projects**.

### Deploy Backend
1. Go to [vercel.com](https://vercel.com) and sign in
2. Click "Add New" > "Project"
3. Import your Git repository
4. **Important**: Set the Root Directory to `backend`
5. Vercel will auto-detect Python/FastAPI
6. Add environment variables (Settings > Environment Variables):
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `OPENAI_API_KEY`
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_PHONE_NUMBER`
7. Deploy

### Deploy Frontend
1. Click "Add New" > "Project" again
2. Import the same Git repository
3. **Important**: Set the Root Directory to `frontend`
4. Vercel will auto-detect Next.js
5. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_API_URL` (set to your deployed backend URL, e.g., `https://your-backend.vercel.app`)
6. Deploy

### After Deployment
- Update `NEXT_PUBLIC_API_URL` in frontend Vercel settings to point to your backend URL
- Update CORS origins in `backend/app/main.py` to allow your frontend domain (replace `"*"` with specific origin)

---

## 5. API Keys for Later Steps

These aren't needed for Step 1-2 but you'll need them later:

### OpenAI (for bill parsing)
1. Go to [platform.openai.com](https://platform.openai.com)
2. Create an API key
3. Add to `OPENAI_API_KEY`

### Twilio (for SMS)
1. Go to [twilio.com](https://twilio.com)
2. Create account and get a phone number
3. Find Account SID and Auth Token in Console
4. Add to `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`

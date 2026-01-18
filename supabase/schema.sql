-- Bill Split Database Schema
-- Run this in the Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Bill status enum
CREATE TYPE bill_status AS ENUM ('editing', 'active', 'complete');

-- Participant status enum
CREATE TYPE participant_status AS ENUM ('selecting', 'done');

-- Bills table
CREATE TABLE bills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_token VARCHAR(64) UNIQUE NOT NULL,
    share_token VARCHAR(64) UNIQUE NOT NULL,
    status bill_status NOT NULL DEFAULT 'editing',
    image_url TEXT,
    subtotal DECIMAL(10, 2),
    tax DECIMAL(10, 2),
    tip DECIMAL(10, 2),
    venmo_handle VARCHAR(255),
    zelle_handle VARCHAR(255),
    cashapp_handle VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bill items table
CREATE TABLE bill_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Participants table
CREATE TABLE participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    phone_verified BOOLEAN DEFAULT FALSE,
    is_creator BOOLEAN DEFAULT FALSE,
    status participant_status NOT NULL DEFAULT 'selecting',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Item claims table (junction table for many-to-many relationship)
CREATE TABLE item_claims (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id UUID NOT NULL REFERENCES bill_items(id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(item_id, participant_id)
);

-- Indexes for common queries
CREATE INDEX idx_bills_creator_token ON bills(creator_token);
CREATE INDEX idx_bills_share_token ON bills(share_token);
CREATE INDEX idx_bill_items_bill_id ON bill_items(bill_id);
CREATE INDEX idx_participants_bill_id ON participants(bill_id);
CREATE INDEX idx_item_claims_item_id ON item_claims(item_id);
CREATE INDEX idx_item_claims_participant_id ON item_claims(participant_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at on bills table
CREATE TRIGGER update_bills_updated_at
    BEFORE UPDATE ON bills
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Storage bucket for bill images (run this separately or via Supabase dashboard)
-- Note: Create a bucket named 'bill-images' in Supabase Storage dashboard
-- with public access or configure RLS policies as needed

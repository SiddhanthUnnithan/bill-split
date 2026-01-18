'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  getBillByShareToken,
  joinBill,
  updateClaims,
  getMyClaims,
  submitParticipant,
  ParticipantBill,
} from '@/lib/api';

const STORAGE_KEY_PREFIX = 'mize_participant_';

export default function ParticipantView() {
  const params = useParams();
  const shareToken = params.shareToken as string;

  const [bill, setBill] = useState<ParticipantBill | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [participantToken, setParticipantToken] = useState<string | null>(null);
  const [claimedIds, setClaimedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [name, setName] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [myName, setMyName] = useState<string | null>(null);

  // Load participant token from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}${shareToken}`);
    if (stored) {
      setParticipantToken(stored);
    }
  }, [shareToken]);

  // Fetch bill data
  const fetchBill = useCallback(async () => {
    try {
      const data = await getBillByShareToken(shareToken);
      setBill(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bill');
    } finally {
      setLoading(false);
    }
  }, [shareToken]);

  useEffect(() => {
    fetchBill();
  }, [fetchBill]);

  // Fetch my claims when we have a participant token
  useEffect(() => {
    async function fetchMyClaims() {
      if (!participantToken) return;
      try {
        const data = await getMyClaims(shareToken, participantToken);
        setClaimedIds(new Set(data.claimed_item_ids));
        if (data.status === 'done') {
          setSubmitted(true);
          setMyName(data.name);
        }
      } catch {
        // Token might be invalid, clear it
        localStorage.removeItem(`${STORAGE_KEY_PREFIX}${shareToken}`);
        setParticipantToken(null);
      }
    }
    fetchMyClaims();
  }, [shareToken, participantToken]);

  const handleJoin = async () => {
    try {
      const session = await joinBill(shareToken);
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${shareToken}`, session.participant_token);
      setParticipantToken(session.participant_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join');
    }
  };

  const handleToggleClaim = async (itemId: string) => {
    if (!participantToken || submitted) return;

    const newClaimed = new Set(claimedIds);
    if (newClaimed.has(itemId)) {
      newClaimed.delete(itemId);
    } else {
      newClaimed.add(itemId);
    }
    setClaimedIds(newClaimed);

    // Save to server
    setSaving(true);
    try {
      await updateClaims(shareToken, participantToken, Array.from(newClaimed));
    } catch (err) {
      // Revert on error
      setClaimedIds(claimedIds);
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!participantToken || !name.trim()) return;

    setSubmitting(true);
    try {
      await submitParticipant(shareToken, participantToken, name.trim());
      setSubmitted(true);
      setMyName(name.trim());
      setShowNamePrompt(false);
      // Refresh bill to show updated participant list
      fetchBill();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  // Calculate running total
  const calculateTotal = () => {
    if (!bill) return 0;
    let total = 0;
    for (const item of bill.items) {
      if (claimedIds.has(item.id)) {
        // Split price by number of claimants (including me)
        const claimantCount = item.claimed_by.length + (claimedIds.has(item.id) && !item.claimed_by.includes(myName || '') ? 1 : 0);
        total += item.price / Math.max(1, claimantCount);
      }
    }
    return total;
  };

  if (loading) {
    return (
      <main
        className="min-h-[100dvh] flex items-center justify-center"
        style={{ background: 'var(--background)' }}
      >
        <div
          className="w-10 h-10 rounded-full border-3 animate-spin"
          style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
        />
      </main>
    );
  }

  if (error && !bill) {
    return (
      <main
        className="min-h-[100dvh] flex items-center justify-center p-6"
        style={{ background: 'var(--background)' }}
      >
        <div className="text-center">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ background: '#FEF2F2' }}
          >
            <span className="text-2xl">😕</span>
          </div>
          <h1 className="text-xl font-semibold mb-2" style={{ color: 'var(--foreground)' }}>
            Couldn&apos;t find that bill
          </h1>
          <p style={{ color: 'var(--muted)' }}>{error}</p>
        </div>
      </main>
    );
  }

  if (!bill) return null;

  const runningTotal = calculateTotal();
  const hasJoined = !!participantToken;

  return (
    <main className="min-h-[100dvh] pb-32" style={{ background: 'var(--background)' }}>
      <div className="px-6 pt-4 max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Link
            href="/"
            className="text-sm font-semibold"
            style={{ color: 'var(--accent)' }}
          >
            mize
          </Link>
          {submitted && myName && (
            <span
              className="text-xs px-2.5 py-1 rounded-full font-medium"
              style={{ background: 'var(--success-light)', color: 'var(--success)' }}
            >
              Submitted as {myName}
            </span>
          )}
        </div>

        {/* Welcome message for new participants */}
        {!hasJoined && (
          <div
            className="rounded-2xl p-5 mb-6 text-center"
            style={{
              background: 'var(--card)',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)'
            }}
          >
            <h1 className="text-xl font-semibold mb-2" style={{ color: 'var(--foreground)' }}>
              You&apos;ve been invited to split a bill
            </h1>
            <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
              Tap the items you had, and we&apos;ll calculate your share
            </p>
            <button
              onClick={handleJoin}
              className="w-full py-3 rounded-xl font-semibold text-white"
              style={{ background: 'var(--accent)' }}
            >
              Let&apos;s go!
            </button>
          </div>
        )}

        {error && (
          <div
            className="mb-4 p-3 rounded-xl text-center"
            style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}
          >
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {/* Items list */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold" style={{ color: 'var(--foreground)' }}>
              What did you have?
            </h2>
            <span
              className="text-sm px-3 py-1 rounded-full"
              style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
            >
              {bill.items.length} items
            </span>
          </div>

          {hasJoined && !submitted && (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              Tap items to claim them as yours
            </p>
          )}

          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: 'var(--card)',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)'
            }}
          >
            {bill.items.map((item, index) => {
              const isClaimed = claimedIds.has(item.id);
              const otherClaimants = item.claimed_by.filter(n => n !== myName);

              return (
                <div
                  key={item.id}
                  onClick={() => hasJoined && !submitted && handleToggleClaim(item.id)}
                  className={`px-4 py-3 flex items-center gap-3 ${hasJoined && !submitted ? 'cursor-pointer active:bg-gray-50' : ''}`}
                  style={{
                    borderBottom: index < bill.items.length - 1 ? '1px solid var(--border)' : undefined,
                    background: isClaimed ? 'var(--accent-light)' : undefined
                  }}
                >
                  {/* Checkbox */}
                  {hasJoined && (
                    <div
                      className="w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                      style={{
                        borderColor: isClaimed ? 'var(--accent)' : 'var(--border)',
                        background: isClaimed ? 'var(--accent)' : 'transparent'
                      }}
                    >
                      {isClaimed && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="text-sm" style={{ color: 'var(--foreground)' }}>
                      {item.name}
                    </p>
                    {otherClaimants.length > 0 && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                        Also claimed by {otherClaimants.join(', ')}
                      </p>
                    )}
                  </div>

                  <p className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>
                    ${item.price.toFixed(2)}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Totals */}
          {hasJoined && (
            <div
              className="rounded-2xl p-4 space-y-2"
              style={{
                background: 'var(--card)',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)'
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: 'var(--muted)' }}>Your items</span>
                <span className="font-semibold" style={{ color: 'var(--foreground)' }}>
                  ${runningTotal.toFixed(2)}
                </span>
              </div>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                Tax & tip will be split equally when the bill is finalized
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Fixed bottom button */}
      {hasJoined && !submitted && (
        <div
          className="fixed bottom-0 left-0 right-0 p-4"
          style={{ background: 'linear-gradient(transparent, var(--background) 20%)' }}
        >
          <div className="max-w-lg mx-auto">
            <button
              onClick={() => setShowNamePrompt(true)}
              disabled={claimedIds.size === 0 || saving}
              className="w-full py-4 rounded-xl font-semibold text-white transition-all"
              style={{
                background: claimedIds.size === 0 || saving ? 'var(--muted)' : 'var(--accent)'
              }}
            >
              {saving ? 'Saving...' : `I'm done - ${claimedIds.size} item${claimedIds.size !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}

      {/* Name prompt modal */}
      {showNamePrompt && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-4"
          style={{ background: 'rgba(0, 0, 0, 0.5)' }}
          onClick={() => setShowNamePrompt(false)}
        >
          <div
            className="w-full max-w-lg rounded-t-2xl p-6"
            style={{ background: 'var(--card)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--foreground)' }}>
              What&apos;s your name?
            </h2>
            <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
              So everyone knows who claimed what
            </p>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              className="w-full px-4 py-3 rounded-xl text-base mb-4"
              style={{
                background: 'var(--background)',
                border: '1px solid var(--border)',
                color: 'var(--foreground)'
              }}
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowNamePrompt(false)}
                className="flex-1 py-3 rounded-xl font-medium"
                style={{ background: 'var(--background)', color: 'var(--muted)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!name.trim() || submitting}
                className="flex-1 py-3 rounded-xl font-semibold text-white"
                style={{
                  background: !name.trim() || submitting ? 'var(--muted)' : 'var(--accent)'
                }}
              >
                {submitting ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success state */}
      {submitted && (
        <div
          className="fixed bottom-0 left-0 right-0 p-4"
          style={{ background: 'linear-gradient(transparent, var(--background) 20%)' }}
        >
          <div className="max-w-lg mx-auto">
            <div
              className="rounded-2xl p-4 text-center"
              style={{ background: 'var(--success-light)' }}
            >
              <p className="font-medium" style={{ color: 'var(--success)' }}>
                You&apos;re all set! Your total: ${runningTotal.toFixed(2)}
              </p>
              <p className="text-sm mt-1" style={{ color: 'var(--success)' }}>
                Final amount will include your share of tax & tip
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

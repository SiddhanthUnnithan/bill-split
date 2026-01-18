'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import {
  getCreatorDashboard,
  deleteItem,
  confirmBill,
  completeBill,
  updateClaims,
  submitParticipant,
  getMyClaims,
  CreatorDashboard,
} from '@/lib/api';

const STORAGE_KEY_PREFIX = 'mize_creator_';

export default function CreatorDashboardPage() {
  const params = useParams();
  const creatorToken = params.creatorToken as string;

  const [dashboard, setDashboard] = useState<CreatorDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageExpanded, setImageExpanded] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);

  // Creator claiming state
  const [participantToken, setParticipantToken] = useState<string | null>(null);
  const [claimedIds, setClaimedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [creatorSubmitted, setCreatorSubmitted] = useState(false);
  const [creatorName, setCreatorName] = useState<string | null>(null);
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Complete flow state
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [venmo, setVenmo] = useState('');
  const [zelle, setZelle] = useState('');
  const [cashapp, setCashapp] = useState('');

  // Load participant token from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}${creatorToken}`);
    if (stored) {
      setParticipantToken(stored);
    }
  }, [creatorToken]);

  const fetchDashboard = useCallback(async () => {
    try {
      const data = await getCreatorDashboard(creatorToken);
      setDashboard(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bill');
    } finally {
      setLoading(false);
    }
  }, [creatorToken]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Fetch creator's claims when we have a participant token
  useEffect(() => {
    async function fetchMyClaims() {
      if (!participantToken || !dashboard) return;
      try {
        const data = await getMyClaims(dashboard.bill.share_token, participantToken);
        setClaimedIds(new Set(data.claimed_item_ids));
        if (data.status === 'done') {
          setCreatorSubmitted(true);
          setCreatorName(data.name);
        }
      } catch {
        // Token might be invalid, clear it
        localStorage.removeItem(`${STORAGE_KEY_PREFIX}${creatorToken}`);
        setParticipantToken(null);
      }
    }
    fetchMyClaims();
  }, [participantToken, dashboard, creatorToken]);

  // Poll for updates when bill is active
  useEffect(() => {
    if (!dashboard || dashboard.bill.status !== 'active') return;

    const interval = setInterval(() => {
      fetchDashboard();
    }, 5000);

    return () => clearInterval(interval);
  }, [dashboard, fetchDashboard]);

  const handleDeleteItem = async (itemId: string) => {
    if (!dashboard) return;
    setDeleting(itemId);
    try {
      await deleteItem(creatorToken, itemId);
      const deletedItem = dashboard.items.find(i => i.id === itemId);
      const newSubtotal = dashboard.bill.subtotal && deletedItem
        ? Math.max(0, dashboard.bill.subtotal - deletedItem.price)
        : dashboard.bill.subtotal;
      setDashboard({
        ...dashboard,
        items: dashboard.items.filter(i => i.id !== itemId),
        bill: { ...dashboard.bill, subtotal: newSubtotal }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete item');
    } finally {
      setDeleting(null);
    }
  };

  const handleConfirm = async () => {
    if (!dashboard) return;
    setConfirming(true);
    try {
      const result = await confirmBill(creatorToken);
      // Store the creator's participant token
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${creatorToken}`, result.participant_token);
      setParticipantToken(result.participant_token);
      setDashboard({
        ...dashboard,
        bill: { ...dashboard.bill, status: 'active' }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm bill');
    } finally {
      setConfirming(false);
    }
  };

  const handleToggleClaim = async (itemId: string) => {
    if (!participantToken || !dashboard || creatorSubmitted) return;

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
      await updateClaims(dashboard.bill.share_token, participantToken, Array.from(newClaimed));
    } catch (err) {
      // Revert on error
      setClaimedIds(claimedIds);
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleCreatorSubmit = async () => {
    if (!participantToken || !dashboard || !name.trim()) return;

    setSubmitting(true);
    try {
      await submitParticipant(dashboard.bill.share_token, participantToken, name.trim());
      setCreatorSubmitted(true);
      setCreatorName(name.trim());
      setShowNamePrompt(false);
      fetchDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  const handleComplete = async () => {
    if (!dashboard) return;
    if (!venmo.trim() && !zelle.trim() && !cashapp.trim()) {
      setError('Please enter at least one payment method');
      return;
    }

    setCompleting(true);
    try {
      await completeBill(creatorToken, {
        venmo_handle: venmo.trim() || undefined,
        zelle_handle: zelle.trim() || undefined,
        cashapp_handle: cashapp.trim() || undefined,
      });
      setDashboard({
        ...dashboard,
        bill: { ...dashboard.bill, status: 'complete' }
      });
      setShowCompleteModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete bill');
    } finally {
      setCompleting(false);
    }
  };

  const getShareUrl = () => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/s/${dashboard?.bill.share_token}`;
  };

  const getFinalUrl = () => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/s/${dashboard?.bill.share_token}/final`;
  };

  const handleCopyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Calculate creator's running total
  const calculateTotal = () => {
    if (!dashboard) return 0;
    let total = 0;
    for (const item of dashboard.items) {
      if (claimedIds.has(item.id)) {
        total += item.price;
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

  if (error && !dashboard) {
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
          <p style={{ color: 'var(--muted)' }}>{error || 'Bill not found'}</p>
        </div>
      </main>
    );
  }

  if (!dashboard) return null;

  const { bill, items, participants } = dashboard;
  const isEditing = bill.status === 'editing';
  const isActive = bill.status === 'active';
  const isComplete = bill.status === 'complete';
  const doneParticipants = participants.filter(p => p.status === 'done');
  const runningTotal = calculateTotal();
  const canClaimItems = isActive && participantToken && !creatorSubmitted;

  // Calculate total claimed by all participants
  const totalClaimed = doneParticipants.reduce((sum, p) => sum + p.items_total, 0);
  const subtotal = bill.subtotal || 0;
  const claimDiscrepancy = subtotal - totalClaimed;
  const hasDiscrepancy = Math.abs(claimDiscrepancy) > 0.01; // Allow for small rounding differences

  return (
    <main className="min-h-[100dvh] pb-32" style={{ background: 'var(--background)' }}>
      <div className="px-6 pt-4 max-w-lg mx-auto">
        {/* Header with logo and status badge */}
        <div className="flex items-center justify-between mb-4">
          <Link
            href="/"
            className="text-sm font-semibold"
            style={{ color: 'var(--accent)' }}
          >
            mize
          </Link>
          <span
            className="text-xs px-2.5 py-1 rounded-full font-medium"
            style={{
              background: isEditing ? 'var(--accent-light)' : isActive ? 'var(--success-light)' : '#CCFBF1',
              color: isEditing ? 'var(--accent)' : isActive ? 'var(--success)' : '#0D9488'
            }}
          >
            {isEditing ? 'Editing' : isActive ? (creatorSubmitted ? 'Waiting for friends' : 'Claim your items') : 'Complete'}
          </span>
        </div>

        {/* Bill Image Thumbnail */}
        {bill.image_url && (
          <div
            onClick={() => setImageExpanded(true)}
            className="rounded-xl overflow-hidden mb-5 cursor-pointer active:scale-[0.98] transition-transform"
            style={{
              background: 'var(--card)',
              boxShadow: '0 2px 12px rgba(0, 0, 0, 0.06)'
            }}
          >
            <div className="flex items-center gap-3 p-3">
              <div className="relative w-12 h-16 rounded-lg overflow-hidden flex-shrink-0" style={{ background: 'var(--border)' }}>
                <Image
                  src={bill.image_url}
                  alt="Your bill"
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                  View original bill
                </p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  Tap to expand
                </p>
              </div>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ color: 'var(--muted)' }}
              >
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
              </svg>
            </div>
          </div>
        )}

        {/* Image Lightbox */}
        {imageExpanded && bill.image_url && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0, 0, 0, 0.85)' }}
            onClick={() => setImageExpanded(false)}
          >
            <div className="relative w-full max-w-lg max-h-[85vh]">
              <Image
                src={bill.image_url}
                alt="Your bill"
                width={600}
                height={800}
                className="w-full h-auto max-h-[85vh] object-contain rounded-lg"
                unoptimized
              />
            </div>
            <button
              className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(255, 255, 255, 0.1)' }}
              onClick={() => setImageExpanded(false)}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
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

        {/* Creator submitted badge */}
        {creatorSubmitted && creatorName && (
          <div
            className="mb-4 p-3 rounded-xl text-center"
            style={{ background: 'var(--success-light)' }}
          >
            <p className="text-sm font-medium" style={{ color: 'var(--success)' }}>
              You&apos;re in as {creatorName}! Now share the link and wait for friends.
            </p>
          </div>
        )}

        {/* Items */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2
              className="text-lg font-semibold"
              style={{ color: 'var(--foreground)' }}
            >
              {isEditing ? 'Review items' : canClaimItems ? 'What did you have?' : 'Your items'}
            </h2>
            <span
              className="text-sm px-3 py-1 rounded-full"
              style={{
                background: 'var(--accent-light)',
                color: 'var(--accent)'
              }}
            >
              {items.length} items
            </span>
          </div>

          {isEditing && (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              Remove any items you don&apos;t want to split
            </p>
          )}

          {canClaimItems && (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              Tap items to claim them as yours, then share the link
            </p>
          )}

          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: 'var(--card)',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)'
            }}
          >
            {items.map((item, index) => {
              const isClaimed = claimedIds.has(item.id);

              return (
                <div
                  key={item.id}
                  onClick={() => canClaimItems && handleToggleClaim(item.id)}
                  className={`px-4 py-3 flex items-center gap-3 ${canClaimItems ? 'cursor-pointer active:bg-gray-50' : ''}`}
                  style={{
                    borderBottom: index < items.length - 1 ? '1px solid var(--border)' : undefined,
                    opacity: deleting === item.id ? 0.5 : 1,
                    background: isClaimed ? 'var(--accent-light)' : undefined
                  }}
                >
                  {/* Checkbox for claiming */}
                  {(isActive && participantToken) && (
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
                    <p className="text-sm truncate" style={{ color: 'var(--foreground)' }}>
                      {item.name}
                    </p>
                  </div>
                  <p className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>
                    ${item.price.toFixed(2)}
                  </p>
                  {isEditing && (
                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      disabled={deleting === item.id}
                      className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: '#FEF2F2' }}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#EF4444"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Creator's running total - shown when claiming */}
          {canClaimItems && (
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
                Tax & tip will be split equally when finalized
              </p>
            </div>
          )}

          {/* Totals */}
          <div
            className="rounded-2xl p-4 space-y-2"
            style={{
              background: 'var(--card)',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)'
            }}
          >
            {bill.subtotal !== null && (
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: 'var(--muted)' }}>Subtotal</span>
                <span className="text-sm" style={{ color: 'var(--foreground)' }}>
                  ${bill.subtotal.toFixed(2)}
                </span>
              </div>
            )}
            {bill.tax !== null && (
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: 'var(--muted)' }}>Tax</span>
                <span className="text-sm" style={{ color: 'var(--foreground)' }}>
                  ${bill.tax.toFixed(2)}
                </span>
              </div>
            )}
            {bill.tip !== null && (
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: 'var(--muted)' }}>Tip</span>
                <span className="text-sm" style={{ color: 'var(--foreground)' }}>
                  ${bill.tip.toFixed(2)}
                </span>
              </div>
            )}
          </div>

          {/* Share link section - shown when active and creator has submitted */}
          {isActive && creatorSubmitted && (
            <div
              className="rounded-2xl p-4"
              style={{
                background: 'var(--card)',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)'
              }}
            >
              <p className="text-sm font-medium mb-3" style={{ color: 'var(--foreground)' }}>
                Share with your friends
              </p>
              <div className="flex gap-2">
                <div
                  className="flex-1 px-3 py-2.5 rounded-lg text-sm truncate"
                  style={{ background: 'var(--background)', color: 'var(--muted)' }}
                >
                  {getShareUrl()}
                </div>
                <button
                  onClick={() => handleCopyLink(getShareUrl())}
                  className="px-4 py-2.5 rounded-lg text-sm font-medium text-white flex items-center gap-2 flex-shrink-0"
                  style={{ background: 'var(--accent)' }}
                >
                  {copied ? (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Copied
                    </>
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      Copy
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Participants section - shown when active and creator has submitted */}
          {(isActive && creatorSubmitted) || isComplete ? (
            <div
              className="rounded-2xl p-4"
              style={{
                background: 'var(--card)',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)'
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                  Who&apos;s in?
                </p>
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
                >
                  {doneParticipants.length} submitted
                </span>
              </div>

              {doneParticipants.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--muted)' }}>
                  Waiting for friends to claim items...
                </p>
              ) : (
                <div className="space-y-3">
                  {doneParticipants.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between py-2 border-b last:border-b-0"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      <div>
                        <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                          {p.name}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--muted)' }}>
                          {p.claimed_items.length} item{p.claimed_items.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <p className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>
                        ${p.items_total.toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {/* Complete section - shown when complete */}
          {isComplete && (
            <div
              className="rounded-2xl p-4"
              style={{
                background: '#CCFBF1',
              }}
            >
              <p className="text-sm font-medium mb-2" style={{ color: '#0D9488' }}>
                Bill complete! Share the final breakdown:
              </p>
              <div className="flex gap-2">
                <div
                  className="flex-1 px-3 py-2.5 rounded-lg text-sm truncate"
                  style={{ background: 'white', color: 'var(--muted)' }}
                >
                  {getFinalUrl()}
                </div>
                <button
                  onClick={() => handleCopyLink(getFinalUrl())}
                  className="px-4 py-2.5 rounded-lg text-sm font-medium text-white flex items-center gap-2 flex-shrink-0"
                  style={{ background: '#0D9488' }}
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Fixed bottom button - Confirm (editing) */}
      {isEditing && (
        <div
          className="fixed bottom-0 left-0 right-0 p-4"
          style={{ background: 'linear-gradient(transparent, var(--background) 20%)' }}
        >
          <div className="max-w-lg mx-auto">
            <button
              onClick={handleConfirm}
              disabled={confirming || items.length === 0}
              className="w-full py-4 rounded-xl font-semibold text-white transition-all"
              style={{
                background: confirming || items.length === 0 ? 'var(--muted)' : 'var(--accent)'
              }}
            >
              {confirming ? 'Confirming...' : 'Looks good!'}
            </button>
          </div>
        </div>
      )}

      {/* Fixed bottom button - Submit claims (active, not submitted) */}
      {canClaimItems && (
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

      {/* Fixed bottom button - Wrap up (active, creator submitted) */}
      {isActive && creatorSubmitted && (
        <div
          className="fixed bottom-0 left-0 right-0 p-4"
          style={{ background: 'linear-gradient(transparent, var(--background) 20%)' }}
        >
          <div className="max-w-lg mx-auto">
            <button
              onClick={() => setShowCompleteModal(true)}
              disabled={doneParticipants.length < 2}
              className="w-full py-4 rounded-xl font-semibold text-white transition-all"
              style={{
                background: doneParticipants.length < 2 ? 'var(--muted)' : '#0D9488'
              }}
            >
              Everyone&apos;s in - wrap it up!
            </button>
            {doneParticipants.length < 2 && (
              <p className="text-center text-xs mt-2" style={{ color: 'var(--muted)' }}>
                Wait for at least one friend to submit
              </p>
            )}
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
                onClick={handleCreatorSubmit}
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

      {/* Complete modal */}
      {showCompleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-4"
          style={{ background: 'rgba(0, 0, 0, 0.5)' }}
          onClick={() => setShowCompleteModal(false)}
        >
          <div
            className="w-full max-w-lg rounded-t-2xl p-6"
            style={{ background: 'var(--card)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--foreground)' }}>
              How should they pay you?
            </h2>
            <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
              Add at least one payment method
            </p>

            {/* Discrepancy warning */}
            {hasDiscrepancy && (
              <div
                className="mb-4 p-3 rounded-xl"
                style={{ background: '#FEF3C7', border: '1px solid #FCD34D' }}
              >
                <p className="text-sm font-medium mb-1" style={{ color: '#92400E' }}>
                  Heads up: items don&apos;t add up
                </p>
                <div className="text-xs space-y-1" style={{ color: '#A16207' }}>
                  <div className="flex justify-between">
                    <span>Bill subtotal:</span>
                    <span className="font-medium">${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total claimed:</span>
                    <span className="font-medium">${totalClaimed.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t" style={{ borderColor: '#FCD34D' }}>
                    <span>{claimDiscrepancy > 0 ? 'Unclaimed:' : 'Over-claimed:'}</span>
                    <span className="font-bold">${Math.abs(claimDiscrepancy).toFixed(2)}</span>
                  </div>
                </div>
                <p className="text-xs mt-2" style={{ color: '#A16207' }}>
                  {claimDiscrepancy > 0
                    ? 'Some items may not have been claimed by anyone.'
                    : 'Some items may have been double-counted.'}
                </p>
              </div>
            )}

            <div className="space-y-3 mb-4">
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>
                  Venmo
                </label>
                <input
                  type="text"
                  value={venmo}
                  onChange={(e) => setVenmo(e.target.value)}
                  placeholder="@your-venmo"
                  className="w-full px-4 py-3 rounded-xl text-base"
                  style={{
                    background: 'var(--background)',
                    border: '1px solid var(--border)',
                    color: 'var(--foreground)'
                  }}
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>
                  Zelle
                </label>
                <input
                  type="text"
                  value={zelle}
                  onChange={(e) => setZelle(e.target.value)}
                  placeholder="Phone or email"
                  className="w-full px-4 py-3 rounded-xl text-base"
                  style={{
                    background: 'var(--background)',
                    border: '1px solid var(--border)',
                    color: 'var(--foreground)'
                  }}
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--muted)' }}>
                  Cash App
                </label>
                <input
                  type="text"
                  value={cashapp}
                  onChange={(e) => setCashapp(e.target.value)}
                  placeholder="$your-cashtag"
                  className="w-full px-4 py-3 rounded-xl text-base"
                  style={{
                    background: 'var(--background)',
                    border: '1px solid var(--border)',
                    color: 'var(--foreground)'
                  }}
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowCompleteModal(false)}
                className="flex-1 py-3 rounded-xl font-medium"
                style={{ background: 'var(--background)', color: 'var(--muted)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleComplete}
                disabled={completing || (!venmo.trim() && !zelle.trim() && !cashapp.trim())}
                className="flex-1 py-3 rounded-xl font-semibold text-white"
                style={{
                  background: completing || (!venmo.trim() && !zelle.trim() && !cashapp.trim()) ? 'var(--muted)' : '#0D9488'
                }}
              >
                {completing ? 'Completing...' : 'Complete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

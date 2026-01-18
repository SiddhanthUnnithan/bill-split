'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getFinalResults, FinalResults } from '@/lib/api';

export default function FinalResultsPage() {
  const params = useParams();
  const shareToken = params.shareToken as string;

  const [results, setResults] = useState<FinalResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchResults() {
      try {
        const data = await getFinalResults(shareToken);
        setResults(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load results');
      } finally {
        setLoading(false);
      }
    }

    fetchResults();
  }, [shareToken]);

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

  if (error || !results) {
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
            {error === 'Bill is not complete yet' ? 'Not ready yet' : 'Something went wrong'}
          </h1>
          <p style={{ color: 'var(--muted)' }}>
            {error === 'Bill is not complete yet'
              ? 'The bill creator hasn\'t finalized the split yet'
              : error || 'Could not load results'}
          </p>
        </div>
      </main>
    );
  }

  const grandTotal = results.splits.reduce((sum, s) => sum + s.final_total, 0);
  const hasPaymentMethods = results.venmo_handle || results.zelle_handle || results.cashapp_handle;

  return (
    <main className="min-h-[100dvh] pb-8" style={{ background: 'var(--background)' }}>
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
          <span
            className="text-xs px-2.5 py-1 rounded-full font-medium"
            style={{ background: '#CCFBF1', color: '#0D9488' }}
          >
            Final split
          </span>
        </div>

        {/* Header card */}
        <div
          className="rounded-2xl p-5 mb-6 text-center"
          style={{
            background: 'linear-gradient(135deg, #0D9488 0%, #0F766E 100%)',
          }}
        >
          <p className="text-white/80 text-sm mb-1">Total bill</p>
          <p className="text-white text-3xl font-bold">
            ${grandTotal.toFixed(2)}
          </p>
          <p className="text-white/70 text-sm mt-2">
            Split between {results.splits.length} {results.splits.length === 1 ? 'person' : 'people'}
          </p>
        </div>

        {/* Splits */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--foreground)' }}>
            Everyone&apos;s share
          </h2>

          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: 'var(--card)',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)'
            }}
          >
            {results.splits.map((split, index) => (
              <div
                key={split.name}
                className="px-4 py-4"
                style={{
                  borderBottom: index < results.splits.length - 1 ? '1px solid var(--border)' : undefined
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="font-semibold" style={{ color: 'var(--foreground)' }}>
                    {split.name}
                  </p>
                  <p className="text-lg font-bold" style={{ color: '#0D9488' }}>
                    ${split.final_total.toFixed(2)}
                  </p>
                </div>
                <div className="flex gap-4 text-xs" style={{ color: 'var(--muted)' }}>
                  <span>Items: ${split.items_total.toFixed(2)}</span>
                  {split.tax_share > 0 && <span>Tax: ${split.tax_share.toFixed(2)}</span>}
                  {split.tip_share > 0 && <span>Tip: ${split.tip_share.toFixed(2)}</span>}
                </div>
              </div>
            ))}
          </div>

          {/* Breakdown note */}
          <div
            className="rounded-xl p-3 text-center"
            style={{ background: 'var(--accent-light)' }}
          >
            <p className="text-xs" style={{ color: 'var(--accent)' }}>
              Tax{results.tip ? ' & tip' : ''} split equally among all participants
            </p>
          </div>

          {/* Payment methods */}
          {hasPaymentMethods && (
            <div
              className="rounded-2xl p-4"
              style={{
                background: 'var(--card)',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)'
              }}
            >
              <p className="text-sm font-medium mb-3" style={{ color: 'var(--foreground)' }}>
                Pay the bill holder
              </p>
              <div className="space-y-2">
                {results.venmo_handle && (
                  <div
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg"
                    style={{ background: 'var(--background)' }}
                  >
                    <span className="text-sm" style={{ color: 'var(--muted)' }}>Venmo</span>
                    <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                      {results.venmo_handle}
                    </span>
                  </div>
                )}
                {results.zelle_handle && (
                  <div
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg"
                    style={{ background: 'var(--background)' }}
                  >
                    <span className="text-sm" style={{ color: 'var(--muted)' }}>Zelle</span>
                    <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                      {results.zelle_handle}
                    </span>
                  </div>
                )}
                {results.cashapp_handle && (
                  <div
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg"
                    style={{ background: 'var(--background)' }}
                  >
                    <span className="text-sm" style={{ color: 'var(--muted)' }}>Cash App</span>
                    <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                      {results.cashapp_handle}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Bill details */}
          <div
            className="rounded-2xl p-4 space-y-2"
            style={{
              background: 'var(--card)',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)'
            }}
          >
            <p className="text-sm font-medium mb-2" style={{ color: 'var(--foreground)' }}>
              Bill breakdown
            </p>
            {results.subtotal !== null && (
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: 'var(--muted)' }}>Subtotal</span>
                <span className="text-sm" style={{ color: 'var(--foreground)' }}>
                  ${results.subtotal.toFixed(2)}
                </span>
              </div>
            )}
            {results.tax !== null && (
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: 'var(--muted)' }}>Tax</span>
                <span className="text-sm" style={{ color: 'var(--foreground)' }}>
                  ${results.tax.toFixed(2)}
                </span>
              </div>
            )}
            {results.tip !== null && (
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: 'var(--muted)' }}>Tip</span>
                <span className="text-sm" style={{ color: 'var(--foreground)' }}>
                  ${results.tip.toFixed(2)}
                </span>
              </div>
            )}
            <div
              className="flex items-center justify-between pt-2 mt-2"
              style={{ borderTop: '1px solid var(--border)' }}
            >
              <span className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>Total</span>
              <span className="text-sm font-bold" style={{ color: 'var(--foreground)' }}>
                ${grandTotal.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8">
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Powered by mize
          </p>
        </div>
      </div>
    </main>
  );
}

'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { uploadBill, parseBill } from '@/lib/api';

type UploadStatus = 'idle' | 'uploading' | 'parsing';

export default function Home() {
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Oops! We need a photo of your bill');
      return;
    }

    setError(null);
    setStatus('uploading');

    try {
      const result = await uploadBill(file);

      // Auto-parse after upload
      setStatus('parsing');
      await parseBill(result.creator_token);

      router.push(`/b/${result.creator_token}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again?');
      setStatus('idle');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <main className="min-h-[100dvh] flex flex-col px-6 py-12" style={{ background: 'var(--background)' }}>
      <div className="flex-1 flex flex-col max-w-md mx-auto w-full">
        {/* Header */}
        <div className="text-center mb-10">
          <h1
            className="text-5xl font-bold tracking-tight mb-3"
            style={{ color: 'var(--accent)' }}
          >
            mize
          </h1>
          <p
            className="text-lg"
            style={{ color: 'var(--muted)' }}
          >
            Never be afraid to put down your card
          </p>
        </div>

        {/* Upload Area */}
        <div className="flex-1 flex flex-col justify-center">
          <div
            onClick={handleClick}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`
              rounded-3xl p-8 text-center cursor-pointer
              transition-all duration-200 ease-out
              ${status !== 'idle' ? 'pointer-events-none' : ''}
            `}
            style={{
              background: isDragging ? 'var(--accent-light)' : 'var(--card)',
              border: `2px dashed ${isDragging ? 'var(--accent)' : 'var(--border)'}`,
              boxShadow: isDragging ? '0 8px 30px rgba(20, 184, 166, 0.2)' : '0 4px 20px rgba(0, 0, 0, 0.04)',
              transform: isDragging ? 'scale(1.02)' : 'scale(1)',
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileSelect}
              className="hidden"
            />

            {status !== 'idle' ? (
              <div className="py-8">
                <div
                  className="w-12 h-12 rounded-full border-3 border-t-transparent animate-spin mx-auto mb-4"
                  style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
                />
                <p style={{ color: 'var(--foreground)' }} className="font-medium">
                  {status === 'uploading' ? 'Uploading...' : 'Reading your bill...'}
                </p>
                <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
                  {status === 'uploading' ? 'Almost there' : 'Finding all the items'}
                </p>
              </div>
            ) : (
              <div className="py-8">
                <div
                  className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-5"
                  style={{ background: 'var(--accent-light)' }}
                >
                  <svg
                    width="40"
                    height="40"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ color: 'var(--accent)' }}
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="12" y1="18" x2="12" y2="12" />
                    <line x1="9" y1="15" x2="15" y2="15" />
                  </svg>
                </div>
                <p
                  className="text-2xl font-semibold mb-2"
                  style={{ color: 'var(--foreground)' }}
                >
                  Drop your bill here!
                </p>
                <p style={{ color: 'var(--muted)' }}>
                  Tap to snap a photo
                </p>
              </div>
            )}
          </div>

          {error && (
            <div
              className="mt-6 p-4 rounded-2xl text-center"
              style={{
                background: '#FEF2F2',
                border: '1px solid #FECACA'
              }}
            >
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="text-center mt-8 pb-4">
          <p
            className="text-sm"
            style={{ color: 'var(--muted)' }}
          >
            We&apos;ll itemize it, you split it
          </p>
        </div>
      </div>
    </main>
  );
}

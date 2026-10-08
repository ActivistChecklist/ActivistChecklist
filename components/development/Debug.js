'use client';

import { useState, useEffect } from 'react';
import { useDebug } from '../../contexts/DebugContext';
import { usePathname, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';

const ReactJson = dynamic(() => import('react-json-view'), {
  ssr: false,
});

export default function Debug() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('router');
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { debugData } = useDebug();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  if (!isMounted || process.env.NODE_ENV !== 'development') return null;

  const routerState = {
    pathname,
    query: Object.fromEntries(searchParams?.entries() || []),
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-4 right-4 z-50 bg-primary text-primary-foreground px-3 py-1 rounded text-xs font-mono opacity-50 hover:opacity-100 transition-opacity"
      >
        {isOpen ? 'Close Debug' : 'Debug'}
      </button>
      {isOpen && (
        <div className="fixed bottom-14 right-4 z-50 bg-background border rounded shadow-lg p-4 w-96 max-h-96 overflow-auto text-xs font-mono">
          <div className="flex gap-2 mb-3">
            {['router', 'debug'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-2 py-1 rounded ${activeTab === tab ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
              >
                {tab}
              </button>
            ))}
          </div>
          {activeTab === 'router' && (
            <ReactJson src={routerState} theme="monokai" collapsed={false} />
          )}
          {activeTab === 'debug' && (
            <ReactJson src={debugData || {}} theme="monokai" collapsed={false} />
          )}
        </div>
      )}
    </>
  );
}

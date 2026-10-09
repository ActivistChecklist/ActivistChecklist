'use client';
import React, { createContext, useContext, useState } from 'react';

const LayoutContext = createContext({
  sidebarType: 'navigation', // 'navigation' | 'toc' | null
  setSidebarType: () => {},
});

export function LayoutProvider({ children, initialSidebarType = 'navigation' }) {
  const [sidebarType, setSidebarType] = useState(initialSidebarType);

  return (
    <LayoutContext.Provider value={{ sidebarType, setSidebarType }}>
      {children}
    </LayoutContext.Provider>
  );
}

export function useLayout() {
  const context = useContext(LayoutContext);
  if (!context) {
    throw new Error('useLayout must be used within a LayoutProvider');
  }
  return context;
}

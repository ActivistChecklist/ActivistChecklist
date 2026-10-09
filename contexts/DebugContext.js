'use client';
import { createContext, useContext, useState, useCallback, useEffect } from 'react';

let globalDebugUpdate = () => {}; // Initialize with no-op function

export const DebugContext = createContext({
  debugData: {},
  addDebugData: () => {},
});

export function DebugProvider({ children }) {
  const [debugData, setDebugData] = useState({});

  const addDebugData = useCallback((key, value) => {
    setDebugData((prev) => ({
      ...prev,
      [key]: value,
    }));
  }, []);

  // Store the update function globally when the provider mounts
  useEffect(() => {
    globalDebugUpdate = addDebugData;
  }, [addDebugData]);

  return (
    <DebugContext.Provider value={{ debugData, addDebugData }}>{children}</DebugContext.Provider>
  );
}

// Export a global function that can be used anywhere
export const debugLog = (key, value) => {
  globalDebugUpdate(key, value);
};

export const useDebug = () => useContext(DebugContext);

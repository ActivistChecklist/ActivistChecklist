'use client';

import { createContext, useContext } from 'react';

const AnnouncementContext = createContext(null);

export function AnnouncementProvider({ value, children }) {
  return <AnnouncementContext.Provider value={value}>{children}</AnnouncementContext.Provider>;
}

export function useAnnouncement() {
  return useContext(AnnouncementContext);
}

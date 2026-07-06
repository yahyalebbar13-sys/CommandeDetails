'use client';

import React, { createContext, useContext, useState } from 'react';
import type { StoreLocation } from '@/lib/types';

export type ActiveStore = StoreLocation | 'ALL';

interface StoreContextValue {
  activeStore: ActiveStore;
  setActiveStore: (store: ActiveStore) => void;
  userRole: 'ADMIN' | 'COMMERCIAL';
  assignedStore?: StoreLocation; // Store assigné si COMMERCIAL
}

const StoreContext = createContext<StoreContextValue | undefined>(undefined);

export function StoreProvider({
  children,
  initialRole = 'ADMIN',
  initialAssignedStore,
}: {
  children: React.ReactNode;
  initialRole?: 'ADMIN' | 'COMMERCIAL';
  initialAssignedStore?: StoreLocation;
}) {
  const [activeStore, setActiveStore] = useState<ActiveStore>(
    initialRole === 'COMMERCIAL' && initialAssignedStore ? initialAssignedStore : 'ALL'
  );

  return (
    <StoreContext.Provider
      value={{
        activeStore,
        setActiveStore: (store) => {
          // Un commercial ne peut pas changer de magasin
          if (initialRole === 'COMMERCIAL') return;
          setActiveStore(store);
        },
        userRole: initialRole,
        assignedStore: initialAssignedStore,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStoreContext() {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error('useStoreContext must be used within a StoreProvider');
  }
  return context;
}

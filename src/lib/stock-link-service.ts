import { useState, useEffect } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, doc, onSnapshot } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import { computeStockItems } from '@/components/stock/stock-app';
import type { StockMovement, StockItem } from '@/lib/types';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

export function getStockStatusForQty(qty: number): 'available' | 'limited' | 'out_of_stock' {
  if (qty === 0) return 'out_of_stock';
  if (qty <= 10) return 'limited';
  return 'available';
}

export function useStockArticles() {
  const [adminUid, setAdminUid] = useState<string | null>(null);
  const [articles, setArticles] = useState<any[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // 1. Get adminUid
  useEffect(() => {
    const adminDocRef = doc(db, 'publicConfig', 'adminConfig');
    const unsubAdmin = onSnapshot(adminDocRef, (docSnap) => {
      if (docSnap.exists()) {
        setAdminUid(docSnap.data().adminUid);
      }
    }, (error) => {
      console.error("Error fetching admin uid:", error);
    });

    return () => unsubAdmin();
  }, []);

  // 2. Load articles & movements once adminUid is available
  useEffect(() => {
    if (!adminUid) return;

    const articlesRef = collection(db, 'users', adminUid, 'articles');
    const unsubArticles = onSnapshot(articlesRef, (snapshot) => {
      const arts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setArticles(arts);
    }, (error) => {
       console.error("Error fetching articles:", error);
    });

    const movementsRef = collection(db, 'users', adminUid, 'stockMovements');
    const unsubMovements = onSnapshot(movementsRef, (snapshot) => {
      const movs = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as StockMovement[];
      setMovements(movs);
    }, (error) => {
       console.error("Error fetching movements:", error);
    });

    return () => {
      unsubArticles();
      unsubMovements();
    };
  }, [adminUid]);

  // 3. Compute stock items when articles or movements change
  useEffect(() => {
    if (adminUid && articles.length > 0) {
      // Use computeStockItems from stock-app.tsx
      // activeStore = 'ALL' to get total stock
      const items = computeStockItems(
        articles, 
        movements, 
        [], // categories (unused in active store ALL calculations)
        'ALL', 
        false, 
        'ADMIN', 
        [], // stores 
        ''  // userStoreId
      );
      setStockItems(items);
      setIsLoading(false);
    } else if (adminUid) {
      // If we have an adminUid but no articles yet, handle loading
      const timer = setTimeout(() => {
         setIsLoading(false);
      }, 3000); // 3 second fallback
      return () => clearTimeout(timer);
    }
  }, [articles, movements, adminUid]);

  return { stockItems, articles, isLoading };
}

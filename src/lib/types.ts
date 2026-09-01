export type OrderStatus = 'TO_ORDER' | 'PI' | 'SHIPPED';

export type StoreLocation = string;

export type StoreType = 'WAREHOUSE' | 'STORE';

export type Store = {
  id: StoreLocation;
  name: string;
  type: StoreType;
  isMain: boolean;
  accessEmail?: string;
};

export type GeneralCategory = {
  id: string;
  name: string;
};

export type Category = {
  id: string;
  name: string;
  generalCategoryId?: string;
  hsCode?: string;
  customsValuePerKg?: number;
  importDutyRate?: number;
  tpiRate?: number;
  tvaRate?: number;
  availableSizes?: string[];
  // Fabric config
  availableGsm?: number[];     // GSM pré-définis (ex: [30, 40, 225])
  availableWidths?: number[];  // Largeurs pré-définies en cm (ex: [100, 150, 160])
};

export type Order = {
  id: string;
  generalCategoryId?: string;
  categoryId: string;
  name: string;
  specs?: string;
  color?: string;
  size?: string;
  zipperType?: string;
  slider?: string;
  sliderType?: string;
  supplierId: string;
  factureId?: string;
  orderDate: string;
  arrivalDate?: string;
  stockEntryDate?: string;
  quantity: number;
  unitOfMeasure: string;
  purchasePricePerUnit: number;
  cubicMeasurement?: number;
  netWeight?: number;
  priority?: 'urgent' | 'important' | 'todo';
  status: OrderStatus;
  initialQtyByStore?: Partial<Record<StoreLocation, number>>;
  createdAt?: any;
  // Fabric-specific fields
  gsm?: number;              // Grammage g/m²
  fabricWidth?: number;       // Largeur rouleau cm
  rollLength?: number;        // Longueur rouleau
  rollLengthUnit?: 'm' | 'yds'; // Unité longueur
  packagingPerBag?: number;   // Nb rouleaux par sac/bale
};

export type Facture = {
  id: string;
  noBL?: string;
  arrivalDate: string;
  stockEntryDate?: string;
  shippingDate?: string;
  shippingLine?: string;
  supplierId: string;
  declaringCompany?: "New fournitures" | "Lebtex" | "Robe in box";
  forwarder?: string;
  forwarderGivenDate?: string;
  freightCost: number;
  declaredValue?: number;
  customsPaidDhs?: number;
  invoicePaidDhs?: number;
  exchangeInvoiceAmount?: number;
  supplierInvoiceAmount?: number;
  additionalCostsAmount?: number;
};

export type SupplierPayment = {
  id: string;
  supplierId: string;
  amount: number;
  date: string;
  notes?: string;
};

export type ViewType = 'dashboard' | 'to-order' | 'pending' | 'transit' | 'factures' | 'general-categories' | 'categories' | 'suppliers' | 'data' | 'timeline' | 'cost-analysis' | 'cost-sale' | 'dp' | 'reconciliation' | 'devis-pi' | 'client-profitability' | 'ai' | 'products' | 'base-orders' | 'history-revient' | 'emails';

export type StockMovementType = 'IN' | 'OUT' | 'ADJUSTMENT';
export type StockMovementReason = 'ARRIVAGE' | 'VENTE' | 'PERTE' | 'RETOUR' | 'INVENTAIRE' | 'TRANSFERT';

export type StockMovement = {
  id: string;
  articleId: string;
  categoryId: string;
  productName: string;
  color?: string;
  size?: string;
  unitOfMeasure: string;
  type: StockMovementType;
  reason: StockMovementReason;
  storeId?: StoreLocation;
  toStoreId?: StoreLocation; // Utilisé si reason === 'TRANSFERT'
  quantity: number;      // toujours positif — direction donnée par type
  date: string;          // YYYY-MM-DD
  notes?: string;
  factureId?: string;    // référence si mouvement IN lié à un arrivage
  createdAt?: any;
};

// Stock item calculé (non stocké — calculé en mémoire)
export type StockItem = {
  articleId: string;
  categoryId: string;
  productName: string;
  color?: string;
  size?: string;
  unitOfMeasure: string;
  purchasePricePerUnit: number;
  hasTTCCost?: boolean;           // true si coût de revient TTC calculé, false si FOB estimé
  sellingPrice?: number;          // prix de vente configuré par l'admin
  initialQty: number;
  initialQtyByStore?: Partial<Record<StoreLocation, number>>; // Stock initial par magasin
  mouvementsIn: number;
  mouvementsOut: number;
  currentQty: number;
  qtyByStore?: Partial<Record<StoreLocation, number>>; // Ventilation du stock actuel par magasin
  totalValue: number;             // currentQty * purchasePricePerUnit
  totalSellingValue?: number;     // currentQty * sellingPrice
  minThreshold?: number;
  lastMovementDate?: string;
  stockEntryDate?: string;
  // Champs internes pour les articles "various" explosés
  _realArticleId?: string;        // articleId Firestore réel (si ID virtuel)
  _colorKey?: string;             // couleur de la variante
  _sizeKey?: string;              // taille de la variante
};

// ── Types de vente (POS rapide) ────────────────────────────────────────────────
export type SaleItem = {
  articleId: string;
  productName: string;
  color?: string;
  size?: string;
  categoryId: string;
  generalCategoryId?: string;
  unitOfMeasure: string;
  qty: number;
  unitPrice: number;      // prix unitaire retenu (peut être modifié)
  sellingPrice: number;   // prix de vente catalogue
  costPrice: number;      // prix d'achat (pour marge)
  totalPrice: number;     // qty * unitPrice
  totalCost: number;      // qty * costPrice
  margin: number;         // totalPrice - totalCost
};

export type Sale = {
  id: string;
  items: SaleItem[];
  totalAmount: number;
  totalCost: number;
  totalMargin: number;
  date: string;
  storeId?: StoreLocation;
  clientId?: string;
  clientName?: string;
  notes?: string;
  createdAt?: any;
};

// ── Bons de Transfert ──────────────────────────────────────────────────────────
export type TransferOrderStatus = 'PENDING' | 'VALIDATED' | 'CANCELLED';

export type TransferOrderItem = {
  articleId: string;
  categoryId: string;
  productName: string;
  color?: string;
  size?: string;
  unitOfMeasure: string;
  sentQty: number;
  receivedQty?: number;
};

export type TransferOrder = {
  id: string;
  fromStore: StoreLocation;
  toStore: StoreLocation;
  status: TransferOrderStatus;
  items: TransferOrderItem[];
  date: string;
  receivedDate?: string;
  notes?: string;
  createdAt?: any;
};

// ── Types de catégorisation client ────────────────────────────────────────────
export type ClientCategory = 'GROSSISTE' | 'SEMI_GROSSISTE' | 'DETAILLANT';

export type Client = {
  id: string;
  storeId?: StoreLocation;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  // ── Catégorisation & Tarification ──
  category?: ClientCategory;        // Type de client pour grilles tarifaires
  // ── Conformité fiscale marocaine ──
  ice?: string;                     // Identifiant Commun de l'Entreprise
  identifiantFiscal?: string;       // IF — Identifiant Fiscal
  registreCommerce?: string;        // RC — Registre du Commerce
  cnss?: string;                    // CNSS — Caisse Nationale de Sécurité Sociale
  patente?: string;                 // Patente
  // ── Gestion du crédit ──
  creditLimit?: number;             // Plafond de crédit en MAD (0 = pas de crédit)
  creditBlocked?: boolean;          // Blocage manuel du crédit
  createdAt?: any;
};

export type OrderItem = {
  articleId: string;
  productName: string;
  color?: string;
  size?: string;
  categoryId: string;
  generalCategoryId?: string;
  unitOfMeasure: string;
  qty: number;
  unitPrice: number;
  totalPrice: number;
  storeId?: string;
};

export type SaleOrderStatus = 'DRAFT' | 'CONFIRMED' | 'INVOICED' | 'CANCELLED';

export type SaleOrder = {
  id: string;
  clientId?: string;
  clientName?: string;
  items: OrderItem[];
  totalAmount: number;
  discount?: number;      // remise en %
  totalAfterDiscount: number;
  status: SaleOrderStatus;
  date: string;
  storeId?: StoreLocation;
  notes?: string;
  createdAt?: any;
};

export type InvoiceStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'CANCELLED';

// Taux de TVA marocains autorisés
export type TvaRate = 0 | 7 | 10 | 14 | 20;

export type Invoice = {
  id: string;
  invoiceNumber?: string;
  clientId?: string;
  clientName?: string;
  orderId?: string;
  items: OrderItem[];
  totalAmount: number;         // Montant HT
  discount?: number;
  totalAfterDiscount: number;  // Montant HT après remise
  // ── Conformité fiscale marocaine ──
  tvaRate?: TvaRate;           // Taux TVA applicable (20% par défaut)
  tvaAmount?: number;          // Montant TVA calculé
  totalTTC?: number;           // Total TTC (totalAfterDiscount + tvaAmount)
  paidAmount: number;
  remainingBalance: number;
  status: InvoiceStatus;
  date: string;
  storeId?: StoreLocation;
  dueDate?: string;
  notes?: string;
  createdAt?: any;
};

export type PaymentMethod = 'CASH' | 'VIREMENT' | 'CHEQUE' | 'EFFET' | 'AUTRE';

export type ClientPayment = {
  id: string;
  clientId: string;
  invoiceId?: string;
  amount: number;
  date: string;
  method: PaymentMethod;
  notes?: string;
  // Champs pour Chèque / Effet bancaire
  bankName?: string;
  checkNumber?: string;
  dueDate?: string; // Date d'échéance de l'effet
  status?: 'PENDING' | 'CLEARED' | 'REJECTED'; // PENDING par défaut pour les effets non encaissés
  scannedImageUrl?: string; // URL ou base64 du scan
  createdAt?: any;
};

// ── Journal d'Audit ──────────────────────────────────────────────────────────
export type AuditAction = 
  | 'STOCK_IN' | 'STOCK_OUT' | 'STOCK_ADJUSTMENT' | 'STOCK_TRANSFER'
  | 'SALE_CREATED' | 'INVOICE_CREATED' | 'INVOICE_PAID' | 'INVOICE_CANCELLED'
  | 'PAYMENT_RECORDED' | 'PAYMENT_REJECTED' | 'PAYMENT_CLEARED'
  | 'CLIENT_CREATED' | 'CLIENT_UPDATED'
  | 'TRANSFER_CREATED' | 'TRANSFER_VALIDATED'
  | 'INVENTORY_RECONCILED'
  | 'SETTINGS_UPDATED';

export type AuditLogEntry = {
  id: string;
  action: AuditAction;
  userId: string;
  userEmail: string;
  entityType: 'stockMovement' | 'sale' | 'invoice' | 'payment' | 'client' | 'transfer' | 'settings';
  entityId: string;
  description: string;
  metadata?: Record<string, any>;  // Additional context (amounts, quantities, etc.)
  timestamp: string;               // ISO 8601
  createdAt?: any;                 // Firestore serverTimestamp
};

// ── Rapprochement Bancaire ───────────────────────────────────────────────────
export type BankReconciliationStatus = 'MATCHED' | 'UNMATCHED_INTERNAL' | 'UNMATCHED_BANK' | 'PARTIAL';

export type BankTransaction = {
  id: string;                      // ID unique généré à l'import
  date: string;                    // Date de l'opération bancaire
  label: string;                   // Libellé du relevé bancaire
  reference?: string;              // Référence bancaire / N° chèque
  credit: number;                  // Montant crédit (encaissement)
  debit: number;                   // Montant débit (décaissement)
  balance?: number;                // Solde après opération
  matchedPaymentId?: string;       // ID du ClientPayment rapproché
  status: BankReconciliationStatus;
};

export type BankReconciliation = {
  id: string;
  bankName: string;                // Nom de la banque (Attijariwafa, BMCE, BCP...)
  accountNumber?: string;          // N° de compte
  period: string;                  // Mois du relevé (YYYY-MM)
  importDate: string;              // Date d'import du relevé
  transactions: BankTransaction[];
  totalCredits: number;
  totalDebits: number;
  matchedCount: number;
  unmatchedCount: number;
  createdAt?: any;
};

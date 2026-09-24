"use client";

import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Layers, Plus, Trash2, ArrowRight, FolderSearch, PlusCircle,
  Truck, DollarSign, TrendingUp, Package, Search, BarChart3,
  ArrowRightLeft, Pencil, Sparkles, AlertTriangle, Lock, SlidersHorizontal, ImagePlus
} from 'lucide-react';
import { useUser, useFirestore, setDocumentNonBlocking, deleteDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase';
import { collection, deleteField, doc, getDocs, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { GeneralCategory, Category } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { isAccessoryLine, isFabricLine, isZipperLine, isThreadLine, isTapeLine } from '@/lib/constants';
import { QUALITIES_FIELD_BY_SPEC, SPEC_BADGES, countQualities, detectSpecType } from '@/lib/quality-schema';
import { useLignesLogistiques } from '@/hooks/use-lignes-logistiques';
import { LIBELLE_SPEC, cleLigne, couleurDeLigne, type LigneLogistique, type SpecType } from '@/lib/lignes-logistiques';
import { libelleUnite } from '@/lib/unites-pole';
import { designsAEnregistrer } from '@/lib/designs-curseurs';
import { BadgeSpec, ChampsUnitesPole, ChoixLigne, ChoixSpec, PastilleLigne, estNouvelleLigne } from '@/components/pole-ligne-unites';

interface GeneralCategoriesViewProps {
  articles: any[];
  generalCategories: GeneralCategory[];
  subCategories: Category[];
  onSelectGeneralCategory: (id: string) => void;
  onManageQualities?: (specType: string, poleId: string) => void;
}

// Couleurs des cartes de pôle (les couleurs de LIGNE viennent de lib/lignes-logistiques.ts).
const UI_COLORS = ['#CC8626', '#1E293B', '#3B82F6', '#10B981', '#6366F1', '#F43F5E', '#8B5CF6', '#EC4899', '#0D9488'];

const GROUPS_ORDER = [
  { title: 'Fabric',           keywords: ['fabric','non woven','t/c fabric','popeline','leather','felt fabric','polyester fabric','taffeta fabric','woven interlining'] },
  { title: 'Slider et puller', keywords: ['puller','slider for nylon zipper','slider for plastic zipper','slider for metal zipper'] },
  { title: 'Zipper',           keywords: ['zipper','plastic zipper','nylon zipper','metal zipper','zipper long chain','nylon zipper long chain'] },
  { title: 'Thread',           keywords: ['thread','sewing thread','fil','fil à coudre','cone','cône','yarn','elastic thread','spun polyester'] },
  { title: 'Ruban',            keywords: ['ruban','tape','ribbon','sangle','biais','elastic tape'] },
  { title: 'Accessoires',      keywords: ['accessoire','accessoires','accessory','accessories','boucle','buckle','bouton','button','rivet','oeillet','eyelet','crochet','hook','anneau','ring','snap','stopper','cord lock','cordon','embout','fermoir'] },
  { title: 'Bouton',           keywords: ['covered mould button','snap button','button','bouton'] },
  { title: 'Reste',            keywords: ['rope','tack pin','hook and loop','divers','opp bag'], isFallback: true },
];

type ElementGroupe = { gc: GeneralCategory; stats: any };
type Groupe = { title: string; keywords: string[]; isFallback?: boolean; items: ElementGroupe[] };
type UnitesPole = { uniteAchat?: string; uniteVente?: string };

export default function GeneralCategoriesView({ articles = [], generalCategories, subCategories, onSelectGeneralCategory, onManageQualities }: GeneralCategoriesViewProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  // Les lignes portent les spécifications qualités : un pôle reçoit celles de sa ligne.
  const { lignes, specPourLigne, trouverLigne, definirLigne } = useLignesLogistiques(generalCategories);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [newCatName, setNewCatName] = useState('');
  const [newCatNameFR, setNewCatNameFR] = useState('');
  const [newCatLine, setNewCatLine] = useState('');
  // Spécifications demandées seulement quand la ligne tapée est nouvelle.
  const [newCatLineSpec, setNewCatLineSpec] = useState<SpecType | null>(null);
  const [newCatUnites, setNewCatUnites] = useState<UnitesPole>({});
  const [creatingPole, setCreatingPole] = useState(false);
  const [newSubName, setNewSubName] = useState('');
  const [newSubNameFR, setNewSubNameFR] = useState('');
  const [newSubHsCode, setNewSubHsCode] = useState('');
  const [newSubCustomsValue, setNewSubCustomsValue] = useState<number | ''>('');
  const [newSubDutyRate, setNewSubDutyRate] = useState<number | ''>('');
  const [newSubTpiRate, setNewSubTpiRate] = useState<number | ''>('');
  const [newSubTvaRate, setNewSubTvaRate] = useState<number | ''>('');
  const [targetGenCatId, setTargetGenCatId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{open: boolean; id?: string; name?: string}>({open: false});
  const [movingPole, setMovingPole] = useState<GeneralCategory | null>(null);
  const [moveTargetLine, setMoveTargetLine] = useState('');
  const [editingPole, setEditingPole] = useState<GeneralCategory | null>(null);
  const [editPoleName, setEditPoleName] = useState('');
  const [editPoleNameFR, setEditPoleNameFR] = useState('');
  const [editPoleLine, setEditPoleLine] = useState('');
  const [editPoleLineSpec, setEditPoleLineSpec] = useState<SpecType | null>(null);
  const [editPoleUnites, setEditPoleUnites] = useState<UnitesPole>({});
  const [savingPole, setSavingPole] = useState(false);
  // Dialogue « Spécifications de la ligne », et ligne en cours d'enregistrement.
  const [ligneEnEdition, setLigneEnEdition] = useState<{ nom: string; spec: SpecType } | null>(null);
  const [ligneEnCours, setLigneEnCours] = useState<string | null>(null);

  const now = new Date();

  const groupStats = useMemo(() => {
    const stats: Record<string, any> = {};

    generalCategories.forEach(gc => {
      const familiesInPole = subCategories.filter(sc => sc.generalCategoryId === gc.id);
      const subCatNames = familiesInPole.map(sc => sc.name);

      const groupArticles = articles.filter(a =>
        a.generalCategoryId === gc.id ||
        subCatNames.includes(a.categoryId)
      );

      const specType = detectSpecType(gc);
      const qualitiesCount = countQualities(gc, specType) +
        familiesInPole.reduce((s, fam) => s + countQualities(fam, specType), 0);
      const hasSpecModel = !!specType && specType !== 'none';
      const qualitiesConfigured = hasSpecModel && qualitiesCount > 0;

      // Diagnostic : si des qualités existent sous un AUTRE type que celui détecté pour ce
      // pôle (ex: ligne mal renseignée), le badge affiche "à configurer" alors que des données
      // réelles existent — on le détecte ici pour l'exposer dans le tooltip plutôt que de
      // laisser l'incohérence invisible.
      let qualitiesCountOtherType = 0;
      let otherTypeDetected: string | null = null;
      if (!qualitiesConfigured) {
        for (const t of Object.keys(QUALITIES_FIELD_BY_SPEC)) {
          if (t === specType) continue;
          const c = countQualities(gc, t) + familiesInPole.reduce((s, fam) => s + countQualities(fam, t), 0);
          if (c > qualitiesCountOtherType) { qualitiesCountOtherType = c; otherTypeDetected = t; }
        }
      }

      let totalValue = 0;

      const futureArrivals = groupArticles
        .filter(a => a.status === 'SHIPPED' && a.arrivalDate && new Date(a.arrivalDate) > now)
        .map(a => new Date(a.arrivalDate as string).getTime());

      const nextArrival = futureArrivals.length > 0
        ? new Date(Math.min(...futureArrivals)).toISOString().split('T')[0]
        : '-';

      const activeArticles = groupArticles.filter(a => a.status === 'SHIPPED' || a.status === 'PI').length;

      groupArticles.forEach(a => {
        totalValue += (Number(a.quantity) || 0) * (Number(a.purchasePricePerUnit) || 0);
      });

      stats[gc.id] = {
        name: gc.name,
        count: subCatNames.length,
        articleCount: groupArticles.length,
        activeArticles,
        nextArrival,
        totalValue,
        line: (gc as any).line,
        specType,
        hasSpecModel,
        qualitiesCount,
        qualitiesConfigured,
        qualitiesCountOtherType,
        otherTypeDetected,
      };
    });
    return stats;
  }, [generalCategories, articles, subCategories]);

  // Global KPIs
  const globalKPIs = useMemo(() => {
    const allStats = Object.values(groupStats) as any[];
    const totalValue = allStats.reduce((s: number, st: any) => s + st.totalValue, 0);
    const totalGroups = generalCategories.length;
    const totalFamilies = subCategories.length;
    const activeLines = allStats.filter((st: any) => st.nextArrival !== '-').length;
    const polesWithSpecModel = allStats.filter((st: any) => st.hasSpecModel);
    const polesMissingQualities = polesWithSpecModel.filter((st: any) => !st.qualitiesConfigured).length;
    return { totalValue, totalGroups, totalFamilies, activeLines, polesMissingQualities };
  }, [groupStats, generalCategories, subCategories]);

  const organizedCategories = useMemo(() => {
    const result: Groupe[] = GROUPS_ORDER.map(g => ({ ...g, items: [] as ElementGroupe[] }));
    const customGroupsMap = new Map<string, Groupe>();

    const lowerSearch = searchTerm.toLowerCase();

    generalCategories.forEach(gc => {
      if (lowerSearch && !gc.name.toLowerCase().includes(lowerSearch)) return;

      const catName = (gc.name || '').toLowerCase().trim();
      const explicitLine = (gc as any).line;
      let matched = false;

      if (explicitLine) {
        const lineTrimmed = explicitLine.trim().toLowerCase();
        const group = result.find(g => 
          g.title.toLowerCase() === lineTrimmed ||
          (g.title === 'Accessoires' && isAccessoryLine(explicitLine)) ||
          (g.title === 'Fabric' && isFabricLine(explicitLine)) ||
          (g.title === 'Zipper' && isZipperLine(explicitLine)) ||
          (g.title === 'Thread' && isThreadLine(explicitLine)) ||
          (g.title === 'Ruban' && isTapeLine(explicitLine))
        );
        if (group) { 
          group.items.push({ gc, stats: groupStats[gc.id] }); 
          matched = true; 
        } else {
          // « Élastiques » et « ÉLASTIQUES » sont la même ligne : un seul groupe.
          const cle = cleLigne(explicitLine);
          if (!customGroupsMap.has(cle)) {
            customGroupsMap.set(cle, { title: trouverLigne(explicitLine)?.nom ?? explicitLine, keywords: [], items: [] });
          }
          customGroupsMap.get(cle)!.items.push({ gc, stats: groupStats[gc.id] });
          matched = true;
        }
      }

      if (!matched) {
        for (const group of result) {
          if (group.keywords.some(kw => catName.includes(kw))) {
            group.items.push({ gc, stats: groupStats[gc.id] });
            matched = true;
            break;
          }
        }
      }
      if (!matched) {
        const fallback = result.find(g => g.isFallback);
        if (fallback) fallback.items.push({ gc, stats: groupStats[gc.id] });
      }
    });

    const allGroups = [...result, ...Array.from(customGroupsMap.values())];
    const filtered = allGroups.filter(g => g.items.length > 0);
    filtered.forEach(g => {
      g.items.sort((a, b) => {
        const aMissing = a.stats?.hasSpecModel && !a.stats?.qualitiesConfigured ? 1 : 0;
        const bMissing = b.stats?.hasSpecModel && !b.stats?.qualitiesConfigured ? 1 : 0;
        if (aMissing !== bMissing) return bMissing - aMissing;
        return (b.stats?.totalValue || 0) - (a.stats?.totalValue || 0);
      });
    });
    filtered.sort((a, b) => {
      const aTotal = a.items.reduce((s: number, i: any) => s + (i.stats?.totalValue || 0), 0);
      const bTotal = b.items.reduce((s: number, i: any) => s + (i.stats?.totalValue || 0), 0);
      return bTotal - aTotal;
    });
    return filtered;
  }, [generalCategories, groupStats, searchTerm, trouverLigne]);

  // Lignes réellement présentes dans un groupe affiché. Le regroupement ci-dessus
  // rapproche parfois plusieurs lignes (« Accessoire » et « Bouton » tombent sous
  // « Accessoires ») : chacune garde ses propres spécifications, on les montre toutes.
  const lignesDuGroupe = (group: Groupe): LigneLogistique[] => {
    const vues = new Map<string, LigneLogistique>();
    group.items.forEach(({ gc }) => {
      const l = trouverLigne(gc.line);
      if (l) vues.set(cleLigne(l.nom), l);
    });
    return Array.from(vues.values());
  };

  /** Redéfinit les spécifications d'une ligne et les recopie sur tous ses pôles. */
  const appliquerSpecLigne = async (nom: string, spec: SpecType): Promise<boolean> => {
    setLigneEnCours(nom);
    try {
      const n = await definirLigne(nom, spec);
      toast({
        title: `Ligne ${nom} : ${n} pôle(s) mis à jour`,
        description: `Spécifications qualités : ${LIBELLE_SPEC[spec].emoji} ${LIBELLE_SPEC[spec].label}`,
      });
      return true;
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Ligne non enregistrée', description: err?.message });
      return false;
    } finally {
      setLigneEnCours(null);
    }
  };

  /**
   * Curseurs : les anciens designs du catalogue (sous-collection `designs` de chaque catégorie)
   * n'ont jamais été enregistrés comme qualités — les commandes et /stock ne les proposent pas.
   * On les ajoute aux qualités de leur catégorie, pour toute la ligne d'un coup, sans doublon
   * (même référence ou même photo qu'une qualité existante de la catégorie ou du pôle).
   */
  const [designsEnCours, setDesignsEnCours] = useState<string | null>(null);
  const enregistrerDesignsDeLaLigne = async (ligne: LigneLogistique) => {
    if (!user || !firestore || designsEnCours) return;
    setDesignsEnCours(ligne.nom);
    try {
      const polesDeLaLigne = new Set(ligne.poles);
      const categories = subCategories.filter(c => c.generalCategoryId && polesDeLaLigne.has(c.generalCategoryId));
      let ajoutes = 0;
      const touchees: string[] = [];
      for (const c of categories) {
        const snap = await getDocs(collection(firestore, 'users', user.uid, 'categories', c.id, 'designs'));
        if (snap.empty) continue;
        const pole = generalCategories.find(g => g.id === c.generalCategoryId);
        const siennes: any[] = Array.isArray(c.sliderQualities) ? c.sliderQualities : [];
        const aAjouter = designsAEnregistrer(snap.docs.map(d => ({ id: d.id, ...d.data() })), [...siennes, ...(pole?.sliderQualities || [])]);
        if (!aAjouter.length) continue;
        await updateDoc(doc(firestore, 'users', user.uid, 'categories', c.id), { sliderQualities: [...siennes, ...aAjouter] });
        ajoutes += aAjouter.length;
        touchees.push(c.name);
      }
      toast(ajoutes
        ? {
            title: `✅ ${ajoutes} ancien${ajoutes > 1 ? 's' : ''} design${ajoutes > 1 ? 's' : ''} enregistré${ajoutes > 1 ? 's' : ''} comme qualité${ajoutes > 1 ? 's' : ''}`,
            description: `${touchees.length} catégorie${touchees.length > 1 ? 's' : ''} : ${touchees.join(', ')}`,
          }
        : { title: 'Rien à enregistrer', description: `Les designs de la ligne ${ligne.nom} sont déjà tous des qualités.` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Enregistrement interrompu', description: err?.message });
    } finally {
      setDesignsEnCours(null);
    }
  };

  // Max value for relative bar width
  const maxValue = useMemo(() => {
    return Math.max(...Object.values(groupStats).map((s: any) => s.totalValue || 0), 1);
  }, [groupStats]);

  /**
   * Ligne retenue pour un pôle, et les spécifications qu'elle lui donne. Une
   * ligne NOUVELLE est d'abord enregistrée avec ses spécifications (obligatoires) ;
   * une ligne connue garde son écriture (« zipper » tapé rejoint « Zipper »).
   * Renvoie null si les spécifications d'une nouvelle ligne manquent.
   */
  const resoudreLigne = async (saisie: string, specNouvelle: SpecType | null): Promise<{ ligne: string; specType: SpecType } | null> => {
    const nom = saisie.trim();
    if (estNouvelleLigne(lignes, nom)) {
      if (!specNouvelle) {
        toast({ variant: 'destructive', title: 'Spécifications requises', description: `Choisissez les Spécifications Qualités de la nouvelle ligne « ${nom} ».` });
        return null;
      }
      await definirLigne(nom, specNouvelle);
      return { ligne: nom, specType: specNouvelle };
    }
    const ligne = trouverLigne(nom)?.nom ?? nom;
    return { ligne, specType: specPourLigne(ligne) };
  };

  const handleAddGeneralCategory = async () => {
    if (!user || !firestore || !newCatName.trim() || !newCatLine.trim() || creatingPole) return;
    setCreatingPole(true);
    try {
      const resolue = await resoudreLigne(newCatLine, newCatLineSpec);
      if (!resolue) return;
      const id = crypto.randomUUID();
      const docRef = doc(firestore, 'users', user.uid, 'generalCategories', id);
      // Pas de choix de spécifications ici : le pôle reçoit celles de sa ligne.
      const data: Partial<GeneralCategory> = { id, name: newCatName.trim().toUpperCase(), line: resolue.ligne, specType: resolue.specType };
      if (newCatNameFR.trim()) data.nameFR = newCatNameFR.trim().toUpperCase();
      if (newCatUnites.uniteAchat) data.uniteAchat = newCatUnites.uniteAchat;
      if (newCatUnites.uniteVente) data.uniteVente = newCatUnites.uniteVente;

      setDocumentNonBlocking(docRef, data, { merge: true });
      toast({ title: 'Pôle logistique créé', description: `${data.name} · ligne ${resolue.ligne} · ${LIBELLE_SPEC[resolue.specType].emoji} ${LIBELLE_SPEC[resolue.specType].label}` });
      setNewCatName(''); setNewCatNameFR(''); setNewCatLine(''); setNewCatLineSpec(null); setNewCatUnites({}); setIsModalOpen(false);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Pôle non créé', description: err?.message });
    } finally {
      setCreatingPole(false);
    }
  };

  const handleAddSubCategory = () => {
    if (!user || !firestore || !newSubName.trim() || !targetGenCatId) return;
    const id = crypto.randomUUID();
    const docRef = doc(firestore, 'users', user.uid, 'categories', id);
    const catData: any = { id, name: newSubName.trim().toUpperCase(), generalCategoryId: targetGenCatId };
    if (newSubNameFR.trim()) catData.nameFR = newSubNameFR.trim().toUpperCase();
    if (newSubHsCode) catData.hsCode = newSubHsCode;
    if (newSubCustomsValue !== '') catData.customsValuePerKg = Number(newSubCustomsValue);
    if (newSubDutyRate !== '') catData.importDutyRate = Number(newSubDutyRate);
    if (newSubTpiRate !== '') catData.tpiRate = Number(newSubTpiRate);
    if (newSubTvaRate !== '') catData.tvaRate = Number(newSubTvaRate);
    setDocumentNonBlocking(docRef, catData, { merge: true });
    toast({ title: 'Sous-catégorie ajoutée' });
    setNewSubName(''); setNewSubNameFR(''); setNewSubHsCode(''); setNewSubCustomsValue('');
    setNewSubDutyRate(''); setNewSubTpiRate(''); setNewSubTvaRate('');
    setTargetGenCatId(null); setIsSubModalOpen(false);
  };

  const handleDelete = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (!user || !firestore) return;
    setDeleteConfirm({ open: true, id, name });
  };

  const openSubModal = (e: React.MouseEvent, genCatId: string) => {
    e.stopPropagation();
    setTargetGenCatId(genCatId);
    setIsSubModalOpen(true);
  };

  const ouvrirEditionPole = (gc: GeneralCategory) => {
    setEditingPole(gc);
    setEditPoleName(gc.name || '');
    setEditPoleNameFR(gc.nameFR || '');
    setEditPoleLine(trouverLigne(gc.line)?.nom ?? gc.line ?? '');
    setEditPoleLineSpec(null);
    setEditPoleUnites({ uniteAchat: gc.uniteAchat || undefined, uniteVente: gc.uniteVente || undefined });
  };

  const fermerEditionPole = () => {
    setEditingPole(null);
    setEditPoleName('');
    setEditPoleNameFR('');
    setEditPoleLine('');
    setEditPoleLineSpec(null);
    setEditPoleUnites({});
  };

  const handleSavePole = async () => {
    if (!user || !firestore || !editingPole || savingPole) return;
    if (!editPoleLine.trim()) {
      toast({ variant: 'destructive', title: 'Ligne requise', description: 'Un pôle reçoit ses spécifications qualités de sa ligne : choisissez-en une.' });
      return;
    }
    const oldName = editingPole.name;
    const newName = (editPoleName.trim() || oldName).toUpperCase();
    const nameFR = editPoleNameFR.trim() ? editPoleNameFR.trim().toUpperCase() : null;
    const docRef = doc(firestore, 'users', user.uid, 'generalCategories', editingPole.id);
    setSavingPole(true);
    try {
      const resolue = await resoudreLigne(editPoleLine, editPoleLineSpec);
      if (!resolue) return;
      const updateData: any = {
        name: newName,
        nameFR,
        line: resolue.ligne,
        specType: resolue.specType,
        // Unité vidée = redevient libre (Firestore refuse `undefined`).
        uniteAchat: editPoleUnites.uniteAchat || deleteField(),
        uniteVente: editPoleUnites.uniteVente || deleteField(),
      };
      updateDocumentNonBlocking(docRef, updateData);
      toast({ title: '✅ Pôle enregistré', description: `${newName}${nameFR ? ` · FR: ${nameFR}` : ''} · ligne ${resolue.ligne}` });
      fermerEditionPole();
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Pôle non enregistré', description: err?.message });
    } finally {
      setSavingPole(false);
    }
  };

  const poleCibleFamille = generalCategories.find(g => g.id === targetGenCatId);

  return (
    <div className="space-y-8 fade-in">
      {/* ── Header ── */}
      <div className="bg-stone-900 rounded-[2rem] p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-amber-500/8 rounded-full -translate-y-1/2 translate-x-1/2 blur-[120px] pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
          <div>
            <p className="text-[10px] font-black text-amber-500 uppercase tracking-[0.25em] mb-2">Vue Consolidée</p>
            <h1 className="text-3xl font-black text-white uppercase tracking-tighter leading-none">
              Architecture<br /><span className="text-amber-500">Logistique</span>
            </h1>
            <p className="text-stone-400 text-xs font-medium mt-3 max-w-sm">
              Pôles d'activité, familles produits et flux financiers consolidés.
            </p>
          </div>

          {/* Global KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 w-full lg:w-auto">
            {[
              { label: 'Pôles', value: globalKPIs.totalGroups, icon: BarChart3, color: 'text-amber-400' },
              { label: 'Familles', value: globalKPIs.totalFamilies, icon: Layers, color: 'text-blue-400' },
              { label: 'Flux Actifs', value: globalKPIs.activeLines, icon: Truck, color: 'text-emerald-400' },
              { label: 'Valeur Totale', value: `${(globalKPIs.totalValue / 1000).toFixed(1)}k $`, icon: DollarSign, color: 'text-violet-400' },
              globalKPIs.polesMissingQualities > 0
                ? { label: 'Qualités à Configurer', value: globalKPIs.polesMissingQualities, icon: AlertTriangle, color: 'text-red-400' }
                : { label: 'Qualités OK', value: '✓', icon: Sparkles, color: 'text-fuchsia-400' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-white/5 border border-white/10 rounded-xl p-4 backdrop-blur-md text-center">
                <Icon className={`w-4 h-4 ${color} mx-auto mb-2`} />
                <p className={`text-lg font-black ${color} leading-none`}>{value}</p>
                <p className="text-[8px] font-black text-stone-500 uppercase tracking-widest mt-1">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
          <Input
            placeholder="Rechercher un pôle..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-9 h-10 text-[10px] font-bold border-stone-200 bg-white rounded-xl focus:ring-stone-900 transition-all"
          />
        </div>
        <Button
          onClick={() => setIsModalOpen(true)}
          className="bg-amber-500 hover:bg-amber-600 text-white px-5 h-10 rounded-xl shadow-lg shadow-amber-500/20 flex items-center gap-2 text-[10px] uppercase font-black tracking-widest transition-all hover:scale-105 active:scale-95"
        >
          <Plus className="w-3.5 h-3.5" /> Nouveau Pôle
        </Button>
      </div>

      {/* ── Content ── */}
      <div className="space-y-12">
        {generalCategories.length === 0 ? (
          <div className="py-24 text-center border-2 border-dashed border-stone-100 rounded-[2rem] bg-white/50">
            <FolderSearch className="w-12 h-12 text-stone-200 mx-auto mb-4" />
            <p className="text-stone-300 font-black uppercase tracking-[0.2em] text-[9px]">Aucun pôle configuré</p>
            <p className="text-stone-200 text-xs mt-2">Créez votre premier pôle logistique</p>
          </div>
        ) : organizedCategories.length === 0 ? (
          <div className="py-16 text-center text-stone-300 font-black uppercase text-[10px] tracking-widest">
            Aucun résultat pour « {searchTerm} »
          </div>
        ) : (
          organizedCategories.map((group, groupIdx) => {
            const lineColor = couleurDeLigne(group.title);
            const groupTotal = group.items.reduce((s, { stats }) => s + (stats?.totalValue || 0), 0);
            const lignesGroupe = lignesDuGroupe(group);
            const polesSansLigne = group.items.filter(({ gc }) => !trouverLigne(gc.line)).length;

            return (
              <div key={groupIdx} className="space-y-4">
                {/* Section header */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-1.5 h-6 rounded-full" style={{ backgroundColor: lineColor }} />
                      <h3 className="text-lg font-black text-stone-950 uppercase tracking-tighter">{group.title}</h3>
                      <span className="text-[8px] font-black text-stone-900 bg-stone-200 px-2 py-0.5 rounded-full uppercase">
                        {group.items.length} pôles
                      </span>
                    </div>
                    <span className="text-[10px] font-black text-stone-500 uppercase">
                      {groupTotal.toLocaleString('en-US', { maximumFractionDigits: 0 })} $
                    </span>
                  </div>

                  {/* Spécifications portées par la (ou les) ligne(s) du groupe */}
                  {(lignesGroupe.length > 0 || polesSansLigne > 0) && (
                    <div className="flex flex-col gap-1.5 pl-4">
                      {lignesGroupe.map(l => {
                        const enCours = ligneEnCours === l.nom;
                        const seule = lignesGroupe.length === 1 && cleLigne(l.nom) === cleLigne(group.title);
                        return (
                          <div key={l.nom} className="flex flex-wrap items-center gap-2">
                            {!seule && (
                              <span className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-stone-600">
                                <PastilleLigne nom={l.nom} /> Ligne {l.nom}
                              </span>
                            )}
                            <BadgeSpec specType={l.specType} suffixe={l.source === 'enregistree' ? undefined : 'à confirmer'} />
                            <button
                              type="button"
                              disabled={enCours}
                              onClick={() => setLigneEnEdition({ nom: l.nom, spec: l.specType })}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-stone-200 bg-white text-[9px] font-black uppercase tracking-widest text-stone-600 hover:border-stone-400 hover:text-stone-900 transition-colors disabled:opacity-40"
                            >
                              <SlidersHorizontal className="w-2.5 h-2.5" /> Spécifications de la ligne
                            </button>
                            {l.specType === 'slider' && (
                              <button
                                type="button"
                                disabled={designsEnCours !== null}
                                onClick={() => enregistrerDesignsDeLaLigne(l)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-blue-200 bg-blue-50 text-[9px] font-black uppercase tracking-widest text-blue-700 hover:border-blue-400 transition-colors disabled:opacity-40"
                                title="Ajouter aux qualités les anciens designs du catalogue de chaque catégorie de la ligne"
                              >
                                <ImagePlus className="w-2.5 h-2.5" />
                                {designsEnCours === l.nom ? 'Enregistrement…' : 'Anciens designs → qualités'}
                              </button>
                            )}
                            {l.polesAHarmoniser.length > 0 && (
                              <span className="inline-flex items-center gap-1.5 pl-2 pr-1 py-0.5 rounded-full bg-amber-100 border border-amber-300 text-[9px] font-black uppercase tracking-widest text-amber-800">
                                <AlertTriangle className="w-2.5 h-2.5" /> {l.polesAHarmoniser.length} pôle(s) à harmoniser
                                <button
                                  type="button"
                                  disabled={enCours}
                                  onClick={() => appliquerSpecLigne(l.nom, l.specType)}
                                  className="px-2 py-0.5 rounded-full bg-amber-600 hover:bg-amber-700 text-white text-[8px] font-black uppercase tracking-widest transition-colors disabled:opacity-40"
                                  title={`Donner ${LIBELLE_SPEC[l.specType].label} à tous les pôles de la ligne ${l.nom}`}
                                >
                                  Appliquer à toute la ligne
                                </button>
                              </span>
                            )}
                          </div>
                        );
                      })}
                      {polesSansLigne > 0 && (
                        <span className="self-start inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-stone-100 border border-stone-200 text-[9px] font-black uppercase tracking-widest text-stone-500">
                          <ArrowRightLeft className="w-2.5 h-2.5" /> {polesSansLigne} pôle(s) sans ligne : « Changer de ligne » pour leur donner des spécifications
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {group.items.map(({ gc, stats }, index) => {
                    const color = UI_COLORS[(groupIdx * 3 + index) % UI_COLORS.length];
                    const barWidth = maxValue > 0 ? Math.max(4, (stats.totalValue / maxValue) * 100) : 4;
                    const hasArrival = stats.nextArrival !== '-';

                    return (
                      <Card
                        key={gc.id}
                        onClick={() => onSelectGeneralCategory(gc.id)}
                        className="group cursor-pointer border-none bg-white shadow-md hover:shadow-xl transition-all duration-300 rounded-[1.2rem] overflow-hidden active:scale-95 relative"
                        style={{ '--card-color': color } as any}
                      >
                        {/* Top accent bar */}
                        <div className="h-1 w-full" style={{ backgroundColor: color }} />

                        <CardContent className="p-4">
                          {/* Action buttons */}
                          <div className="flex justify-between items-start mb-3">
                            <div
                              className="p-2 rounded-lg transition-all group-hover:text-white"
                              style={{ backgroundColor: `${color}15`, color }}
                            >
                              <Layers className="w-3.5 h-3.5" />
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 hover:bg-amber-50 rounded-lg transition-colors"
                                style={{ color }}
                                title="Ajouter une sous-catégorie"
                                onClick={(e) => openSubModal(e, gc.id)}
                              >
                                <PlusCircle className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-stone-400 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors"
                                title="Modifier le pôle"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  ouvrirEditionPole(gc);
                                }}
                              >
                                <Pencil className="w-3 h-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-stone-300 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Changer de ligne"
                                onClick={(e) => { e.stopPropagation(); setMovingPole(gc); }}
                              >
                                <ArrowRightLeft className="w-3 h-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-stone-200 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                onClick={(e) => handleDelete(e, gc.id, gc.name)}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>

                          {/* Name */}
                          <div className="min-h-[2.5rem] mb-3">
                            <h3 className="text-[12px] font-black text-stone-950 uppercase leading-tight tracking-tight group-hover:text-stone-900 line-clamp-2">
                              {gc.name}
                            </h3>
                            {gc.nameFR && (
                              <p className="text-[9px] font-bold text-stone-400 uppercase tracking-wider mt-0.5 truncate">
                                FR (Stock) : {gc.nameFR}
                              </p>
                            )}
                            <div className="flex items-center flex-wrap gap-1 mt-1">
                              {stats.specType && SPEC_BADGES[stats.specType] && (
                                <span className={`px-1.5 py-0.5 rounded ${SPEC_BADGES[stats.specType].bg} ${SPEC_BADGES[stats.specType].text} text-[8px] font-black uppercase`}>
                                  {SPEC_BADGES[stats.specType].emoji} {SPEC_BADGES[stats.specType].label}
                                </span>
                              )}
                              {stats.hasSpecModel && (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); onManageQualities?.(stats.specType, gc.id); }}
                                  className={onManageQualities ? 'cursor-pointer' : 'cursor-default'}
                                  title={onManageQualities ? 'Gérer les qualités de ce pôle' : undefined}
                                >
                                  {stats.qualitiesConfigured ? (
                                    <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[8px] font-black uppercase flex items-center gap-0.5 hover:bg-emerald-200 transition-colors">
                                      <Sparkles className="w-2 h-2" /> {stats.qualitiesCount} qualités
                                    </span>
                                  ) : (
                                    <span
                                      className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[8px] font-black uppercase flex items-center gap-0.5 hover:bg-red-200 transition-colors"
                                      title={stats.qualitiesCountOtherType > 0 ? `Type détecté pour ce pôle : ${stats.specType}. Mais ${stats.qualitiesCountOtherType} qualité(s) trouvée(s) sous le type "${stats.otherTypeDetected}" — la ligne du pôle est probablement mal renseignée.` : `Type détecté : ${stats.specType}. Aucune qualité (pôle ou famille) sous ce type.`}
                                    >
                                      <AlertTriangle className="w-2 h-2" /> À configurer
                                      {stats.qualitiesCountOtherType > 0 && ` (${stats.qualitiesCountOtherType} en "${stats.otherTypeDetected}")`}
                                    </span>
                                  )}
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Value progress bar */}
                          <div className="mb-3">
                            <div className="h-1 bg-stone-100 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-700"
                                style={{ width: `${barWidth}%`, backgroundColor: color }}
                              />
                            </div>
                          </div>

                          {/* Stats */}
                          <div className="pt-2 border-t border-stone-50 space-y-1.5">
                            <div className="flex justify-between items-center text-[8px]">
                              <span className="text-stone-400 font-black uppercase flex items-center gap-1">
                                <Truck className="w-2.5 h-2.5" /> PROCHAINE
                              </span>
                              <span className={`font-black ${hasArrival ? 'text-blue-600' : 'text-stone-300'}`}>
                                {stats.nextArrival}
                              </span>
                            </div>
                            <div className="flex justify-between items-center text-[8px]">
                              <span className="text-stone-400 font-black uppercase flex items-center gap-1">
                                <DollarSign className="w-2.5 h-2.5" /> VALEUR
                              </span>
                              <span className="font-black text-stone-900">
                                {Number(stats.totalValue).toLocaleString('en-US', { maximumFractionDigits: 0 })} $
                              </span>
                            </div>
                          </div>

                          {/* Footer */}
                          <div className="mt-3 flex justify-between items-center">
                            <div className="flex items-center gap-1">
                              <span className="px-2 py-0.5 bg-stone-100 rounded text-[7px] font-black text-stone-900 uppercase">
                                {stats.count} FAMILLES
                              </span>
                              {stats.activeArticles > 0 && (
                                <span className="px-2 py-0.5 rounded text-[7px] font-black uppercase" style={{ backgroundColor: `${color}15`, color }}>
                                  {stats.activeArticles} ACTIFS
                                </span>
                              )}
                            </div>
                            <div className="p-1 bg-stone-50 rounded opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                              <ArrowRight className="w-2.5 h-2.5 text-stone-900" />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Modal: Nouveau Pôle ── */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] sm:max-h-[90vh] flex flex-col gap-0 rounded-[1.5rem] p-0 border-none overflow-hidden shadow-2xl">
          <div className="bg-stone-900 p-5 sm:p-6 text-white shrink-0">
            <DialogTitle className="text-lg font-black uppercase tracking-tight">Initialiser un Pôle</DialogTitle>
            <p className="text-stone-400 text-[9px] font-bold uppercase tracking-widest mt-1">Architecture logistique haut niveau</p>
          </div>
          <div className="p-5 sm:p-6 space-y-4 flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}>
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Désignation du Pôle (Code / Nom d'origine)</label>
              <Input
                value={newCatName}
                onChange={e => {
                  const val = e.target.value;
                  setNewCatName(val);
                  // Le nom peut pré-choisir une LIGNE existante, jamais des spécifications :
                  // celles-ci suivent la ligne.
                  if (newCatLine) return;
                  const lower = val.toLowerCase();
                  let suggeree: string | undefined;
                  if (lower.includes('slider') || lower.includes('puller') || lower.includes('curseur')) {
                    suggeree = trouverLigne('Slider & Puller')?.nom ?? 'Slider et puller';
                  } else if (lower.includes('zipper') || lower.includes('fermeture') || lower.includes('plastic') || lower.includes('zip') || lower.includes('resine')) {
                    suggeree = 'Zipper';
                  } else if (lower.includes('fabric') || lower.includes('popeline') || lower.includes('tissu') || lower.includes('interlining')) {
                    suggeree = 'Fabric';
                  } else if (lower.includes('thread') || lower.includes('fil') || lower.includes('coudre') || lower.includes('cone') || lower.includes('cône') || lower.includes('yarn')) {
                    suggeree = 'Thread';
                  } else if (lower.includes('accessoire') || lower.includes('accessory') || lower.includes('boucle') || lower.includes('buckle') || lower.includes('rivet')) {
                    suggeree = 'Accessoire';
                  }
                  const ligne = suggeree ? trouverLigne(suggeree) : undefined;
                  if (ligne) setNewCatLine(ligne.nom);
                }}
                placeholder="EX: TEXTILES, ZIPPER, FIL, SLIDER..."
                className="h-12 uppercase font-black border-stone-200 rounded-xl focus:ring-stone-900 text-base"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleAddGeneralCategory()}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-amber-700 uppercase tracking-widest flex items-center gap-1">
                Nom en Français (pour le Stock) <span className="text-stone-400 font-normal lowercase">(optionnel)</span>
              </label>
              <Input
                value={newCatNameFR}
                onChange={e => setNewCatNameFR(e.target.value)}
                placeholder="EX: TISSUS, FERMETURES ÉCLAIR, FILS, CURSEURS..."
                className="h-10 uppercase font-bold border-amber-200 bg-amber-50/40 rounded-xl focus:ring-amber-600 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">
                Ligne logistique <span className="text-red-600">*</span>
              </label>
              {/* Les spécifications qualités ne se choisissent pas ici : elles sont
                  celles de la ligne. Seule une nouvelle ligne demande les siennes. */}
              <ChoixLigne
                lignes={lignes}
                valeur={newCatLine}
                onChange={setNewCatLine}
                specNouvelleLigne={newCatLineSpec}
                onSpecNouvelleLigne={setNewCatLineSpec}
              />
            </div>
            <div className="pt-3 border-t border-stone-100 space-y-1.5">
              <label className="text-[9px] font-black text-stone-600 uppercase tracking-widest flex items-center gap-1">
                Unités du pôle <span className="text-stone-400 font-normal lowercase">(optionnel)</span>
              </label>
              <ChampsUnitesPole
                uniteAchat={newCatUnites.uniteAchat}
                uniteVente={newCatUnites.uniteVente}
                onChange={setNewCatUnites}
              />
            </div>
          </div>
          <DialogFooter className="p-4 sm:p-6 bg-stone-50 gap-2 sm:gap-3 shrink-0 border-t border-stone-100 flex-row">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)} className="h-10 font-black uppercase text-[9px] tracking-widest flex-1">Annuler</Button>
            <Button
              onClick={handleAddGeneralCategory}
              disabled={!newCatName.trim() || !newCatLine.trim() || (estNouvelleLigne(lignes, newCatLine) && !newCatLineSpec) || creatingPole}
              className="h-10 bg-stone-900 text-white font-black uppercase text-[9px] tracking-widest rounded-xl flex-[1.5] shadow-lg shadow-stone-200 disabled:opacity-40"
            >
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: Nouvelle Famille ── */}
      <Dialog open={isSubModalOpen} onOpenChange={setIsSubModalOpen}>
        <DialogContent className="max-w-sm max-h-[85vh] sm:max-h-[90vh] flex flex-col gap-0 rounded-[1.5rem] p-0 border-none overflow-hidden shadow-2xl">
          <div className="bg-amber-600 p-5 sm:p-6 text-white shrink-0">
            <DialogTitle className="text-lg font-black uppercase tracking-tight">Nouvelle Famille</DialogTitle>
            <p className="text-amber-200 text-[9px] font-bold uppercase tracking-widest mt-1">
              Pôle : {generalCategories.find(g => g.id === targetGenCatId)?.name}
            </p>
          </div>
          <div className="p-5 sm:p-6 space-y-4 flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}>
            {/* Une famille ne choisit rien : ligne, spécifications et unités viennent de son pôle. */}
            {poleCibleFamille && (() => {
              const ligne = trouverLigne(poleCibleFamille.line);
              const spec = poleCibleFamille.specType ?? specPourLigne(poleCibleFamille.line);
              const { uniteAchat, uniteVente } = poleCibleFamille;
              return (
                <div className="p-3 rounded-xl border border-stone-200 bg-stone-50 space-y-1.5">
                  <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Hérité du pôle
                  </p>
                  <p className="flex flex-wrap items-center gap-2 text-[10px] font-bold text-stone-600">
                    <span className="inline-flex items-center gap-1.5 uppercase">
                      {ligne ? <><PastilleLigne nom={ligne.nom} /> Ligne {ligne.nom}</> : 'Pôle sans ligne'}
                    </span>
                    <BadgeSpec specType={spec} suffixe="héritées du pôle" />
                  </p>
                  {(uniteAchat || uniteVente) && (
                    <p className="text-[10px] font-bold text-stone-600">
                      Unités : achat {uniteAchat ? libelleUnite(uniteAchat) : 'libre'} · vente {uniteVente ? libelleUnite(uniteVente) : 'libre'}
                    </p>
                  )}
                </div>
              );
            })()}
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Nom de la famille produit (Code / Nom technique)</label>
              <Input
                value={newSubName}
                onChange={e => setNewSubName(e.target.value)}
                placeholder="EX: NYLON ZIPPER, T/C TWILL..."
                className="h-12 uppercase font-black border-stone-200 rounded-xl focus:ring-amber-600 text-base"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-amber-700 uppercase tracking-widest flex items-center gap-1">
                Nom en Français (pour le Stock) <span className="text-stone-400 font-normal lowercase">(optionnel)</span>
              </label>
              <Input
                value={newSubNameFR}
                onChange={e => setNewSubNameFR(e.target.value)}
                placeholder="EX: FERMETURE NYLON, DOUBLURE SATIN..."
                className="h-10 uppercase font-bold border-amber-200 bg-amber-50/40 rounded-xl focus:ring-amber-600 text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Code HS</label>
                <Input value={newSubHsCode} onChange={e => setNewSubHsCode(e.target.value)} placeholder="0000.00.00" className="h-10 text-[11px] font-bold border-stone-200 rounded-xl focus:ring-amber-600" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Val Douane / Kg (dh)</label>
                <Input type="number" step="0.01" value={newSubCustomsValue} onChange={e => setNewSubCustomsValue(e.target.value ? Number(e.target.value) : '')} placeholder="0.00" className="h-10 text-[11px] font-bold border-stone-200 rounded-xl focus:ring-amber-600" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">DI (%)</label>
                <Input type="number" step="0.1" value={newSubDutyRate} onChange={e => setNewSubDutyRate(e.target.value ? Number(e.target.value) : '')} placeholder="2.5" className="h-10 text-[11px] font-bold border-stone-200 rounded-xl focus:ring-amber-600" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">TPI (%)</label>
                <Input type="number" step="0.01" value={newSubTpiRate} onChange={e => setNewSubTpiRate(e.target.value ? Number(e.target.value) : '')} placeholder="0.25" className="h-10 text-[11px] font-bold border-stone-200 rounded-xl focus:ring-amber-600" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-stone-400 uppercase tracking-widest">TVA (%)</label>
                <Input type="number" step="0.1" value={newSubTvaRate} onChange={e => setNewSubTvaRate(e.target.value ? Number(e.target.value) : '')} placeholder="20" className="h-10 text-[11px] font-bold border-stone-200 rounded-xl focus:ring-amber-600" />
              </div>
            </div>
          </div>
          <DialogFooter className="p-4 sm:p-6 bg-stone-50 gap-2 sm:gap-3 shrink-0 border-t border-stone-100 flex-row">
            <Button variant="ghost" onClick={() => setIsSubModalOpen(false)} className="h-10 font-black uppercase text-[9px] tracking-widest flex-1">Annuler</Button>
            <Button onClick={handleAddSubCategory} className="h-10 bg-amber-600 text-white font-black uppercase text-[9px] tracking-widest rounded-xl flex-[1.5] shadow-lg shadow-amber-200">Ajouter</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={deleteConfirm.open} onOpenChange={(o) => !o && setDeleteConfirm({open: false})}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Supprimer définitivement "{deleteConfirm.name}" ? Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (deleteConfirm.id) {
                const docRef = doc(firestore, 'users', user?.uid || '', 'generalCategories', deleteConfirm.id);
                deleteDocumentNonBlocking(docRef);
                toast({ title: 'Groupe supprimé' });
              }
            }} className="bg-red-600 hover:bg-red-700">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Modal changer de ligne ── */}
      <Dialog open={!!movingPole} onOpenChange={open => { if (!open) { setMovingPole(null); setMoveTargetLine(''); } }}>
        <DialogContent className="sm:max-w-sm max-h-[85vh] sm:max-h-[90vh] flex flex-col gap-0 rounded-3xl border-none shadow-2xl p-0 overflow-hidden">
          <div className="bg-blue-600 p-5 text-white shrink-0">
            <DialogTitle className="text-base font-black uppercase tracking-tight">Changer de Ligne</DialogTitle>
            <p className="text-blue-200 text-[10px] font-bold uppercase tracking-widest mt-1">{movingPole?.name}</p>
          </div>
          <div className="p-5 space-y-4 flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-400 uppercase tracking-widest">Nouvelle Ligne</Label>
              <Select value={moveTargetLine} onValueChange={setMoveTargetLine}>
                <SelectTrigger className="h-11 border-stone-200 bg-white font-bold rounded-xl">
                  <SelectValue placeholder="Choisir une ligne..." />
                </SelectTrigger>
                <SelectContent>
                  {lignes.map(l => (
                    <SelectItem key={l.nom} value={l.nom} className="font-bold uppercase">
                      {l.nom} · {LIBELLE_SPEC[l.specType].emoji} {LIBELLE_SPEC[l.specType].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {moveTargetLine && movingPole && (() => {
                const spec = specPourLigne(moveTargetLine);
                const avant = movingPole.specType || 'none';
                return (
                  <div className="space-y-1 pt-1">
                    <p className="flex flex-wrap items-center gap-2 text-[10px] font-bold text-stone-500">
                      <Lock className="w-3 h-3" /> Spécifications qualités :
                      <BadgeSpec specType={spec} suffixe={`données par la ligne ${moveTargetLine}`} />
                    </p>
                    {avant !== spec && (
                      <p className="text-[10px] font-bold text-amber-700">
                        Le pôle passera de {LIBELLE_SPEC[avant]?.label ?? avant} à {LIBELLE_SPEC[spec].label}.
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="ghost" className="flex-1 h-10 font-black text-[9px] uppercase tracking-widest" onClick={() => { setMovingPole(null); setMoveTargetLine(''); }}>Annuler</Button>
              <Button
                className="flex-[1.5] h-10 bg-blue-600 hover:bg-blue-700 text-white font-black text-[9px] uppercase tracking-widest rounded-xl shadow-lg"
                disabled={!moveTargetLine}
                onClick={() => {
                  if (!user || !firestore || !movingPole || !moveTargetLine) return;
                  const docRef = doc(firestore, 'users', user.uid, 'generalCategories', movingPole.id);
                  // Changer de ligne, c'est aussi prendre les spécifications de la nouvelle.
                  const ligne = trouverLigne(moveTargetLine)?.nom ?? moveTargetLine;
                  const specType = specPourLigne(ligne);
                  updateDocumentNonBlocking(docRef, { line: ligne, specType });
                  toast({ title: '✅ Ligne modifiée', description: `${movingPole.name} → ${ligne} · ${LIBELLE_SPEC[specType].emoji} ${LIBELLE_SPEC[specType].label}` });
                  setMovingPole(null);
                  setMoveTargetLine('');
                }}
              >
                Déplacer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modal modifier pôle ── */}
      <Dialog open={!!editingPole} onOpenChange={open => { if (!open) fermerEditionPole(); }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] sm:max-h-[90vh] flex flex-col gap-0 rounded-3xl border-none shadow-2xl p-0 overflow-hidden">
          <div className="bg-stone-900 p-5 text-white shrink-0">
            <DialogTitle className="text-base font-black uppercase tracking-tight">Modifier le Pôle</DialogTitle>
            <p className="text-stone-400 text-[10px] font-bold uppercase tracking-widest mt-1">Vous pouvez inclure des chiffres (ex: PÔLE 1, ZIPPER #5...)</p>
          </div>
          <div className="p-5 space-y-4 flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-600 uppercase tracking-widest">Nom / Titre du Pôle (Gestion)</Label>
              <Input
                value={editPoleName}
                onChange={e => setEditPoleName(e.target.value)}
                placeholder="Ex: 1. ZIPPER, POLE 2..."
                className="h-11 border-stone-200 bg-white font-bold rounded-xl text-xs uppercase"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') handleSavePole(); }}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-amber-700 uppercase tracking-widest">Nom Commercial en Français (Stock)</Label>
              <Input
                value={editPoleNameFR}
                onChange={e => setEditPoleNameFR(e.target.value)}
                placeholder="Ex: FERMETURES ÉCLAIR 1, TISSUS 2..."
                className="h-11 border-amber-200 bg-amber-50/30 font-bold rounded-xl text-xs uppercase"
                onKeyDown={e => { if (e.key === 'Enter') handleSavePole(); }}
              />
              <p className="text-[9px] text-stone-400 font-medium">Les chiffres et caractères spéciaux sont acceptés dans les deux titres.</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-stone-600 uppercase tracking-widest">
                Ligne Logistique <span className="text-red-600">*</span>
              </Label>
              {/* Spécifications en lecture seule : ce sont celles de la ligne choisie. */}
              <ChoixLigne
                lignes={lignes}
                valeur={editPoleLine}
                onChange={setEditPoleLine}
                specNouvelleLigne={editPoleLineSpec}
                onSpecNouvelleLigne={setEditPoleLineSpec}
              />
              {editingPole && editPoleLine.trim() && (() => {
                const avant = editingPole.specType || 'none';
                const apres = estNouvelleLigne(lignes, editPoleLine) ? editPoleLineSpec : specPourLigne(editPoleLine);
                if (!apres || apres === avant) return null;
                return (
                  <p className="text-[10px] font-bold text-amber-700">
                    Le pôle passera de {LIBELLE_SPEC[avant]?.label ?? avant} à {LIBELLE_SPEC[apres].label}.
                  </p>
                );
              })()}
            </div>

            <div className="pt-3 border-t border-stone-100 space-y-1.5">
              <Label className="text-[10px] font-black text-stone-600 uppercase tracking-widest">Unités du pôle</Label>
              <ChampsUnitesPole
                uniteAchat={editPoleUnites.uniteAchat}
                uniteVente={editPoleUnites.uniteVente}
                onChange={setEditPoleUnites}
              />
            </div>
          </div>
          <div className="flex gap-2 p-4 sm:p-5 bg-stone-50 shrink-0 border-t border-stone-100">
            <Button variant="ghost" className="flex-1 h-10 font-black text-[9px] uppercase tracking-widest" onClick={fermerEditionPole}>Annuler</Button>
            <Button
              className="flex-[1.5] h-10 bg-stone-900 hover:bg-stone-800 text-white font-black text-[9px] uppercase tracking-widest rounded-xl shadow-lg disabled:opacity-40"
              disabled={!editPoleLine.trim() || (estNouvelleLigne(lignes, editPoleLine) && !editPoleLineSpec) || savingPole}
              onClick={handleSavePole}
            >
              Enregistrer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modal spécifications d'une ligne ── */}
      <Dialog open={!!ligneEnEdition} onOpenChange={open => { if (!open) setLigneEnEdition(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] sm:max-h-[90vh] flex flex-col gap-0 rounded-3xl border-none shadow-2xl p-0 overflow-hidden">
          <div className="bg-stone-900 p-5 text-white shrink-0">
            <DialogTitle className="text-base font-black uppercase tracking-tight">Spécifications de la ligne</DialogTitle>
            <p className="text-stone-400 text-[10px] font-bold uppercase tracking-widest mt-1">{ligneEnEdition?.nom}</p>
          </div>
          <div className="p-5 space-y-4 flex-1 min-h-0 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}>
            <p className="text-[10px] font-medium text-stone-500 leading-relaxed">
              Les Spécifications Qualités à donner valent pour toute la ligne : ses{' '}
              {trouverLigne(ligneEnEdition?.nom)?.poles.length ?? 0} pôle(s) et leurs catégories les reçoivent,
              ainsi que tout pôle qui rejoint la ligne.
            </p>
            <ChoixSpec
              valeur={ligneEnEdition?.spec}
              onChange={s => setLigneEnEdition(prev => (prev ? { ...prev, spec: s } : prev))}
            />
          </div>
          <div className="flex gap-2 p-4 sm:p-5 bg-stone-50 shrink-0 border-t border-stone-100">
            <Button variant="ghost" className="flex-1 h-10 font-black text-[9px] uppercase tracking-widest" onClick={() => setLigneEnEdition(null)}>Annuler</Button>
            <Button
              className="flex-[1.5] h-10 bg-stone-900 hover:bg-stone-800 text-white font-black text-[9px] uppercase tracking-widest rounded-xl shadow-lg disabled:opacity-40"
              disabled={!ligneEnEdition || ligneEnCours === ligneEnEdition.nom}
              onClick={async () => {
                if (!ligneEnEdition) return;
                if (await appliquerSpecLigne(ligneEnEdition.nom, ligneEnEdition.spec)) setLigneEnEdition(null);
              }}
            >
              Appliquer à toute la ligne
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
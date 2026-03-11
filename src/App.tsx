import React, { useState, useEffect } from 'react';
import { Moon, Sun, Calculator, RefreshCw, Printer, Package, Wrench, DollarSign, Save, Trash2, Upload, Settings as SettingsIcon, X, LogIn, LogOut, User as UserIcon } from 'lucide-react';
import { auth, db, provider } from './firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { collection, addDoc, deleteDoc, doc, onSnapshot, query, where, orderBy, serverTimestamp } from 'firebase/firestore';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface SavedProduct {
  id: string;
  name: string;
  filamentType: string;
  filamentUsed: number | '';
  spoolPrice: number | '';
  printingTime: number | '';
  componentsCost: number | '';
  toppingCost: number | '';
  packagingCost: number | '';
  otherCost: number | '';
  laborCost: number | '';
  electricityCost: number | '';
  maintenanceCost: number | '';
  markupPercentage: number | '';
  finalPrice: number;
  date: string;
}

const InputField = ({ label, value, onChange, type = "number", placeholder = "", suffix = "" }: any) => (
  <div className="flex flex-col gap-1.5">
    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</label>
    <div className="relative">
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 text-slate-900 dark:text-slate-100 transition-colors"
      />
      {suffix && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 text-sm pointer-events-none">
          {suffix}
        </span>
      )}
    </div>
  </div>
);

const Card = ({ title, icon: Icon, children }: any) => (
  <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden transition-colors">
    <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2 bg-slate-50/50 dark:bg-slate-800/50">
      <Icon className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
      <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{title}</h2>
    </div>
    <div className="p-5 flex flex-col gap-4">
      {children}
    </div>
  </div>
);

export default function App() {
  // State
  const [isDarkMode, setIsDarkMode] = useState(false);
  
  const defaultSettings = {
    spoolPrice: 25000,
    componentsCost: 0,
    toppingCost: 0,
    packagingCost: 500,
    otherCost: 0,
    laborCost: 1000,
    electricityCost: 500,
    maintenanceCost: 200,
    markupPercentage: 50
  };
  
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('calcSettings');
    return saved ? JSON.parse(saved) : defaultSettings;
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [tempSettings, setTempSettings] = useState(settings);
  
  const [productName, setProductName] = useState('');
  const [filamentUsed, setFilamentUsed] = useState<number | ''>('');
  const [filamentType, setFilamentType] = useState('PLA');
  const [spoolPrice, setSpoolPrice] = useState<number | ''>(settings.spoolPrice);
  const [printingTime, setPrintingTime] = useState<number | ''>('');
  
  const [componentsCost, setComponentsCost] = useState<number | ''>(settings.componentsCost || 0);
  const [toppingCost, setToppingCost] = useState<number | ''>(settings.toppingCost || 0);
  const [packagingCost, setPackagingCost] = useState<number | ''>(settings.packagingCost);
  const [otherCost, setOtherCost] = useState<number | ''>(settings.otherCost);
  
  const [laborCost, setLaborCost] = useState<number | ''>(settings.laborCost);
  const [electricityCost, setElectricityCost] = useState<number | ''>(settings.electricityCost);
  const [maintenanceCost, setMaintenanceCost] = useState<number | ''>(settings.maintenanceCost);
  
  const [markupPercentage, setMarkupPercentage] = useState<number | ''>(settings.markupPercentage);

  const [savedProducts, setSavedProducts] = useState<SavedProduct[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAuthReady) return;
    
    if (user) {
      const q = query(
        collection(db, 'products'),
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const productsData: SavedProduct[] = [];
        snapshot.forEach((doc) => {
          productsData.push({ id: doc.id, ...doc.data() } as SavedProduct);
        });
        setSavedProducts(productsData);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'products');
      });
      
      return () => unsubscribe();
    } else {
      setSavedProducts([]);
    }
  }, [user, isAuthReady]);

  // Toggle Dark Mode
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Calculations
  const safeNum = (val: number | '') => (typeof val === 'number' ? val : 0);
  
  const costPerGram = safeNum(spoolPrice) / 1000;
  const materialCost = (safeNum(filamentUsed) / 1000) * safeNum(spoolPrice);
  
  const accessoriesTotal = safeNum(componentsCost) + safeNum(toppingCost) + safeNum(packagingCost) + safeNum(otherCost);
  const machineTotal = safeNum(laborCost) + safeNum(electricityCost) + safeNum(maintenanceCost);
  
  const productionCost = materialCost + accessoriesTotal + machineTotal;
  const markupValue = productionCost * (safeNum(markupPercentage) / 100);
  const finalPrice = productionCost + markupValue;

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(val) + ' Ks';
  };

  const handleReset = () => {
    setProductName('');
    setFilamentUsed('');
    setFilamentType('PLA');
    setPrintingTime('');
    
    setSpoolPrice(settings.spoolPrice);
    setComponentsCost(settings.componentsCost || 0);
    setToppingCost(settings.toppingCost || 0);
    setPackagingCost(settings.packagingCost);
    setOtherCost(settings.otherCost);
    setLaborCost(settings.laborCost);
    setElectricityCost(settings.electricityCost);
    setMaintenanceCost(settings.maintenanceCost);
    setMarkupPercentage(settings.markupPercentage);
  };

  const handleSaveSettings = () => {
    setSettings(tempSettings);
    localStorage.setItem('calcSettings', JSON.stringify(tempSettings));
    setIsSettingsOpen(false);
    
    setSpoolPrice(tempSettings.spoolPrice);
    setComponentsCost(tempSettings.componentsCost || 0);
    setToppingCost(tempSettings.toppingCost || 0);
    setPackagingCost(tempSettings.packagingCost);
    setOtherCost(tempSettings.otherCost);
    setLaborCost(tempSettings.laborCost);
    setElectricityCost(tempSettings.electricityCost);
    setMaintenanceCost(tempSettings.maintenanceCost);
    setMarkupPercentage(tempSettings.markupPercentage);
  };

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const handleSave = async () => {
    if (!user) {
      alert("Please log in to save products.");
      return;
    }
    if (!productName.trim()) {
      alert("Please enter a Product Name before saving.");
      return;
    }
    
    const newProduct = {
      userId: user.uid,
      name: productName,
      filamentType,
      filamentUsed: filamentUsed === '' ? 0 : filamentUsed,
      spoolPrice: spoolPrice === '' ? 0 : spoolPrice,
      printingTime: printingTime === '' ? 0 : printingTime,
      componentsCost: componentsCost === '' ? 0 : componentsCost,
      toppingCost: toppingCost === '' ? 0 : toppingCost,
      packagingCost: packagingCost === '' ? 0 : packagingCost,
      otherCost: otherCost === '' ? 0 : otherCost,
      laborCost: laborCost === '' ? 0 : laborCost,
      electricityCost: electricityCost === '' ? 0 : electricityCost,
      maintenanceCost: maintenanceCost === '' ? 0 : maintenanceCost,
      markupPercentage: markupPercentage === '' ? 0 : markupPercentage,
      finalPrice,
      date: new Date().toLocaleDateString(),
      createdAt: Date.now()
    };
    
    try {
      await addDoc(collection(db, 'products'), newProduct);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'products');
    }
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'products', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `products/${id}`);
    }
  };

  const handleLoad = (p: SavedProduct) => {
    setProductName(p.name);
    setFilamentType(p.filamentType);
    setFilamentUsed(p.filamentUsed);
    setSpoolPrice(p.spoolPrice);
    setPrintingTime(p.printingTime);
    setComponentsCost(p.componentsCost || 0);
    setToppingCost(p.toppingCost || 0);
    setPackagingCost(p.packagingCost);
    setOtherCost(p.otherCost);
    setLaborCost(p.laborCost);
    setElectricityCost(p.electricityCost);
    setMaintenanceCost(p.maintenanceCost);
    setMarkupPercentage(p.markupPercentage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors font-sans text-slate-900 dark:text-slate-100 pb-12">
      {/* Header */}
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calculator className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600 dark:from-indigo-400 dark:to-violet-400">
              3D Print Cost Calc
            </h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            {user ? (
              <div className="flex items-center gap-2 mr-2">
                <img src={user.photoURL || ''} alt="User" className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-700" />
                <button onClick={handleLogout} className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors rounded-full hover:bg-slate-100 dark:hover:bg-slate-700" title="Logout">
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <button onClick={handleLogin} className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 dark:text-indigo-400 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 rounded-full transition-colors mr-2">
                <LogIn className="w-4 h-4" />
                Login to Save
              </button>
            )}
            <button onClick={() => { setTempSettings(settings); setIsSettingsOpen(true); }} className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors rounded-full hover:bg-slate-100 dark:hover:bg-slate-700" title="Settings">
              <SettingsIcon className="w-5 h-5" />
            </button>
            <button onClick={handleReset} className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors rounded-full hover:bg-slate-100 dark:hover:bg-slate-700" title="Reset All">
              <RefreshCw className="w-5 h-5" />
            </button>
            <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors rounded-full hover:bg-slate-100 dark:hover:bg-slate-700" title="Toggle Theme">
              {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Inputs Column */}
          <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-6">
            
            {/* Material Cost */}
            <Card title="Material Cost" icon={Printer}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InputField label="Product Name" value={productName} onChange={setProductName} type="text" placeholder="e.g. Articulated Dragon" />
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Filament Type</label>
                  <select
                    value={filamentType}
                    onChange={(e) => setFilamentType(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 text-slate-900 dark:text-slate-100 transition-colors"
                  >
                    <option value="PLA">PLA</option>
                    <option value="PETG">PETG</option>
                    <option value="ABS">ABS</option>
                    <option value="TPU">TPU</option>
                    <option value="Resin">Resin</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <InputField label="Filament Used" value={filamentUsed} onChange={setFilamentUsed} suffix="g" placeholder="0" />
                <InputField label="Spool Price (1kg)" value={spoolPrice} onChange={setSpoolPrice} suffix="Ks" placeholder="0" />
                <InputField label="Printing Time" value={printingTime} onChange={setPrintingTime} suffix="min" placeholder="0" />
              </div>
              <div className="mt-2 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl flex flex-col sm:flex-row justify-between gap-4 border border-indigo-100 dark:border-indigo-800/30">
                <div>
                  <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium uppercase tracking-wider">Cost Per Gram</p>
                  <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(costPerGram)}</p>
                </div>
                <div>
                  <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium uppercase tracking-wider">Total Material Cost</p>
                  <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(materialCost)}</p>
                </div>
              </div>
            </Card>

            {/* Accessories Cost */}
            <Card title="Accessories Cost" icon={Package}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InputField label="Components Cost" value={componentsCost} onChange={setComponentsCost} suffix="Ks" placeholder="0" />
                <InputField label="Topping Cost" value={toppingCost} onChange={setToppingCost} suffix="Ks" placeholder="0" />
                <InputField label="Packaging" value={packagingCost} onChange={setPackagingCost} suffix="Ks" placeholder="0" />
                <InputField label="Other" value={otherCost} onChange={setOtherCost} suffix="Ks" placeholder="0" />
              </div>
              <div className="mt-2 flex justify-between items-center pt-4 border-t border-slate-100 dark:border-slate-700/50">
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Accessories Total</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(accessoriesTotal)}</span>
              </div>
            </Card>

            {/* Machine Cost */}
            <Card title="Machine Cost" icon={Wrench}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <InputField label="Labor Cost" value={laborCost} onChange={setLaborCost} suffix="Ks" placeholder="0" />
                <InputField label="Electricity" value={electricityCost} onChange={setElectricityCost} suffix="Ks" placeholder="0" />
                <InputField label="Maintenance" value={maintenanceCost} onChange={setMaintenanceCost} suffix="Ks" placeholder="0" />
              </div>
              <div className="mt-2 flex justify-between items-center pt-4 border-t border-slate-100 dark:border-slate-700/50">
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Machine Total</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(machineTotal)}</span>
              </div>
            </Card>

          </div>

          {/* Summary Column */}
          <div className="lg:col-span-5 xl:col-span-4">
            <div className="sticky top-24 flex flex-col gap-6">
              
              {/* Production Cost Summary */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden transition-colors">
                <div className="p-6">
                  <h3 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-4">Production Cost</h3>
                  
                  <div className="space-y-3 mb-6">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600 dark:text-slate-400">Material</span>
                      <span className="font-medium text-slate-900 dark:text-slate-100">{formatCurrency(materialCost)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600 dark:text-slate-400">Accessories</span>
                      <span className="font-medium text-slate-900 dark:text-slate-100">{formatCurrency(accessoriesTotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600 dark:text-slate-400">Machine</span>
                      <span className="font-medium text-slate-900 dark:text-slate-100">{formatCurrency(machineTotal)}</span>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">Total Production Cost</span>
                    <span className="text-xl font-bold text-indigo-600 dark:text-indigo-400">{formatCurrency(productionCost)}</span>
                  </div>
                </div>
              </div>

              {/* Final Selling Price */}
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 dark:from-indigo-950 dark:to-slate-900 rounded-2xl shadow-lg border border-slate-800 dark:border-indigo-900/50 text-white relative overflow-hidden">
                {/* Decorative background element */}
                <div className="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none"></div>
                
                <div className="p-6 relative z-10">
                  <div className="flex items-center gap-2 mb-6">
                    <DollarSign className="w-5 h-5 text-emerald-400" />
                    <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">Final Selling Price</h3>
                  </div>

                  <div className="mb-6">
                    <label className="text-sm font-medium text-slate-300 mb-2 block">Markup Percentage</label>
                    <div className="flex items-center gap-4">
                      <input
                        type="range"
                        min="0"
                        max="500"
                        step="5"
                        value={markupPercentage === '' ? 0 : markupPercentage}
                        onChange={(e) => setMarkupPercentage(Number(e.target.value))}
                        className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                      />
                      <div className="relative w-24">
                        <input
                          type="number"
                          value={markupPercentage}
                          onChange={(e) => setMarkupPercentage(e.target.value === '' ? '' : Number(e.target.value))}
                          className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-center text-white focus:outline-none focus:border-emerald-500"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">%</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 mb-6 pt-6 border-t border-slate-700/50">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Production Cost</span>
                      <span className="font-medium">{formatCurrency(productionCost)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Markup Amount</span>
                      <span className="font-medium text-emerald-400">+{formatCurrency(markupValue)}</span>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-700 flex flex-col gap-1">
                    <span className="text-sm text-slate-400">Recommended Price</span>
                    <span className="text-4xl font-black text-white tracking-tight break-all">{formatCurrency(finalPrice)}</span>
                  </div>

                  <button 
                    onClick={handleSave}
                    className="mt-6 w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2"
                  >
                    <Save className="w-5 h-5" />
                    Save Product
                  </button>
                </div>
              </div>

            </div>
          </div>

        </div>

        {/* Saved Products Section */}
        {user ? (
          savedProducts.length > 0 ? (
            <div className="mt-12 border-t border-slate-200 dark:border-slate-700 pt-10">
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-6 flex items-center gap-2">
                <Save className="w-6 h-6 text-indigo-500 dark:text-indigo-400" />
                Saved Calculations
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {savedProducts.map(product => (
                  <div key={product.id} className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col gap-4 transition-colors">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-semibold text-lg text-slate-900 dark:text-slate-100">{product.name}</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{product.date} • {product.filamentType}</p>
                      </div>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-1 rounded-lg">
                        {formatCurrency(product.finalPrice)}
                      </span>
                    </div>
                    <div className="flex gap-3 mt-auto pt-4 border-t border-slate-100 dark:border-slate-700/50">
                      <button 
                        onClick={() => handleLoad(product)} 
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 rounded-xl text-sm font-medium transition-colors"
                      >
                        <Upload className="w-4 h-4" /> Load
                      </button>
                      <button 
                        onClick={() => handleDelete(product.id)} 
                        className="flex items-center justify-center px-4 py-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-xl transition-colors" 
                        title="Delete"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-12 border-t border-slate-200 dark:border-slate-700 pt-10 text-center">
              <p className="text-slate-500 dark:text-slate-400">No saved products yet. Calculate and save your first product!</p>
            </div>
          )
        ) : (
          <div className="mt-12 border-t border-slate-200 dark:border-slate-700 pt-10 text-center">
            <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl p-8 border border-indigo-100 dark:border-indigo-800/30 max-w-2xl mx-auto">
              <UserIcon className="w-12 h-12 text-indigo-500 dark:text-indigo-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">Cloud Sync Available</h3>
              <p className="text-slate-600 dark:text-slate-400 mb-6">Login with your Google account to save your calculated products to the cloud and access them from any device.</p>
              <button onClick={handleLogin} className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-colors shadow-sm">
                <LogIn className="w-5 h-5" />
                Login to Save Products
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-700 flex flex-col max-h-[90vh]">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
              <div className="flex items-center gap-2">
                <SettingsIcon className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Default Settings</h2>
              </div>
              <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex flex-col gap-4">
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
                Set your default fixed costs here. These will be automatically applied to new calculations.
              </p>
              <InputField label="Default Spool Price (1kg)" value={tempSettings.spoolPrice} onChange={(val: any) => setTempSettings({...tempSettings, spoolPrice: val})} suffix="Ks" />
              <InputField label="Default Components Cost" value={tempSettings.componentsCost} onChange={(val: any) => setTempSettings({...tempSettings, componentsCost: val})} suffix="Ks" />
              <InputField label="Default Topping Cost" value={tempSettings.toppingCost} onChange={(val: any) => setTempSettings({...tempSettings, toppingCost: val})} suffix="Ks" />
              <InputField label="Default Packaging Cost" value={tempSettings.packagingCost} onChange={(val: any) => setTempSettings({...tempSettings, packagingCost: val})} suffix="Ks" />
              <InputField label="Default Other Cost" value={tempSettings.otherCost} onChange={(val: any) => setTempSettings({...tempSettings, otherCost: val})} suffix="Ks" />
              <InputField label="Default Labor Cost" value={tempSettings.laborCost} onChange={(val: any) => setTempSettings({...tempSettings, laborCost: val})} suffix="Ks" />
              <InputField label="Default Electricity Cost" value={tempSettings.electricityCost} onChange={(val: any) => setTempSettings({...tempSettings, electricityCost: val})} suffix="Ks" />
              <InputField label="Default Maintenance Cost" value={tempSettings.maintenanceCost} onChange={(val: any) => setTempSettings({...tempSettings, maintenanceCost: val})} suffix="Ks" />
              <InputField label="Default Markup Percentage" value={tempSettings.markupPercentage} onChange={(val: any) => setTempSettings({...tempSettings, markupPercentage: val})} suffix="%" />
            </div>
            <div className="p-5 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
              <button 
                onClick={handleSaveSettings}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow-sm transition-colors"
              >
                Save & Apply Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

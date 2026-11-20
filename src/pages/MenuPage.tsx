import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, Search, Percent, FolderPlus, X, Upload } from 'lucide-react';
import { Layout } from '../components/Layout';
import { DishImage } from '../components/DishImage';
import { api } from '../api/client';
import { useSocket } from '../context/SocketContext';
import { formatCurrency } from '../utils/format';
import type { Category, MenuItem } from '../types';

const PRESET_IMAGES = [
  { label: 'Starter Plate', url: '/src/assets/images/dish_burrata_starter_1795178821594.jpg' },
  { label: 'Seared Salmon', url: '/src/assets/images/dish_seared_salmon_1795178823192.jpg' },
  { label: 'Truffle Pasta', url: '/src/assets/images/dish_truffle_pasta_1795178825033.jpg' },
  { label: 'Wood-Fired Flatbread', url: '/src/assets/images/dish_woodfired_pizza_1795178824146.jpg' },
  { label: 'Tiramisu Dessert', url: '/src/assets/images/dish_tiramisu_dessert_1795178823665.jpg' },
  { label: 'Craft Beverage', url: '/src/assets/images/dish_craft_beverage_1795178823569.jpg' },
];

export function MenuPage() {
  const { socket, syncVersion } = useSocket();
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [formState, setFormState] = useState({
    name: '',
    description: '',
    price: '',
    categoryId: '',
    imageUrl: PRESET_IMAGES[0].url,
    isVeg: true,
    spiceLevel: 'none' as 'none' | 'mild' | 'medium' | 'hot',
    allergens: '',
    prepTimeMinutes: '12',
    isAvailable: true,
  });

  const [catModalOpen, setCatModalOpen] = useState(false);
  const [catName, setCatName] = useState('');
  const [catOrder, setCatOrder] = useState('5');

  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkCat, setBulkCat] = useState('');
  const [bulkMode, setBulkMode] = useState<'percent' | 'flat'>('percent');
  const [bulkAmount, setBulkAmount] = useState('5');

  const fetchMenu = useCallback(async () => {
    try {
      const data = await api.getMenu();
      setCategories(data.categories);
      setItems(data.items);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMenu();
  }, [fetchMenu, syncVersion]);

  useEffect(() => {
    if (!socket) return;
    const onAvail = (item: MenuItem) => {
      setItems((prev) => prev.map((m) => (m.id === item.id ? item : m)));
    };
    const onMenu = () => fetchMenu();
    socket.on('menu:itemAvailabilityChanged', onAvail);
    socket.on('menu:updated', onMenu);
    return () => {
      socket.off('menu:itemAvailabilityChanged', onAvail);
      socket.off('menu:updated', onMenu);
    };
  }, [socket, fetchMenu]);

  const openCreateItem = () => {
    setEditingItem(null);
    setFormState({
      name: '',
      description: '',
      price: '',
      categoryId: categories[0]?.id || '',
      imageUrl: PRESET_IMAGES[0].url,
      isVeg: true,
      spiceLevel: 'none',
      allergens: '',
      prepTimeMinutes: '12',
      isAvailable: true,
    });
    setItemModalOpen(true);
  };

  const openEditItem = (item: MenuItem) => {
    setEditingItem(item);
    setFormState({
      name: item.name,
      description: item.description,
      price: String(item.price),
      categoryId: item.categoryId,
      imageUrl: item.imageUrl || PRESET_IMAGES[0].url,
      isVeg: item.isVeg,
      spiceLevel: item.spiceLevel,
      allergens: item.allergens.join(', '),
      prepTimeMinutes: String(item.prepTimeMinutes),
      isAvailable: item.isAvailable,
    });
    setItemModalOpen(true);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 150000) {
      toast.error('Please upload an image under 150KB or pick a studio preset.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setFormState((s) => ({ ...s, imageUrl: reader.result as string }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const priceNum = Number(formState.price);
    if (!formState.name.trim() || !Number.isFinite(priceNum) || priceNum <= 0 || !formState.categoryId) {
      toast.error('Please enter a valid dish name, price, and category.');
      return;
    }
    const payload = {
      name: formState.name.trim(),
      description: formState.description.trim(),
      price: priceNum,
      categoryId: formState.categoryId,
      imageUrl: formState.imageUrl.trim(),
      isVeg: formState.isVeg,
      spiceLevel: formState.spiceLevel,
      allergens: formState.allergens
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      prepTimeMinutes: Number(formState.prepTimeMinutes) || 12,
      isAvailable: formState.isAvailable,
    };

    try {
      if (editingItem) {
        const updated = await api.updateMenuItem(editingItem.id, payload);
        setItems((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
        toast.success(`Updated "${updated.name}"`);
      } else {
        const created = await api.createMenuItem(payload);
        setItems((prev) => [...prev, created]);
        toast.success(`Added "${created.name}" to menu`);
      }
      setItemModalOpen(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleToggleAvailability = async (item: MenuItem) => {
    try {
      const updated = await api.toggleMenuItemAvailability(item.id, !item.isAvailable);
      setItems((prev) => prev.map((m) => (m.id === item.id ? updated : m)));
      toast.success(
        `"${updated.name}" is now ${updated.isAvailable ? 'Available' : 'Sold Out'} on all guest menus`
      );
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleDeleteItem = async (item: MenuItem) => {
    try {
      await api.deleteMenuItem(item.id);
      setItems((prev) => prev.filter((m) => m.id !== item.id));
      toast.success(`Removed "${item.name}"`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;
    try {
      const created = await api.createCategory({
        name: catName.trim(),
        sortOrder: Number(catOrder) || 10,
      });
      setCategories((prev) => [...prev, created].sort((a, b) => a.sortOrder - b.sortOrder));
      setCatName('');
      setCatModalOpen(false);
      toast.success(`Created category "${created.name}"`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleBulkPrice = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(bulkAmount);
    if (!Number.isFinite(amount) || amount === 0) {
      toast.error('Enter a non-zero price adjustment.');
      return;
    }
    try {
      const res = await api.bulkPriceUpdate({
        categoryId: bulkCat || undefined,
        mode: bulkMode,
        amount,
      });
      toast.success(`Updated prices on ${res.updatedCount} dishes`);
      setBulkModalOpen(false);
      fetchMenu();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const catMap = new Map(categories.map((c) => [c.id, c.name]));
  const filteredItems = items.filter((i) => {
    if (activeCategory !== 'all' && i.categoryId !== activeCategory) return false;
    const q = search.trim().toLowerCase();
    if (q && !i.name.toLowerCase().includes(q) && !i.description.toLowerCase().includes(q)) {
      return false;
    }
    return true;
  });

  return (
    <Layout
      title="Menu Management"
      subtitle="Toggle live availability, edit dishes, manage categories, and run bulk price adjustments"
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setBulkModalOpen(true)}
            className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Percent className="w-3.5 h-3.5" />
            Bulk Pricing
          </button>
          <button
            type="button"
            onClick={() => setCatModalOpen(true)}
            className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            Category
          </button>
          <button
            type="button"
            onClick={openCreateItem}
            className="px-3.5 py-2 rounded-lg bg-teal-700 text-white text-xs font-semibold hover:bg-teal-800 inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Dish
          </button>
        </div>
      }
    >
      {/* Filters */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setActiveCategory('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
              activeCategory === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-slate-200 text-slate-600'
            }`}
          >
            All ({items.length})
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiveCategory(c.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
                activeCategory === c.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-white border border-slate-200 text-slate-600'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search dishes..."
            aria-label="Search menu items"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
        </div>
      </div>

      {/* Menu Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">Dish</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4 text-right">Price</th>
                <th className="py-3 px-4">Prep</th>
                <th className="py-3 px-4">Live Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400 text-xs">
                    Loading menu...
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400 text-xs">
                    No dishes found.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <DishImage
                          src={item.imageUrl}
                          alt={item.name}
                          className="w-12 h-10 rounded-lg shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 truncate max-w-xs">
                            {item.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {item.isVeg ? 'Veg' : 'Non-Veg'}
                            {item.spiceLevel !== 'none' ? ` · ${item.spiceLevel}` : ''}
                            {item.allergens.length > 0 ? ` · ${item.allergens.join(', ')}` : ''}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      {catMap.get(item.categoryId) || 'Uncategorized'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900 tabular-nums">
                      {formatCurrency(item.price)}
                    </td>
                    <td className="py-3 px-4 text-xs font-mono text-slate-600 tabular-nums">
                      {item.prepTimeMinutes}m
                    </td>
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        onClick={() => handleToggleAvailability(item)}
                        aria-label={`Toggle availability for ${item.name}`}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap ${
                          item.isAvailable
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                            : 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
                        }`}
                      >
                        {item.isAvailable ? 'Available' : 'Sold Out'}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditItem(item)}
                          aria-label={`Edit ${item.name}`}
                          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteItem(item)}
                          aria-label={`Delete ${item.name}`}
                          className="p-2 rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Dish Modal */}
      {itemModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dish-modal-title"
        >
          <form
            onSubmit={handleSaveItem}
            className="bg-white border border-slate-200 rounded-xl w-full max-w-lg p-6 space-y-4 my-8"
          >
            <div className="flex items-center justify-between">
              <h2 id="dish-modal-title" className="text-base font-bold text-slate-900">
                {editingItem ? 'Edit Dish' : 'Add Menu Dish'}
              </h2>
              <button
                type="button"
                onClick={() => setItemModalOpen(false)}
                aria-label="Close dish modal"
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label htmlFor="dish-name" className="block text-xs font-medium text-slate-700 mb-1">
                  Dish Name
                </label>
                <input
                  id="dish-name"
                  required
                  value={formState.name}
                  onChange={(e) => setFormState((s) => ({ ...s, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>

              <div>
                <label htmlFor="dish-cat" className="block text-xs font-medium text-slate-700 mb-1">
                  Category
                </label>
                <select
                  id="dish-cat"
                  value={formState.categoryId}
                  onChange={(e) => setFormState((s) => ({ ...s, categoryId: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="dish-price" className="block text-xs font-medium text-slate-700 mb-1">
                  Price (USD)
                </label>
                <input
                  id="dish-price"
                  type="number"
                  step="0.5"
                  min="0.5"
                  required
                  value={formState.price}
                  onChange={(e) => setFormState((s) => ({ ...s, price: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="dish-desc" className="block text-xs font-medium text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  id="dish-desc"
                  rows={2}
                  value={formState.description}
                  onChange={(e) => setFormState((s) => ({ ...s, description: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>

              <div>
                <label htmlFor="dish-spice" className="block text-xs font-medium text-slate-700 mb-1">
                  Spice Level
                </label>
                <select
                  id="dish-spice"
                  value={formState.spiceLevel}
                  onChange={(e) =>
                    setFormState((s) => ({
                      ...s,
                      spiceLevel: e.target.value as 'none' | 'mild' | 'medium' | 'hot',
                    }))
                  }
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                >
                  <option value="none">None</option>
                  <option value="mild">Mild</option>
                  <option value="medium">Medium</option>
                  <option value="hot">Hot</option>
                </select>
              </div>

              <div>
                <label htmlFor="dish-prep" className="block text-xs font-medium text-slate-700 mb-1">
                  Prep Time (mins)
                </label>
                <input
                  id="dish-prep"
                  type="number"
                  min={1}
                  max={120}
                  value={formState.prepTimeMinutes}
                  onChange={(e) => setFormState((s) => ({ ...s, prepTimeMinutes: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="dish-allergens" className="block text-xs font-medium text-slate-700 mb-1">
                  Allergens (comma-separated)
                </label>
                <input
                  id="dish-allergens"
                  value={formState.allergens}
                  onChange={(e) => setFormState((s) => ({ ...s, allergens: e.target.value }))}
                  placeholder="Dairy, Gluten, Tree Nuts"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>

              <div className="sm:col-span-2 space-y-2">
                <span className="block text-xs font-medium text-slate-700">Dish Photography</span>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_IMAGES.map((p) => (
                    <button
                      key={p.url}
                      type="button"
                      onClick={() => setFormState((s) => ({ ...s, imageUrl: p.url }))}
                      className={`px-2.5 py-1 rounded border text-[11px] font-medium ${
                        formState.imageUrl === p.url
                          ? 'bg-teal-700 border-teal-700 text-white'
                          : 'bg-slate-50 border-slate-200 text-slate-700'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                  <label className="px-2.5 py-1 rounded border border-slate-200 bg-white text-[11px] font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1 cursor-pointer">
                    <Upload className="w-3 h-3" />
                    Upload File
                    <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                  </label>
                </div>
              </div>

              <div className="sm:col-span-2 flex items-center gap-6 pt-1">
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={formState.isVeg}
                    onChange={(e) => setFormState((s) => ({ ...s, isVeg: e.target.checked }))}
                  />
                  Vegetarian
                </label>
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={formState.isAvailable}
                    onChange={(e) => setFormState((s) => ({ ...s, isAvailable: e.target.checked }))}
                  />
                  Available on guest menus
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setItemModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-teal-700 text-white text-xs font-semibold hover:bg-teal-800"
              >
                {editingItem ? 'Save Changes' : 'Create Dish'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Category Modal */}
      {catModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleCreateCategory}
            className="bg-white border border-slate-200 rounded-xl w-full max-w-sm p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">New Menu Category</h2>
              <button
                type="button"
                onClick={() => setCatModalOpen(false)}
                aria-label="Close category modal"
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label htmlFor="cat-name" className="block text-xs font-medium text-slate-700 mb-1">
                Category Name
              </label>
              <input
                id="cat-name"
                required
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                placeholder="Seasonal Specials"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label htmlFor="cat-order" className="block text-xs font-medium text-slate-700 mb-1">
                Sort Order
              </label>
              <input
                id="cat-order"
                type="number"
                value={catOrder}
                onChange={(e) => setCatOrder(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCatModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-teal-700 text-white text-xs font-semibold"
              >
                Add Category
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Bulk Price Update Modal */}
      {bulkModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleBulkPrice}
            className="bg-white border border-slate-200 rounded-xl w-full max-w-sm p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">Bulk Price Adjustment</h2>
              <button
                type="button"
                onClick={() => setBulkModalOpen(false)}
                aria-label="Close bulk price modal"
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label htmlFor="bulk-cat" className="block text-xs font-medium text-slate-700 mb-1">
                Target Category
              </label>
              <select
                id="bulk-cat"
                value={bulkCat}
                onChange={(e) => setBulkCat(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
              >
                <option value="">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="bulk-mode" className="block text-xs font-medium text-slate-700 mb-1">
                  Mode
                </label>
                <select
                  id="bulk-mode"
                  value={bulkMode}
                  onChange={(e) => setBulkMode(e.target.value as 'percent' | 'flat')}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                >
                  <option value="percent">Percent (%)</option>
                  <option value="flat">Flat USD ($)</option>
                </select>
              </div>
              <div>
                <label htmlFor="bulk-amt" className="block text-xs font-medium text-slate-700 mb-1">
                  Delta (+/-)
                </label>
                <input
                  id="bulk-amt"
                  type="number"
                  step="0.5"
                  value={bulkAmount}
                  onChange={(e) => setBulkAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBulkModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-teal-700 text-white text-xs font-semibold"
              >
                Apply Prices
              </button>
            </div>
          </form>
        </div>
      )}
    </Layout>
  );
}

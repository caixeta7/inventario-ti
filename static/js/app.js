const { useState, useEffect, useCallback } = React;

function useDebounce(value, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const [y, m, d] = dateStr.split('-');
    if (y && m && d) return `${d}/${m}/${y}`;
    return dateStr;
  } catch (e) {
    return dateStr;
  }
}

function App() {
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const [sheets, setSheets] = useState([]);
  const [activeSheet, setActiveSheet] = useState('Ativos');

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [globalSearch, setGlobalSearch] = useState(false);

  const [filterOwner, setFilterOwner] = useState('');
  const [filterContrato, setFilterContrato] = useState('');
  const [filterLocalidade, setFilterLocalidade] = useState('');
  const [filterOptions, setFilterOptions] = useState({ owners: [], contratos: [], localidades: [] });

  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState('atualizado_em');
  const [sortDir, setSortDir] = useState('desc');

  const [ativos, setAtivos] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 50, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [syncStatus, setSyncStatus] = useState(null);
  const [formTarget, setFormTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [toast, setToast] = useState(null);

  const [sheetModal, setSheetModal] = useState(null);
  const [deleteSheetTarget, setDeleteSheetTarget] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  const fetchSheets = useCallback(async () => {
    try {
      const res = await fetch('/api/sheets');
      if (res.ok) {
        const data = await res.json();
        setSheets(data);
        if (data.length > 0 && !data.find(s => s.name === activeSheet)) {
          setActiveSheet(data[0].name);
        }
      }
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { fetchSheets(); }, [fetchSheets]);

  useEffect(() => {
    if (globalSearch) return;
    fetch(`/api/filters?sheet=${encodeURIComponent(activeSheet)}`)
      .then(res => res.json())
      .then(data => setFilterOptions(data))
      .catch(err => console.error(err));
  }, [activeSheet, globalSearch]);

  const fetchSyncStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) setSyncStatus(await res.json());
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    fetchSyncStatus();
    const interval = setInterval(fetchSyncStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchSyncStatus]);

  const fetchAtivos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        sheet: activeSheet,
        q: debouncedSearch,
        global: globalSearch ? '1' : '0',
        owner: globalSearch ? '' : filterOwner,
        contrato: globalSearch ? '' : filterContrato,
        localidade: globalSearch ? '' : filterLocalidade,
        page: page.toString(),
        pageSize: '50',
        sortBy,
        sortDir
      });
      const res = await fetch(`/api/ativos?${params.toString()}`);
      if (!res.ok) throw new Error('Falha ao carregar');
      const json = await res.json();
      setAtivos(json.data || []);
      setPagination(json.pagination || { page: 1, pageSize: 50, total: 0, totalPages: 1 });
    } catch (err) {
      setError('Não foi possível carregar os dados.');
    } finally {
      setLoading(false);
    }
  }, [activeSheet, debouncedSearch, globalSearch, filterOwner, filterContrato, filterLocalidade, page, sortBy, sortDir]);

  useEffect(() => { fetchAtivos(); }, [fetchAtivos]);

  const handleSort = (col) => {
    if (sortBy === col) { setSortDir(sortDir === 'asc' ? 'desc' : 'asc'); }
    else { setSortBy(col); setSortDir('asc'); }
  };

  const handleFormSubmit = async (values) => {
    try {
      const isNew = formTarget === 'new';
      const payload = { ...values, sheet_name: activeSheet };
      const url = isNew ? '/api/ativos' : `/api/ativos/${formTarget.id}`;
      const method = isNew ? 'POST' : 'PUT';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Erro'); }
      showToast(isNew ? 'Registro cadastrado!' : 'Registro atualizado!');
      setFormTarget(null);
      fetchAtivos(); fetchSyncStatus();
    } catch (err) { showToast(err.message || 'Falha', 'error'); }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/ativos/${deleteTarget.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erro ao remover');
      showToast('Registro removido!');
      setDeleteTarget(null);
      fetchAtivos(); fetchSyncStatus();
    } catch (err) { showToast(err.message || 'Falha', 'error'); }
  };

  const handleCreateSheet = async (name, displayName) => {
    try {
      const res = await fetch('/api/sheets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, display_name: displayName }) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Erro'); }
      showToast(`Aba "${name}" criada!`);
      setSheetModal(null);
      fetchSheets(); fetchSyncStatus();
      setActiveSheet(name);
    } catch (err) { showToast(err.message, 'error'); }
  };

  const handleRenameSheet = async (oldName, newName, newDisplay) => {
    try {
      const res = await fetch(`/api/sheets/${encodeURIComponent(oldName)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName, display_name: newDisplay }) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Erro'); }
      showToast('Aba atualizada!');
      setSheetModal(null);
      fetchSheets(); fetchSyncStatus();
      if (oldName === activeSheet) setActiveSheet(newName || oldName);
    } catch (err) { showToast(err.message, 'error'); }
  };

  const handleDeleteSheet = async () => {
    if (!deleteSheetTarget) return;
    try {
      const res = await fetch(`/api/sheets/${encodeURIComponent(deleteSheetTarget.name)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erro ao remover aba');
      showToast(`Aba "${deleteSheetTarget.display_name}" removida!`);
      setDeleteSheetTarget(null);
      fetchSheets(); fetchSyncStatus();
      if (deleteSheetTarget.name === activeSheet) {
        const remaining = sheets.filter(s => s.name !== deleteSheetTarget.name);
        setActiveSheet(remaining.length > 0 ? remaining[0].name : '');
      }
    } catch (err) { showToast(err.message || 'Falha', 'error'); }
  };

  const currentSheet = sheets.find(s => s.name === activeSheet);
  const displayLabel = currentSheet ? currentSheet.display_name : activeSheet;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-500/10 text-brand-600 dark:text-brand-500 rounded-xl">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"/></svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">Inventário de TI</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">Gestão multi-abas com sync Excel</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {syncStatus && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-800/50">
                <span className={`w-2 h-2 rounded-full ${syncStatus.pendingCount === 0 && !syncStatus.lastError ? 'bg-emerald-500' : syncStatus.lastError ? 'bg-rose-500' : 'bg-amber-500 animate-pulse'}`} />
                <span className="text-slate-600 dark:text-slate-300">
                  {syncStatus.pendingCount === 0 && !syncStatus.lastError ? 'Sincronizado' : syncStatus.lastError ? 'Erro Sync' : `Sync (${syncStatus.pendingCount})...`}
                </span>
              </div>
            )}
            <button onClick={() => setDarkMode(!darkMode)} className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              {darkMode ? '☀️' : '🌙'}
            </button>
          </div>
        </div>
      </header>

      {/* BARRA DE ABAS */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center gap-2 py-2 overflow-x-auto">
          {sheets.map(sheet => (
            <div key={sheet.name} className="flex items-center group">
              <button
                onClick={() => { setActiveSheet(sheet.name); setPage(1); setGlobalSearch(false); setFilterOwner(''); setFilterContrato(''); setFilterLocalidade(''); setSearch(''); }}
                className={`px-4 py-2 text-xs font-semibold rounded-l-xl whitespace-nowrap transition-all ${activeSheet === sheet.name && !globalSearch ? 'bg-brand-600 text-white' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              >
                {sheet.display_name}
              </button>
              <button
                onClick={() => setSheetModal({ mode: 'edit', sheet })}
                className={`px-1.5 py-2 text-xs rounded-r-xl border-l border-white/20 transition-all ${activeSheet === sheet.name && !globalSearch ? 'bg-brand-600 text-white/80 hover:text-white' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
                title="Editar aba"
              >
                ✎
              </button>
            </div>
          ))}
          <button
            onClick={() => setSheetModal({ mode: 'create' })}
            className="px-3 py-2 text-xs font-semibold text-slate-400 hover:text-brand-600 rounded-xl hover:bg-brand-50 dark:hover:bg-brand-950/30 transition-all whitespace-nowrap"
            title="Nova aba"
          >
            + Aba
          </button>
        </div>
      </div>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 flex flex-col gap-4">

        {/* BUSCA + TOGGLE GLOBAL + BOTÃO NOVO */}
        <div className="bg-white dark:bg-slate-800/80 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-3 justify-between items-stretch sm:items-center">
            <div className="relative flex-1">
              <input
                type="text"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder={globalSearch ? 'Buscar em TODAS as abas...' : `Buscar em ${displayLabel}...`}
                className="w-full pl-4 pr-10 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              />
              {search && <button onClick={() => setSearch('')} className="absolute right-3 top-3 text-slate-400">✕</button>}
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 cursor-pointer">
                <input type="checkbox" checked={globalSearch} onChange={e => { setGlobalSearch(e.target.checked); setPage(1); }} className="rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                Buscar em todas as abas
              </label>
              <button
                onClick={() => setFormTarget('new')}
                disabled={globalSearch}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                + Novo em {displayLabel}
              </button>
            </div>
          </div>

          {/* FILTROS (só em busca local) */}
          {!globalSearch && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100 dark:border-slate-700/50">
              <FilterSelect label="Owner" value={filterOwner} onChange={v => { setFilterOwner(v); setPage(1); }} options={filterOptions.owners} placeholder="Todos os Owners" />
              <FilterSelect label="Contrato" value={filterContrato} onChange={v => { setFilterContrato(v); setPage(1); }} options={filterOptions.contratos} placeholder="Todos os Contratos" />
              <FilterSelect label="Localidade" value={filterLocalidade} onChange={v => { setFilterLocalidade(v); setPage(1); }} options={filterOptions.localidades} placeholder="Todas as Localidades" />
            </div>
          )}
        </div>

        {error && <div className="p-4 rounded-xl bg-rose-50 text-rose-700 text-sm">{error}</div>}

        {/* TABELA */}
        <div className="bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex-1 flex flex-col">
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/40 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {globalSearch && <Th sortKey="sheet_name" currentSort={sortBy} dir={sortDir} onSort={handleSort}>Aba</Th>}
                  <Th sortKey="equipamento" currentSort={sortBy} dir={sortDir} onSort={handleSort}>Equipamento</Th>
                  <Th sortKey="marca" currentSort={sortBy} dir={sortDir} onSort={handleSort}>Marca / Modelo</Th>
                  <Th sortKey="usuario" currentSort={sortBy} dir={sortDir} onSort={handleSort}>Usuário</Th>
                  <Th sortKey="owner" currentSort={sortBy} dir={sortDir} onSort={handleSort}>Owner</Th>
                  <Th sortKey="contrato" currentSort={sortBy} dir={sortDir} onSort={handleSort}>Contrato</Th>
                  <Th sortKey="localidade" currentSort={sortBy} dir={sortDir} onSort={handleSort}>Localidade</Th>
                  <Th sortKey="patrimonio" currentSort={sortBy} dir={sortDir} onSort={handleSort}>Patrimônio</Th>
                  {!globalSearch && <th className="px-4 py-3.5 text-right font-semibold">Ações</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      {Array.from({ length: globalSearch ? 9 : 8 }).map((__, j) => (
                        <td key={j} className="px-4 py-4"><div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-24" /></td>
                      ))}
                    </tr>
                  ))
                ) : ativos.length === 0 ? (
                  <tr>
                    <td colSpan={globalSearch ? 9 : 8} className="px-4 py-12 text-center text-slate-500 dark:text-slate-400">
                      Nenhum registro encontrado {globalSearch ? 'em todas as abas' : 'nesta aba'} com os filtros atuais.
                    </td>
                  </tr>
                ) : (
                  ativos.map((item) => {
                    const itemSheet = sheets.find(s => s.name === item.sheet_name);
                    return (
                      <tr key={item.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                        {globalSearch && <td className="px-4 py-3.5"><span className="px-2 py-1 rounded-md text-xs font-medium bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-400">{itemSheet ? itemSheet.display_name : item.sheet_name}</span></td>}
                        <td className="px-4 py-3.5 font-medium text-slate-900 dark:text-white">
                          <div>{item.equipamento || '—'}</div>
                          {item.hostname && <span className="text-xs text-slate-400 font-mono">{item.hostname}</span>}
                        </td>
                        <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300">
                          <div>{item.marca || '—'}</div>
                          <div className="text-xs text-slate-400">{item.modelo || ''}</div>
                        </td>
                        <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300">
                          <div>{item.usuario || '—'}</div>
                          {item.area && <span className="text-xs text-slate-400">{item.area}</span>}
                        </td>
                        <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300 text-xs">{item.owner || '—'}</td>
                        <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300 text-xs font-mono">{item.contrato || '—'}</td>
                        <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300">{item.localidade || '—'}</td>
                        <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300 font-mono text-xs">{item.patrimonio || '—'}</td>
                        {!globalSearch && (
                          <td className="px-4 py-3.5 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button onClick={() => setFormTarget(item)} className="p-1.5 hover:text-brand-600 rounded-lg transition-colors" title="Editar">📝</button>
                              <button onClick={() => setDeleteTarget(item)} className="p-1.5 hover:text-rose-600 rounded-lg transition-colors" title="Remover">🗑️</button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <div>Total: <span className="font-semibold">{pagination.total}</span> registros {globalSearch && '(todas as abas)'}</div>
            <div className="flex items-center gap-2">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 disabled:opacity-40">Anterior</button>
              <span>{page} / {pagination.totalPages}</span>
              <button disabled={page >= pagination.totalPages} onClick={() => setPage(page + 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 disabled:opacity-40">Próxima</button>
            </div>
          </div>
        </div>
      </main>

      {/* MODAL NOVO/EDITAR ABA */}
      {sheetModal && (
        <SheetModal
          mode={sheetModal.mode}
          sheet={sheetModal.sheet}
          onClose={() => setSheetModal(null)}
          onCreate={handleCreateSheet}
          onRename={handleRenameSheet}
          onDelete={setDeleteSheetTarget}
        />
      )}

      {/* MODAL CONFIRMAÇÃO EXCLUSÃO DE ABA */}
      {deleteSheetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">Remover Aba</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">Tem certeza? Todos os registros da aba "{deleteSheetTarget.display_name}" serão removidos permanentemente, junto com a aba na planilha Excel.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteSheetTarget(null)} className="px-4 py-2 text-sm font-semibold text-slate-600 rounded-xl">Cancelar</button>
              <button onClick={handleDeleteSheet} className="px-4 py-2 text-sm font-semibold text-white bg-rose-600 rounded-xl">Remover tudo</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL FORMULÁRIO ATIVO */}
      {formTarget && (
        <FormModal target={formTarget} activeSheet={activeSheet} onClose={() => setFormTarget(null)} onSubmit={handleFormSubmit} />
      )}

      {/* MODAL CONFIRMAÇÃO EXCLUSÃO ATIVO */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">Confirmar Exclusão</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">Remover "{deleteTarget.equipamento || deleteTarget.patrimonio}" da aba {displayLabel}?</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm font-semibold text-slate-600">Cancelar</button>
              <button onClick={handleConfirmDelete} className="px-4 py-2 text-sm font-semibold text-white bg-rose-600 rounded-xl">Remover</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl shadow-xl text-sm font-semibold text-white ${toast.type === 'error' ? 'bg-rose-600' : 'bg-emerald-600'}`}>{toast.message}</div>
      )}
    </div>
  );
}

function FilterSelect({ label, value, onChange, options, placeholder }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function Th({ children, sortKey, currentSort, dir, onSort }) {
  const isCurrent = currentSort === sortKey;
  return (
    <th onClick={() => onSort(sortKey)} className="px-4 py-3.5 cursor-pointer select-none hover:text-slate-900 dark:hover:text-white">
      <div className="flex items-center gap-1">{children}{isCurrent && <span className="text-brand-500">{dir === 'asc' ? '↑' : '↓'}</span>}</div>
    </th>
  );
}

function SheetModal({ mode, sheet, onClose, onCreate, onRename, onDelete }) {
  const [name, setName] = useState(mode === 'edit' ? sheet.name : '');
  const [displayName, setDisplayName] = useState(mode === 'edit' ? sheet.display_name : '');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (mode === 'create') onCreate(name, displayName || name);
    else onRename(sheet.name, name, displayName);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl max-w-md w-full overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">{mode === 'create' ? 'Nova Aba' : 'Editar Aba'}</h2>
          <button onClick={onClose} className="text-slate-400">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Nome técnico (no Excel)</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="Ex: Ativos2" className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Nome de exibição (na interface)</label>
            <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Ex: Ativos SP" className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white" />
          </div>
          <div className="flex justify-between gap-3 pt-2">
            {mode === 'edit' && onDelete && (
              <button type="button" onClick={() => onDelete(sheet)} className="px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl transition-colors">Remover aba</button>
            )}
            <div className="flex gap-3 ml-auto">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 rounded-xl">Cancelar</button>
              <button type="submit" className="px-5 py-2 text-sm font-semibold text-white bg-brand-600 rounded-xl shadow">Salvar</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function FormModal({ target, activeSheet, onClose, onSubmit }) {
  const isNew = target === 'new';
  const [values, setValues] = useState(() => isNew ? {} : { ...target });
  const [saving, setSaving] = useState(false);
  const handleChange = (k, v) => setValues(prev => ({ ...prev, [k]: v }));
  const handleSubmit = async (e) => { e.preventDefault(); setSaving(true); await onSubmit(values); setSaving(false); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">{isNew ? 'Novo Registro' : 'Editar Registro'}</h2>
          <button onClick={onClose} className="text-slate-400">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input label="Equipamento" value={values.equipamento} onChange={v => handleChange('equipamento', v)} />
            <Input label="Marca" value={values.marca} onChange={v => handleChange('marca', v)} />
            <Input label="Modelo" value={values.modelo} onChange={v => handleChange('modelo', v)} />
            <Input label="Owner" value={values.owner} onChange={v => handleChange('owner', v)} />
            <Input label="Contrato" value={values.contrato} onChange={v => handleChange('contrato', v)} />
            <Input label="Localidade" value={values.localidade} onChange={v => handleChange('localidade', v)} />
            <Input label="Patrimônio" value={values.patrimonio} onChange={v => handleChange('patrimonio', v)} />
            <Input label="Usuário" value={values.usuario} onChange={v => handleChange('usuario', v)} />
            <Input label="Hostname" value={values.hostname} onChange={v => handleChange('hostname', v)} />
            <Input label="Service Tag" value={values.service_tag} onChange={v => handleChange('service_tag', v)} />
            <Input label="Memória" value={values.memoria} onChange={v => handleChange('memoria', v)} />
            <Input label="HD / SSD" value={values.hd} onChange={v => handleChange('hd', v)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input type="date" label="Aquisição" value={values.aquisicao} onChange={v => handleChange('aquisicao', v)} />
            <Input type="date" label="Venc. Garantia" value={values.vencimento_garantia} onChange={v => handleChange('vencimento_garantia', v)} />
            <Input type="date" label="Início Contrato" value={values.inicio_contrato} onChange={v => handleChange('inicio_contrato', v)} />
            <Input type="date" label="Venc. Contrato" value={values.vencimento_contrato} onChange={v => handleChange('vencimento_contrato', v)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Observações</label>
            <textarea rows="3" value={values.observacoes || ''} onChange={e => handleChange('observacoes', e.target.value)} className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white" />
          </div>
          <div className="pt-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600">Cancelar</button>
            <button type="submit" disabled={saving} className="px-5 py-2 text-sm font-semibold text-white bg-brand-600 rounded-xl shadow disabled:opacity-50">{saving ? 'Salvando...' : 'Salvar'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Input({ label, type = "text", value, onChange }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">{label}</label>
      <input type={type} value={value || ''} onChange={e => onChange(e.target.value)} className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white" />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);

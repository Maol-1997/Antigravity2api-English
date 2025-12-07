import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Plus, RefreshCw, Trash2, Power, LogIn, Upload, Download,
    CheckCircle2, XCircle, Search, MoreVertical, AlertCircle, BarChart3, ChevronDown, ChevronUp
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';

export default function Tokens() {
    const { token: adminToken } = useAuth();
    const [tokens, setTokens] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedTokens, setSelectedTokens] = useState(new Set());
    const [manualUrl, setManualUrl] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [message, setMessage] = useState({ type: '', content: '' });
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [expandedQuotas, setExpandedQuotas] = useState(new Set());
    const [quotaData, setQuotaData] = useState({});
    const [loadingQuotas, setLoadingQuotas] = useState(new Set());

    const fetchTokens = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/admin/tokens', {
                headers: { 'X-Admin-Token': adminToken }
            });
            const data = await res.json();

            // Fetch details for names
            if (data.length > 0) {
                const indices = data.map(t => t.index);
                const detailsRes = await fetch('/admin/tokens/details', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Admin-Token': adminToken
                    },
                    body: JSON.stringify({ indices })
                });
                const details = await detailsRes.json();
                const detailsMap = {};
                details.forEach(d => detailsMap[d.index] = d);

                const enrichedTokens = data.map(t => ({
                    ...t,
                    ...detailsMap[t.index]
                }));
                setTokens(enrichedTokens);
            } else {
                setTokens([]);
            }
        } catch (error) {
            console.error('Failed to fetch tokens', error);
            setMessage({ type: 'error', content: 'Failed to load tokens' });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchTokens();
    }, [adminToken]);

    const handleGoogleLogin = async () => {
        setIsLoggingIn(true);
        try {
            const res = await fetch('/admin/tokens/login', {
                method: 'POST',
                headers: { 'X-Admin-Token': adminToken }
            });
            const data = await res.json();
            if (data.success && data.authUrl) {
                window.open(data.authUrl, '_blank');
                setMessage({ type: 'info', content: 'Login page opened, please refresh list after completion' });
                // Auto refresh after 10s
                setTimeout(fetchTokens, 10000);
            } else {
                setMessage({ type: 'error', content: data.message || 'Failed to start login' });
            }
        } catch (error) {
            setMessage({ type: 'error', content: 'Request failed: ' + error.message });
        } finally {
            setIsLoggingIn(false);
        }
    };

    const handleManualAdd = async () => {
        if (!manualUrl) return;
        setIsAdding(true);
        try {
            // Extract code from URL if full URL is pasted
            let code = manualUrl;
            if (manualUrl.includes('code=')) {
                code = new URL(manualUrl).searchParams.get('code');
            }

            const res = await fetch('/admin/tokens/callback', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Admin-Token': adminToken
                },
                body: JSON.stringify({ callbackUrl: manualUrl })
            });
            const data = await res.json();
            if (data.success) {
                setMessage({ type: 'success', content: 'Token added successfully' });
                setManualUrl('');
                fetchTokens();
            } else {
                setMessage({ type: 'error', content: data.error || 'Failed to add' });
            }
        } catch (error) {
            setMessage({ type: 'error', content: 'Request failed: ' + error.message });
        } finally {
            setIsAdding(false);
        }
    };

    const toggleToken = async (index, enable) => {
        try {
            const res = await fetch('/admin/tokens/toggle', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Admin-Token': adminToken
                },
                body: JSON.stringify({ index, enable })
            });
            if (res.ok) {
                fetchTokens();
            }
        } catch (error) {
            console.error('Toggle failed', error);
        }
    };

    const deleteToken = async (index) => {
        if (!confirm('Are you sure you want to delete this token?')) return;
        try {
            const res = await fetch(`/admin/tokens/${index}`, {
                method: 'DELETE',
                headers: { 'X-Admin-Token': adminToken }
            });
            if (res.ok) {
                fetchTokens();
                const newSelected = new Set(selectedTokens);
                newSelected.delete(index);
                setSelectedTokens(newSelected);
            }
        } catch (error) {
            console.error('Delete failed', error);
        }
    };

    const toggleSelection = (index) => {
        const newSelected = new Set(selectedTokens);
        if (newSelected.has(index)) {
            newSelected.delete(index);
        } else {
            newSelected.add(index);
        }
        setSelectedTokens(newSelected);
    };

    const selectAll = () => {
        if (selectedTokens.size === tokens.length) {
            setSelectedTokens(new Set());
        } else {
            setSelectedTokens(new Set(tokens.map(t => t.index)));
        }
    };

    const exportTokens = async () => {
        if (selectedTokens.size === 0) return alert('Please select accounts to export first');
        setIsExporting(true);
        try {
            const res = await fetch('/admin/tokens/export', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Admin-Token': adminToken
                },
                body: JSON.stringify({ indices: Array.from(selectedTokens) })
            });
            if (res.ok) {
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `tokens_export_${new Date().toISOString().slice(0, 10)}.zip`;
                a.click();
            }
        } catch (error) {
            console.error('Export failed', error);
        } finally {
            setIsExporting(false);
        }
    };

    const importTokens = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.zip';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            setIsImporting(true);
            const formData = new FormData();
            formData.append('file', file);

            try {
                const res = await fetch('/admin/tokens/import', {
                    method: 'POST',
                    headers: { 'X-Admin-Token': adminToken },
                    body: formData
                });
                const data = await res.json();
                if (data.success) {
                    setMessage({ type: 'success', content: `Successfully imported ${data.count} tokens` });
                    fetchTokens();
                } else {
                    setMessage({ type: 'error', content: data.error || 'Import failed' });
                }
            } catch (error) {
                setMessage({ type: 'error', content: 'Import failed: ' + error.message });
            } finally {
                setIsImporting(false);
            }
        };
        input.click();
    };

    const toggleQuota = async (index) => {
        const newExpanded = new Set(expandedQuotas);
        if (newExpanded.has(index)) {
            newExpanded.delete(index);
            setExpandedQuotas(newExpanded);
        } else {
            newExpanded.add(index);
            setExpandedQuotas(newExpanded);
            // Load quota if not loaded
            if (!quotaData[index]) {
                await loadQuota(index);
            }
        }
    };

    const loadQuota = async (index, forceRefresh = false) => {
        const newLoading = new Set(loadingQuotas);
        newLoading.add(index);
        setLoadingQuotas(newLoading);

        try {
            const url = forceRefresh
                ? `/admin/tokens/${index}/quotas?refresh=true`
                : `/admin/tokens/${index}/quotas`;
            const res = await fetch(url, {
                headers: { 'X-Admin-Token': adminToken }
            });
            const data = await res.json();
            if (data.success) {
                setQuotaData(prev => ({
                    ...prev,
                    [index]: data.data
                }));
            } else {
                setMessage({ type: 'error', content: `Failed to load quota: ${data.error}` });
            }
        } catch (error) {
            setMessage({ type: 'error', content: `Failed to load quota: ${error.message}` });
        } finally {
            const updatedLoading = new Set(loadingQuotas);
            updatedLoading.delete(index);
            setLoadingQuotas(updatedLoading);
        }
    };

    const getQuotaColor = (remaining) => {
        if (remaining > 0.5) return 'bg-emerald-500';
        if (remaining > 0.2) return 'bg-amber-500';
        return 'bg-red-500';
    };

    const getQuotaBgColor = (remaining) => {
        if (remaining > 0.5) return 'bg-emerald-100';
        if (remaining > 0.2) return 'bg-amber-100';
        return 'bg-red-100';
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-2">
                <div>
                    <h2 className="text-2xl font-semibold text-zinc-900 tracking-tight">Token Management</h2>
                    <p className="text-base text-zinc-500 mt-1">Manage Google OAuth accounts and Access Tokens</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={fetchTokens}
                        className="p-2.5 text-zinc-600 hover:bg-zinc-100 rounded-lg transition-colors"
                        title="Refresh list"
                    >
                        <RefreshCw className={cn("w-5 h-5", isLoading && "animate-spin")} />
                    </button>
                </div>
            </div>

            {/* Actions Card */}
            <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm space-y-6">
                <div className="flex flex-wrap gap-4">
                    <button
                        onClick={handleGoogleLogin}
                        disabled={isLoggingIn}
                        className="flex items-center gap-2 px-5 py-2.5 bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-700 font-medium rounded-xl transition-all shadow-sm hover:shadow-md text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoggingIn ? (
                            <RefreshCw className="w-4 h-4 text-blue-600 animate-spin" />
                        ) : (
                            <LogIn className="w-4 h-4 text-blue-600" />
                        )}
                        {isLoggingIn ? 'Loading...' : 'Google Login'}
                    </button>
                    <div className="w-px h-10 bg-zinc-200 hidden md:block" />
                    <button
                        onClick={exportTokens}
                        disabled={isExporting}
                        className="flex items-center gap-2 px-5 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-700 font-medium rounded-xl transition-colors text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isExporting ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                            <Download className="w-4 h-4" />
                        )}
                        {isExporting ? 'Exporting...' : 'Export Selected'}
                    </button>
                    <button
                        onClick={importTokens}
                        disabled={isImporting}
                        className="flex items-center gap-2 px-5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-medium rounded-xl transition-colors text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isImporting ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                            <Upload className="w-4 h-4" />
                        )}
                        {isImporting ? 'Importing...' : 'Import'}
                    </button>
                </div>

                <div className="flex gap-3 items-center">
                    <input
                        type="text"
                        value={manualUrl}
                        onChange={(e) => setManualUrl(e.target.value)}
                        placeholder="Paste callback URL to add manually..."
                        className="flex-1 px-4 py-2.5 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-900 outline-none transition-all text-sm placeholder:text-zinc-400"
                    />
                    <button
                        onClick={handleManualAdd}
                        disabled={!manualUrl || isAdding}
                        className="px-6 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                        {isAdding ? 'Adding...' : 'Add'}
                    </button>
                </div>

                <AnimatePresence>
                    {message.content && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className={cn(
                                "flex items-center gap-2 p-3 rounded-lg text-sm font-medium",
                                message.type === 'error' ? "bg-red-50 text-red-600 border border-red-100" :
                                    message.type === 'success' ? "bg-emerald-50 text-emerald-600 border border-emerald-100" :
                                        "bg-blue-50 text-blue-600 border border-blue-100"
                            )}
                        >
                            <AlertCircle className="w-4 h-4" />
                            {message.content}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Token List */}
            <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/30">
                    <div className="flex items-center gap-3">
                        <input
                            type="checkbox"
                            checked={tokens.length > 0 && selectedTokens.size === tokens.length}
                            onChange={selectAll}
                            className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                        />
                        <span className="text-sm font-medium text-zinc-600">Select all ({selectedTokens.size})</span>
                    </div>
                    <div className="text-sm text-zinc-400">Total {tokens.length} accounts</div>
                </div>

                {tokens.length === 0 ? (
                    <div className="p-12 text-center text-zinc-400">
                        {isLoading ? 'Loading...' : 'No token accounts'}
                    </div>
                ) : (
                    <div className="divide-y divide-zinc-100">
                        {tokens.map((t) => (
                            <motion.div
                                key={t.index}
                                layout
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className={cn(
                                    "p-5 hover:bg-zinc-50/50 transition-colors group",
                                    selectedTokens.has(t.index) && "bg-zinc-50"
                                )}
                            >
                                <div className="flex items-start gap-5">
                                    <div className="pt-1">
                                        <input
                                            type="checkbox"
                                            checked={selectedTokens.has(t.index)}
                                            onChange={() => toggleSelection(t.index)}
                                            className="w-4 h-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                                        />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-3 mb-1.5">
                                            <h3 className="font-semibold text-zinc-900 truncate text-base">{t.name || 'Unknown'}</h3>
                                            {t.enable ? (
                                                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium flex items-center gap-1">
                                                    <CheckCircle2 className="w-3 h-3" /> Enabled
                                                </span>
                                            ) : (
                                                <span className="px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 text-xs font-medium flex items-center gap-1">
                                                    <XCircle className="w-3 h-3" /> Disabled
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-zinc-500 mb-3">{t.email || 'No Email'}</p>
                                        <div className="bg-zinc-50 rounded-lg px-3 py-2 text-xs font-mono text-zinc-600 truncate max-w-2xl border border-zinc-200/50">
                                            {t.access_token}
                                        </div>
                                        <div className="flex items-center gap-4 mt-3 text-xs text-zinc-400">
                                            <span>Created: {t.created}</span>
                                            <span>Expires: {t.expires_in}s</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => toggleQuota(t.index)}
                                            className="p-2.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                            title="View Quota"
                                        >
                                            <BarChart3 className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => toggleToken(t.index, !t.enable)}
                                            className={cn(
                                                "p-2.5 rounded-lg transition-colors",
                                                t.enable ? "text-amber-600 hover:bg-amber-50" : "text-emerald-600 hover:bg-emerald-50"
                                            )}
                                            title={t.enable ? "Disable" : "Enable"}
                                        >
                                            <Power className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => deleteToken(t.index)}
                                            className="p-2.5 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                            title="Delete"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                {/* Quota Panel */}
                                <AnimatePresence>
                                    {expandedQuotas.has(t.index) && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="mt-4 ml-9 overflow-hidden"
                                        >
                                            <div className="bg-zinc-50 rounded-xl p-4 border border-zinc-200">
                                                <div className="flex items-center justify-between mb-3">
                                                    <h4 className="text-sm font-semibold text-zinc-700 flex items-center gap-2">
                                                        <BarChart3 className="w-4 h-4" />
                                                        Model Quotas
                                                    </h4>
                                                    <button
                                                        onClick={() => loadQuota(t.index, true)}
                                                        disabled={loadingQuotas.has(t.index)}
                                                        className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                                                    >
                                                        <RefreshCw className={cn("w-3 h-3", loadingQuotas.has(t.index) && "animate-spin")} />
                                                        Refresh
                                                    </button>
                                                </div>

                                                {loadingQuotas.has(t.index) ? (
                                                    <div className="flex items-center justify-center py-8">
                                                        <RefreshCw className="w-5 h-5 text-zinc-400 animate-spin" />
                                                        <span className="ml-2 text-sm text-zinc-500">Loading quotas...</span>
                                                    </div>
                                                ) : quotaData[t.index] ? (
                                                    <div className="space-y-3">
                                                        {Object.entries(quotaData[t.index].models).length === 0 ? (
                                                            <p className="text-sm text-zinc-500 text-center py-4">No quota information available</p>
                                                        ) : (
                                                            Object.entries(quotaData[t.index].models)
                                                                .sort(([a], [b]) => a.localeCompare(b))
                                                                .map(([modelId, data]) => (
                                                                    <div key={modelId} className="space-y-1">
                                                                        <div className="flex items-center justify-between text-xs">
                                                                            <span className="font-medium text-zinc-700 truncate max-w-[200px]" title={modelId}>
                                                                                {modelId}
                                                                            </span>
                                                                            <span className="text-zinc-500 flex items-center gap-2">
                                                                                <span className={cn(
                                                                                    "font-semibold",
                                                                                    data.remaining > 0.5 ? "text-emerald-600" :
                                                                                    data.remaining > 0.2 ? "text-amber-600" : "text-red-600"
                                                                                )}>
                                                                                    {(data.remaining * 100).toFixed(1)}%
                                                                                </span>
                                                                                <span className="text-zinc-400">|</span>
                                                                                <span>Reset: {data.resetTime}</span>
                                                                            </span>
                                                                        </div>
                                                                        <div className={cn("h-2 rounded-full overflow-hidden", getQuotaBgColor(data.remaining))}>
                                                                            <div
                                                                                className={cn("h-full rounded-full transition-all duration-300", getQuotaColor(data.remaining))}
                                                                                style={{ width: `${(data.remaining * 100).toFixed(1)}%` }}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                ))
                                                        )}
                                                        {quotaData[t.index].lastUpdated && (
                                                            <p className="text-xs text-zinc-400 mt-3 pt-2 border-t border-zinc-200">
                                                                Last updated: {new Date(quotaData[t.index].lastUpdated).toLocaleString()}
                                                            </p>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <p className="text-sm text-zinc-500 text-center py-4">Click refresh to load quota data</p>
                                                )}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

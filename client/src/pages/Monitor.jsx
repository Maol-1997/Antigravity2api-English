import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Activity, Cpu, HardDrive, Clock, Zap, RefreshCw, Pause, Play } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';

export default function Monitor() {
    const { token: adminToken } = useAuth();
    const [stats, setStats] = useState({
        cpu: 0,
        memory: { used: 0, total: 0, percentage: 0 },
        uptime: 0,
        requests: 0,
        status: 'idle',
        idleTime: 0
    });
    const [isLoading, setIsLoading] = useState(true);
    const [autoRefresh, setAutoRefresh] = useState(false);

    const fetchStats = async () => {
        setIsLoading(true);
        try {
            const [monitorRes, keyStatsRes] = await Promise.all([
                fetch('/admin/status', { headers: { 'X-Admin-Token': adminToken } }),
                fetch('/admin/keys/stats', { headers: { 'X-Admin-Token': adminToken } })
            ]);

            const monitor = await monitorRes.json();
            const keyStats = await keyStatsRes.json();

            setStats({
                cpu: monitor.cpu || 0,
                memory: {
                    percentage: monitor.memoryPercent || 0,
                    display: `${monitor.memory} / ${monitor.totalSystemMemory}`,
                    heap: `${monitor.heapUsed} / ${monitor.heapTotal}`
                },
                uptime: monitor.uptime || '0s',
                requests: keyStats.totalRequests || 0,
                status: monitor.idle === 'Idle mode' ? 'idle' : 'busy',
                idleTime: monitor.idleTime || 0
            });
        } catch (error) {
            console.error('Failed to fetch monitor stats', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchStats();
    }, [adminToken]);

    useEffect(() => {
        let interval;
        if (autoRefresh) {
            interval = setInterval(fetchStats, 5000);
        }
        return () => clearInterval(interval);
    }, [autoRefresh, adminToken]);

    const formatUptime = (seconds) => {
        const d = Math.floor(seconds / (3600 * 24));
        const h = Math.floor((seconds % (3600 * 24)) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        return `${d}d ${h}h ${m}m ${s}s`;
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-semibold text-zinc-900 tracking-tight">System Monitor</h2>
                    <p className="text-zinc-500">Real-time monitoring of server resources and status</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-lg transition-colors font-medium text-sm border",
                            autoRefresh
                                ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                                : "bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                        )}
                    >
                        {autoRefresh ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        {autoRefresh ? 'Auto-refreshing' : 'Auto Refresh'}
                    </button>
                    <button
                        onClick={fetchStats}
                        className="p-2 text-zinc-600 hover:bg-zinc-100 rounded-lg transition-colors border border-transparent hover:border-zinc-200"
                    >
                        <RefreshCw className={cn("w-5 h-5", isLoading && "animate-spin")} />
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <MonitorCard
                    title="CPU Usage"
                    value={`${stats.cpu}%`}
                    icon={Cpu}
                    color="text-blue-600"
                    bg="bg-blue-50 border-blue-100"
                />
                <MonitorCard
                    title="Memory Usage"
                    value={`${stats.memory.percentage}%`}
                    subtext={stats.memory.display}
                    icon={HardDrive}
                    color="text-purple-600"
                    bg="bg-purple-50 border-purple-100"
                />
                <MonitorCard
                    title="Uptime"
                    value={stats.uptime}
                    icon={Clock}
                    color="text-emerald-600"
                    bg="bg-emerald-50 border-emerald-100"
                    className="text-lg"
                />
                <MonitorCard
                    title="Total Requests"
                    value={stats.requests}
                    icon={Activity}
                    color="text-orange-600"
                    bg="bg-orange-50 border-orange-100"
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm">
                    <h3 className="font-semibold text-zinc-900 mb-4 flex items-center gap-2 text-base">
                        <Zap className="w-5 h-5 text-zinc-900" />
                        Server Status
                    </h3>
                    <div className="flex items-center gap-4">
                        <div className={cn(
                            "w-4 h-4 rounded-full animate-pulse",
                            stats.status === 'busy' ? "bg-amber-500" : "bg-emerald-500"
                        )} />
                        <span className="text-lg font-medium capitalize text-zinc-900">{stats.status === 'busy' ? 'Busy' : 'Idle'}</span>
                        <span className="text-zinc-400 text-sm ml-auto font-mono">Idle time: {stats.idleTime}s</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

function MonitorCard({ title, value, subtext, icon: Icon, color, bg, className }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl border border-zinc-200 p-6 shadow-sm hover:shadow-md transition-shadow"
        >
            <div className="flex justify-between items-start mb-4">
                <div className={`p-3 rounded-xl border ${bg} ${color}`}>
                    <Icon className="w-6 h-6" />
                </div>
            </div>
            <h3 className="text-zinc-500 text-sm font-medium mb-1">{title}</h3>
            <div className={cn("text-2xl font-bold text-zinc-900 mb-1 tracking-tight", className)}>{value}</div>
            {subtext && <div className="text-xs text-zinc-400 font-mono">{subtext}</div>}
        </motion.div>
    );
}

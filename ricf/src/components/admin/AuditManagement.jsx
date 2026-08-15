import React, { useState, useEffect } from 'react';
import { Download, Search, Calendar, Users, Activity, BarChart3, Database, Trash2, Settings } from 'lucide-react';
import { apiUrl } from '../../config/api';

const AuditManagement = () => {
    const [auditLogs, setAuditLogs] = useState([]);
    const [auditFiles, setAuditFiles] = useState([]);
    const [statistics, setStatistics] = useState({});
    const [cleanupStats, setCleanupStats] = useState({});
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('logs');
    const [filters, setFilters] = useState({
        startDate: '',
        endDate: '',
        userId: '',
        action: '',
        page: 1,
        limit: 50
    });
    const [searchQuery, setSearchQuery] = useState('');
    const [retentionDays, setRetentionDays] = useState(365);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        if (activeTab === 'logs') {
            fetchAuditLogs();
        } else if (activeTab === 'files') {
            fetchAuditFiles();
        } else if (activeTab === 'statistics') {
            fetchStatistics();
        } else if (activeTab === 'cleanup') {
            fetchCleanupStats();
        }
    }, [activeTab, filters]);

    const getAuthHeaders = () => {
        const token = localStorage.getItem('token');
        return {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
    };

    const fetchAuditLogs = async () => {
        setLoading(true);
        setError('');
        try {
            const queryParams = new URLSearchParams();
            Object.entries(filters).forEach(([key, value]) => {
                if (value) queryParams.append(key, value);
            });

            console.log('Fetching audit logs with params:', queryParams.toString());
            const response = await fetch(`${apiUrl}/audit/logs?${queryParams}`, {
                headers: getAuthHeaders()
            });

            console.log('Response status:', response.status);
            if (response.ok) {
                const data = await response.json();
                console.log('Audit logs data:', data);
                setAuditLogs(data.logs || []);
            } else {
                const errorText = await response.text();
                console.error('Failed to fetch audit logs:', response.status, errorText);
                setError(`Failed to fetch audit logs: ${response.status} ${errorText}`);
            }
        } catch (error) {
            console.error('Error fetching audit logs:', error);
            setError(`Error fetching audit logs: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const fetchAuditFiles = async () => {
        setLoading(true);
        setError('');
        try {
            const response = await fetch(`${apiUrl}/audit/files`, {
                headers: getAuthHeaders()
            });

            console.log('Files response status:', response.status);
            if (response.ok) {
                const data = await response.json();
                console.log('Audit files data:', data);
                setAuditFiles(data);
            } else {
                const errorText = await response.text();
                console.error('Failed to fetch audit files:', response.status, errorText);
                setError(`Failed to fetch audit files: ${response.status} ${errorText}`);
            }
        } catch (error) {
            console.error('Error fetching audit files:', error);
            setError(`Error fetching audit files: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const fetchStatistics = async () => {
        setLoading(true);
        setError('');
        try {
            const response = await fetch(`${apiUrl}/audit/statistics?days=30`, {
                headers: getAuthHeaders()
            });

            console.log('Statistics response status:', response.status);
            if (response.ok) {
                const data = await response.json();
                console.log('Statistics data:', data);
                setStatistics(data);
            } else {
                const errorText = await response.text();
                console.error('Failed to fetch statistics:', response.status, errorText);
                setError(`Failed to fetch statistics: ${response.status} ${errorText}`);
            }
        } catch (error) {
            console.error('Error fetching statistics:', error);
            setError(`Error fetching statistics: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const fetchCleanupStats = async () => {
        setLoading(true);
        setError('');
        try {
            const response = await fetch(`${apiUrl}/audit/cleanup/stats`, {
                headers: getAuthHeaders()
            });

            console.log('Cleanup stats response status:', response.status);
            if (response.ok) {
                const data = await response.json();
                console.log('Cleanup stats data:', data);
                setCleanupStats(data.data || {});
            } else {
                const errorText = await response.text();
                console.error('Failed to fetch cleanup stats:', response.status, errorText);
                setError(`Failed to fetch cleanup stats: ${response.status} ${errorText}`);
            }
        } catch (error) {
            console.error('Error fetching cleanup stats:', error);
            setError(`Error fetching cleanup stats: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const downloadAllLogs = async () => {
        try {
            const queryParams = new URLSearchParams();
            if (filters.startDate) queryParams.append('startDate', filters.startDate);
            if (filters.endDate) queryParams.append('endDate', filters.endDate);
            if (filters.userId) queryParams.append('userId', filters.userId);
            if (filters.action) queryParams.append('action', filters.action);
            queryParams.append('format', 'txt');

            const response = await fetch(`${apiUrl}/audit/download?${queryParams}`, {
                headers: getAuthHeaders()
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `audit_trail_${new Date().toISOString().split('T')[0]}.txt`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                setSuccess('Audit logs downloaded successfully');
            } else {
                setError('Failed to download audit logs');
            }
        } catch (error) {
            setError('Error downloading audit logs');
        }
    };

    const downloadFile = async (filename) => {
        try {
            const response = await fetch(`${apiUrl}/audit/files/${filename}`, {
                headers: getAuthHeaders()
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                setSuccess(`File ${filename} downloaded successfully`);
            } else {
                setError('Failed to download file');
            }
        } catch (error) {
            setError('Error downloading file');
        }
    };

    const searchLogs = async () => {
        if (!searchQuery.trim()) {
            setError('Please enter a search query');
            return;
        }

        setLoading(true);
        try {
            const queryParams = new URLSearchParams();
            queryParams.append('query', searchQuery);
            if (filters.startDate) queryParams.append('startDate', filters.startDate);
            if (filters.endDate) queryParams.append('endDate', filters.endDate);

            const response = await fetch(`${apiUrl}/audit/search?${queryParams}`, {
                headers: getAuthHeaders()
            });

            if (response.ok) {
                const data = await response.json();
                setAuditLogs(data.results);
                setSuccess(`Found ${data.count} matching results`);
            } else {
                setError('Failed to search audit logs');
            }
        } catch (error) {
            setError('Error searching audit logs');
        } finally {
            setLoading(false);
        }
    };

    const performCleanup = async () => {
        if (!confirm(`Are you sure you want to cleanup audit logs older than ${retentionDays} days? This action cannot be undone.`)) {
            return;
        }

        setLoading(true);
        try {
            const response = await fetch(`${apiUrl}/audit/cleanup`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ retentionDays })
            });

            if (response.ok) {
                const data = await response.json();
                setSuccess(data.message);
                fetchCleanupStats();
            } else {
                const errorData = await response.json();
                setError(errorData.error || 'Failed to cleanup audit logs');
            }
        } catch (error) {
            setError('Error performing cleanup');
        } finally {
            setLoading(false);
        }
    };

    const updateRetentionPolicy = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${apiUrl}/audit/retention-policy`, {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({ retentionDays })
            });

            if (response.ok) {
                const data = await response.json();
                setSuccess(data.message);
                fetchCleanupStats();
            } else {
                const errorData = await response.json();
                setError(errorData.error || 'Failed to update retention policy');
            }
        } catch (error) {
            setError('Error updating retention policy');
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleString();
    };

    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <div className="p-6 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 min-h-screen">
            <div className="max-w-7xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">Audit Trail Management</h1>
                        <p className="text-gray-600 mt-2">Comprehensive audit logging and compliance monitoring</p>
                    </div>
                    <button
                        onClick={downloadAllLogs}
                        className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 flex items-center space-x-2 transition-colors shadow-lg"
                    >
                        <Download size={20} />
                        <span>Download All Logs (.txt)</span>
                    </button>
                </div>

                {/* Status Messages */}
                {error && (
                    <div className="bg-red-100 border border-red-400 text-red-700 p-4 rounded-lg mb-6 flex justify-between">
                        <span>{error}</span>
                        <button onClick={() => setError('')} className="font-bold">×</button>
                    </div>
                )}
                {success && (
                    <div className="bg-green-100 border border-green-400 text-green-700 p-4 rounded-lg mb-6 flex justify-between">
                        <span>{success}</span>
                        <button onClick={() => setSuccess('')} className="font-bold">×</button>
                    </div>
                )}

                {/* Tab Navigation */}
                <div className="bg-white rounded-lg shadow-lg mb-6">
                    <div className="border-b border-gray-200">
                        <nav className="flex space-x-8 px-6">
                            {[
                                { id: 'logs', name: 'Audit Logs', icon: Activity },
                                { id: 'files', name: 'Log Files', icon: Database },
                                { id: 'statistics', name: 'Statistics', icon: BarChart3 },
                                { id: 'cleanup', name: 'Cleanup & Retention', icon: Settings }
                            ].map(tab => {
                                const Icon = tab.icon;
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                                            activeTab === tab.id
                                                ? 'border-blue-500 text-blue-600'
                                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                        }`}
                                    >
                                        <Icon size={18} />
                                        <span>{tab.name}</span>
                                    </button>
                                );
                            })}
                        </nav>
                    </div>
                </div>

                {/* Tab Content */}
                <div className="bg-white rounded-lg shadow-lg">
                    {/* Audit Logs Tab */}
                    {activeTab === 'logs' && (
                        <div className="p-6">
                            {/* Filters */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
                                    <input
                                        type="datetime-local"
                                        value={filters.startDate}
                                        onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
                                    <input
                                        type="datetime-local"
                                        value={filters.endDate}
                                        onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">User ID</label>
                                    <input
                                        type="text"
                                        placeholder="Filter by user ID"
                                        value={filters.userId}
                                        onChange={(e) => setFilters(prev => ({ ...prev, userId: e.target.value }))}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Action</label>
                                    <input
                                        type="text"
                                        placeholder="Filter by action"
                                        value={filters.action}
                                        onChange={(e) => setFilters(prev => ({ ...prev, action: e.target.value }))}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                </div>
                            </div>

                            {/* Search */}
                            <div className="flex gap-4 mb-6">
                                <div className="flex-1">
                                    <input
                                        type="text"
                                        placeholder="Search in audit logs..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                </div>
                                <button
                                    onClick={searchLogs}
                                    className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 flex items-center space-x-2"
                                >
                                    <Search size={18} />
                                    <span>Search</span>
                                </button>
                                <button
                                    onClick={fetchAuditLogs}
                                    className="bg-gray-600 text-white px-6 py-2 rounded-lg hover:bg-gray-700"
                                >
                                    Clear
                                </button>
                            </div>

                            {/* Audit Logs Table */}
                            {loading ? (
                                <div className="text-center py-12">
                                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                                    <p className="mt-2 text-gray-600">Loading audit logs...</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-4 py-3 text-left font-medium text-gray-700">Timestamp</th>
                                                <th className="px-4 py-3 text-left font-medium text-gray-700">User</th>
                                                <th className="px-4 py-3 text-left font-medium text-gray-700">Role</th>
                                                <th className="px-4 py-3 text-left font-medium text-gray-700">Action</th>
                                                <th className="px-4 py-3 text-left font-medium text-gray-700">Details</th>
                                                <th className="px-4 py-3 text-left font-medium text-gray-700">IP Address</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200">
                                            {auditLogs.length === 0 ? (
                                                <tr>
                                                    <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
                                                        No audit logs found
                                                    </td>
                                                </tr>
                                            ) : (
                                                auditLogs.map((log, index) => (
                                                    <tr key={index} className="hover:bg-gray-50">
                                                        <td className="px-4 py-3 text-gray-900">{formatDate(log.created_at)}</td>
                                                        <td className="px-4 py-3 text-gray-900">{log.user_name}</td>
                                                        <td className="px-4 py-3">
                                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                                                log.user_role === 'superadmin' ? 'bg-red-100 text-red-800' :
                                                                log.user_role === 'admin' ? 'bg-orange-100 text-orange-800' :
                                                                'bg-blue-100 text-blue-800'
                                                            }`}>
                                                                {log.user_role}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-gray-900 font-medium">{log.action}</td>
                                                        <td className="px-4 py-3 text-gray-600 max-w-xs truncate" title={log.details}>
                                                            {log.details}
                                                        </td>
                                                        <td className="px-4 py-3 text-gray-600">{log.ip_address}</td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Log Files Tab */}
                    {activeTab === 'files' && (
                        <div className="p-6">
                            <div className="mb-6">
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">Daily Audit Log Files</h3>
                                <p className="text-gray-600">Download individual daily audit log files</p>
                            </div>

                            {loading ? (
                                <div className="text-center py-12">
                                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                                    <p className="mt-2 text-gray-600">Loading log files...</p>
                                </div>
                            ) : (
                                <div className="grid gap-4">
                                    {auditFiles.length === 0 ? (
                                        <div className="text-center py-12 text-gray-500">
                                            No audit log files found
                                        </div>
                                    ) : (
                                        auditFiles.map((file, index) => (
                                            <div key={index} className="border border-gray-200 rounded-lg p-4 flex items-center justify-between hover:bg-gray-50">
                                                <div className="flex-1">
                                                    <h4 className="font-medium text-gray-900">{file.filename}</h4>
                                                    <div className="text-sm text-gray-600 mt-1">
                                                        <span>Size: {formatFileSize(file.size)}</span>
                                                        <span className="mx-2">•</span>
                                                        <span>Modified: {formatDate(file.modified)}</span>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => downloadFile(file.filename)}
                                                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center space-x-2 text-sm"
                                                >
                                                    <Download size={16} />
                                                    <span>Download</span>
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Statistics Tab */}
                    {activeTab === 'statistics' && (
                        <div className="p-6">
                            <div className="mb-6">
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">Audit Statistics</h3>
                                <p className="text-gray-600">Activity overview for the last 30 days</p>
                            </div>

                            {loading ? (
                                <div className="text-center py-12">
                                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                                    <p className="mt-2 text-gray-600">Loading statistics...</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {/* Total Actions */}
                                    <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg p-6 text-white">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-blue-100">Total Actions</p>
                                                <p className="text-3xl font-bold">{statistics.totalActions || 0}</p>
                                            </div>
                                            <Activity size={32} className="text-blue-200" />
                                        </div>
                                    </div>

                                    {/* Actions by Role */}
                                    <div className="bg-white border border-gray-200 rounded-lg p-6">
                                        <h4 className="font-semibold text-gray-900 mb-4">Actions by Role</h4>
                                        <div className="space-y-2">
                                            {statistics.actionsByRole?.map((item, index) => (
                                                <div key={index} className="flex justify-between">
                                                    <span className="text-gray-600">{item.user_role}</span>
                                                    <span className="font-medium">{item.count}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Most Active Users */}
                                    <div className="bg-white border border-gray-200 rounded-lg p-6">
                                        <h4 className="font-semibold text-gray-900 mb-4">Most Active Users</h4>
                                        <div className="space-y-2">
                                            {statistics.mostActiveUsers?.slice(0, 5).map((user, index) => (
                                                <div key={index} className="flex justify-between text-sm">
                                                    <span className="text-gray-600 truncate">{user.user_name}</span>
                                                    <span className="font-medium">{user.count}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Top Actions */}
                                    <div className="bg-white border border-gray-200 rounded-lg p-6 md:col-span-2">
                                        <h4 className="font-semibold text-gray-900 mb-4">Top Actions</h4>
                                        <div className="grid grid-cols-2 gap-4">
                                            {statistics.topActions?.slice(0, 8).map((action, index) => (
                                                <div key={index} className="flex justify-between text-sm">
                                                    <span className="text-gray-600 truncate">{action.action}</span>
                                                    <span className="font-medium">{action.count}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Daily Activity */}
                                    <div className="bg-white border border-gray-200 rounded-lg p-6">
                                        <h4 className="font-semibold text-gray-900 mb-4">Recent Daily Activity</h4>
                                        <div className="space-y-2">
                                            {statistics.dailyActivity?.slice(0, 7).map((day, index) => (
                                                <div key={index} className="flex justify-between text-sm">
                                                    <span className="text-gray-600">{new Date(day.date).toLocaleDateString()}</span>
                                                    <span className="font-medium">{day.count}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Cleanup & Retention Tab */}
                    {activeTab === 'cleanup' && (
                        <div className="p-6">
                            <div className="mb-6">
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">Cleanup & Retention Management</h3>
                                <p className="text-gray-600">Manage audit log retention and perform cleanup operations</p>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Current Statistics */}
                                <div className="bg-white border border-gray-200 rounded-lg p-6">
                                    <h4 className="font-semibold text-gray-900 mb-4">Current Storage Status</h4>
                                    {loading ? (
                                        <div className="text-center py-8">
                                            <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">Database Records:</span>
                                                <span className="font-medium">{cleanupStats.database?.totalRecords || 0}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">Log Files:</span>
                                                <span className="font-medium">{cleanupStats.files?.totalFiles || 0}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">Total File Size:</span>
                                                <span className="font-medium">{formatFileSize(cleanupStats.files?.totalSize || 0)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">Retention Period:</span>
                                                <span className="font-medium">{cleanupStats.retentionDays || 365} days</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">Oldest Record:</span>
                                                <span className="font-medium text-sm">
                                                    {cleanupStats.database?.oldestRecord ? 
                                                        formatDate(cleanupStats.database.oldestRecord) : 'None'}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Cleanup Operations */}
                                <div className="bg-white border border-gray-200 rounded-lg p-6">
                                    <h4 className="font-semibold text-gray-900 mb-4">Cleanup Operations</h4>
                                    
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Retention Period (days)
                                            </label>
                                            <input
                                                type="number"
                                                min="30"
                                                max="3650"
                                                value={retentionDays}
                                                onChange={(e) => setRetentionDays(parseInt(e.target.value))}
                                                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            />
                                            <p className="text-xs text-gray-500 mt-1">Minimum 30 days, maximum 10 years</p>
                                        </div>

                                        <div className="flex space-x-3">
                                            <button
                                                onClick={updateRetentionPolicy}
                                                disabled={loading}
                                                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center space-x-2"
                                            >
                                                <Settings size={16} />
                                                <span>Update Policy</span>
                                            </button>
                                            
                                            <button
                                                onClick={performCleanup}
                                                disabled={loading}
                                                className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center justify-center space-x-2"
                                            >
                                                <Trash2 size={16} />
                                                <span>Manual Cleanup</span>
                                            </button>
                                        </div>

                                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                                            <p className="text-sm text-yellow-800">
                                                <strong>Warning:</strong> Manual cleanup will permanently delete audit logs older than the specified retention period. This action cannot be undone.
                                            </p>
                                        </div>

                                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                            <p className="text-sm text-blue-800">
                                                <strong>Automatic Cleanup:</strong> The system automatically performs cleanup daily at 2:00 AM and checks disk space weekly.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AuditManagement;

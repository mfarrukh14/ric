import React, { useState, useEffect } from 'react';
import { DownloadSimple as Download, MagnifyingGlass as Search, Calendar, UsersThree as Users, Pulse as Activity, ChartBar as BarChart3, Database, Trash as Trash2, GearSix as Settings } from '@phosphor-icons/react';
import { apiUrl } from '../../config/api';
import { confirmDialog } from '../../lib/confirm';

import { formatDate, formatDateTime } from '../../lib/time';
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

            const response = await fetch(`${apiUrl}/audit/logs?${queryParams}`, {
                headers: getAuthHeaders()
            });

            if (response.ok) {
                const data = await response.json();
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

            if (response.ok) {
                const data = await response.json();
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

            if (response.ok) {
                const data = await response.json();
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

            if (response.ok) {
                const data = await response.json();
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
                setSuccess('Audit logs downloaded');
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
                setSuccess(`File ${filename} downloaded`);
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
        if (!(await confirmDialog(`Are you sure you want to cleanup audit logs older than ${retentionDays} days? This action cannot be undone.`))) {
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



    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <div>
            <div>
                <div className="flex justify-end mb-5">
                    <button
                        onClick={downloadAllLogs}
                        className="ui-btn ui-btn--secondary"
                    >
                        <Download size={17} />
                        <span>Download all logs (.txt)</span>
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
                    <div className="bg-green-100 border border-green-400 p-4 rounded-lg mb-6 flex justify-between">
                        <span>{success}</span>
                        <button onClick={() => setSuccess('')} className="font-bold">×</button>
                    </div>
                )}

                {/* Tab Navigation */}
                <div className="ui-panel mb-6">
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
                <div className="ui-panel">
                    {/* Audit Logs Tab */}
                    {activeTab === 'logs' && (
                        <div className="p-6">
                            {/* Filters */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                                <div>
                                    <label className="ui-label block mb-2">Start date</label>
                                    <input
                                        type="datetime-local"
                                        value={filters.startDate}
                                        onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
                                        className="ui-input"
                                    />
                                </div>
                                <div>
                                    <label className="ui-label block mb-2">End date</label>
                                    <input
                                        type="datetime-local"
                                        value={filters.endDate}
                                        onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
                                        className="ui-input"
                                    />
                                </div>
                                <div>
                                    <label className="ui-label block mb-2">User ID</label>
                                    <input
                                        type="text"
                                        placeholder="Filter by user ID"
                                        value={filters.userId}
                                        onChange={(e) => setFilters(prev => ({ ...prev, userId: e.target.value }))}
                                        className="ui-input"
                                    />
                                </div>
                                <div>
                                    <label className="ui-label block mb-2">Action</label>
                                    <input
                                        type="text"
                                        placeholder="Filter by action"
                                        value={filters.action}
                                        onChange={(e) => setFilters(prev => ({ ...prev, action: e.target.value }))}
                                        className="ui-input"
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
                                        className="ui-input"
                                    />
                                </div>
                                <button
                                    onClick={searchLogs}
                                    className="ui-btn ui-btn--primary"
                                >
                                    <Search size={18} />
                                    <span>Search</span>
                                </button>
                                <button
                                    onClick={fetchAuditLogs}
                                    className="ui-btn ui-btn--primary"
                                >
                                    Clear
                                </button>
                            </div>

                            {/* Audit Logs Table */}
                            {loading ? (
                                <div className="text-center py-12">
                                    <div className="ui-spin inline-block"></div>
                                    <p className="mt-2 text-gray-600">Loading audit logs...</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="ui-table">
                                        <thead>
                                            <tr>
                                                <th className="text-left">Timestamp</th>
                                                <th className="text-left">User</th>
                                                <th className="text-left">Role</th>
                                                <th className="text-left">Action</th>
                                                <th className="text-left">Details</th>
                                                <th className="text-left">IP address</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {auditLogs.length === 0 ? (
                                                <tr>
                                                    <td colSpan="6" className="text-center">
                                                        No audit logs found
                                                    </td>
                                                </tr>
                                            ) : (
                                                auditLogs.map((log, index) => (
                                                    <tr key={index} className="hover:bg-gray-50">
                                                        <td>{formatDateTime(log.created_at)}</td>
                                                        <td>{log.user_name}</td>
                                                        <td>
                                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                                                log.user_role === 'superadmin' ? 'bg-red-100 text-red-800' :
                                                                log.user_role === 'admin' ? 'bg-orange-100 text-orange-800' :
                                                                'bg-blue-100 text-blue-800'
                                                            }`}>
                                                                {log.user_role}
                                                            </span>
                                                        </td>
                                                        <td>{log.action}</td>
                                                        <td className="max-w-xs truncate" title={log.details}>
                                                            {log.details}
                                                        </td>
                                                        <td>{log.ip_address}</td>
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
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">Daily audit log files</h3>
                                <p className="text-gray-600">Download individual daily audit log files</p>
                            </div>

                            {loading ? (
                                <div className="text-center py-12">
                                    <div className="ui-spin inline-block"></div>
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
                                            <div key={index} className="ui-card flex items-center justify-between">
                                                <div className="flex-1">
                                                    <h4 className="font-medium text-gray-900">{file.filename}</h4>
                                                    <div className="text-sm text-gray-600 mt-1">
                                                        <span>Size: {formatFileSize(file.size)}</span>
                                                        <span className="mx-2">•</span>
                                                        <span>Modified: {formatDateTime(file.modified)}</span>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => downloadFile(file.filename)}
                                                    className="ui-btn ui-btn--secondary"
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
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">Audit statistics</h3>
                                <p className="text-gray-600">Activity overview for the last 30 days</p>
                            </div>

                            {loading ? (
                                <div className="text-center py-12">
                                    <div className="ui-spin inline-block"></div>
                                    <p className="mt-2 text-gray-600">Loading statistics...</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {/* Total Actions */}
                                    <div className="ui-callout">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-blue-100">Total Actions</p>
                                                <p className="text-3xl font-bold">{statistics.totalActions || 0}</p>
                                            </div>
                                            <Activity size={32} className="text-blue-200" />
                                        </div>
                                    </div>

                                    {/* Actions by Role */}
                                    <div className="ui-panel ui-panel--pad">
                                        <h4 className="font-semibold text-gray-900 mb-4">Actions by role</h4>
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
                                    <div className="ui-panel ui-panel--pad">
                                        <h4 className="font-semibold text-gray-900 mb-4">Most active users</h4>
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
                                    <div className="ui-panel ui-panel--pad md:col-span-2">
                                        <h4 className="font-semibold text-gray-900 mb-4">Top actions</h4>
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
                                    <div className="ui-panel ui-panel--pad">
                                        <h4 className="font-semibold text-gray-900 mb-4">Recent daily activity</h4>
                                        <div className="space-y-2">
                                            {statistics.dailyActivity?.slice(0, 7).map((day, index) => (
                                                <div key={index} className="flex justify-between text-sm">
                                                    <span className="text-gray-600">{formatDate(day.date)}</span>
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
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">Cleanup & retention management</h3>
                                <p className="text-gray-600">Manage audit log retention and perform cleanup operations</p>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Current Statistics */}
                                <div className="ui-panel ui-panel--pad">
                                    <h4 className="font-semibold text-gray-900 mb-4">Current storage status</h4>
                                    {loading ? (
                                        <div className="text-center py-8">
                                            <div className="ui-spin inline-block"></div>
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
                                                        formatDateTime(cleanupStats.database.oldestRecord) : 'None'}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Cleanup Operations */}
                                <div className="ui-panel ui-panel--pad">
                                    <h4 className="font-semibold text-gray-900 mb-4">Cleanup operations</h4>
                                    
                                    <div className="space-y-4">
                                        <div>
                                            <label className="ui-label block mb-2">
                                                Retention period (days)
                                            </label>
                                            <input
                                                type="number"
                                                min="30"
                                                max="3650"
                                                value={retentionDays}
                                                onChange={(e) => setRetentionDays(parseInt(e.target.value))}
                                                className="ui-input"
                                            />
                                            <p className="text-xs text-gray-500 mt-1">Minimum 30 days, maximum 10 years</p>
                                        </div>

                                        <div className="flex space-x-3">
                                            <button
                                                onClick={updateRetentionPolicy}
                                                disabled={loading}
                                                className="ui-btn ui-btn--primary flex-1"
                                            >
                                                <Settings size={16} />
                                                <span>Update policy</span>
                                            </button>
                                            
                                            <button
                                                onClick={performCleanup}
                                                disabled={loading}
                                                className="ui-btn ui-btn--danger-solid flex-1"
                                            >
                                                <Trash2 size={16} />
                                                <span>Manual cleanup</span>
                                            </button>
                                        </div>

                                        <div className="ui-callout ui-callout--warning">
                                            <p className="text-sm text-yellow-800">
                                                <strong>Warning:</strong> Manual cleanup will permanently delete audit logs older than the specified retention period. This action cannot be undone.
                                            </p>
                                        </div>

                                        <div className="ui-callout">
                                            <p className="text-sm">
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

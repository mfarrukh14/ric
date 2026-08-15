import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiUrl } from '../../config/api';
import GrievanceManagement from './GrievanceManagement';

const SupplierDashboard = () => {
    const [supplier, setSupplier] = useState(null);
    const [activeTenders, setActiveTenders] = useState([]);
    const [myBids, setMyBids] = useState([]);
    const [activeTab, setActiveTab] = useState('overview');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [stats, setStats] = useState({
        totalTenders: 0,
        activeBids: 0,
        wonBids: 0,
        pendingBids: 0
    });
    const navigate = useNavigate();

    // Fetch data function
    const fetchData = useCallback(async () => {
        try {
            setError('');
            // Check for both regular token and supplier token
            const token = localStorage.getItem('token') || localStorage.getItem('supplierToken');
            
            console.log('🔍 SupplierDashboard: fetchData called with token:', token ? 'exists' : 'missing');
            
            if (!token) {
                console.log('❌ No token found in localStorage');
                return { error: 'no-token' };
            }

            console.log('📤 Making API calls to fetch tenders and bids...');
            const [tendersResponse, bidsResponse] = await Promise.all([
                fetch(`${apiUrl}/suppliers/tenders/active`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }),
                fetch(`${apiUrl}/suppliers/bids/my-bids`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                })
            ]);

            console.log('📥 API responses:', {
                tenders: tendersResponse.status,
                bids: bidsResponse.status
            });

            // Handle 403 Forbidden specifically
            if (tendersResponse.status === 403 || bidsResponse.status === 403) {
                console.log('🚫 403 Forbidden - Token might be invalid or expired');
                return { error: 'forbidden' };
            }

            if (!tendersResponse.ok || !bidsResponse.ok) {
                console.error('❌ API responses failed:', {
                    tendersStatus: tendersResponse.status,
                    bidsStatus: bidsResponse.status
                });
                
                // For other errors, still try to show something rather than failing completely
                if (tendersResponse.status >= 500 || bidsResponse.status >= 500) {
                    setError('Server error. Some data may not be available.');
                    return { error: 'server-error', partial: true };
                }
                
                throw new Error('Failed to fetch data');
            }

            const [tendersData, bidsData] = await Promise.all([
                tendersResponse.json(),
                bidsResponse.json()
            ]);

            console.log('📊 Received data:', {
                tendersCount: Array.isArray(tendersData) ? tendersData.length : 'not array',
                bidsCount: Array.isArray(bidsData) ? bidsData.length : 'not array'
            });

            // Ensure data is in array format
            const tendersArray = Array.isArray(tendersData) ? tendersData : [];
            const bidsArray = Array.isArray(bidsData) ? bidsData : [];

            setActiveTenders(tendersArray);
            setMyBids(bidsArray);
            
            // Calculate stats
            const wonBids = bidsArray.filter(bid => bid.tender_status === 'awarded' && bid.awarded_supplier_id === bid.supplier_id).length;
            const pendingBids = bidsArray.filter(bid => bid.tender_status === 'active' && new Date(bid.bidding_end_time) <= new Date()).length;
            const activeBids = bidsArray.filter(bid => bid.tender_status === 'active' && new Date(bid.bidding_end_time) > new Date()).length;
            
            setStats({
                totalTenders: tendersArray.length,
                activeBids,
                wonBids,
                pendingBids
            });
            
            console.log('✅ Data successfully loaded and state updated');
            return { success: true };
        } catch (err) {
            console.error('❌ fetchData error:', err);
            setError('Failed to load dashboard data: ' + err.message);
            return { error: err.message };
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const initializeComponent = async () => {
            console.log('🔵 SupplierDashboard: Initializing component...');
            
            // Check for user data in localStorage (could be from regular login or supplier login)
            const storedUser = localStorage.getItem('user');
            const storedSupplier = localStorage.getItem('supplier');
            const hasToken = localStorage.getItem('token') || localStorage.getItem('supplierToken');
            
            console.log('🔍 SupplierDashboard: Checking auth state:', {
                hasStoredUser: !!storedUser,
                hasStoredSupplier: !!storedSupplier,
                hasToken: !!hasToken
            });
            
            if (storedUser) {
                try {
                    const userData = JSON.parse(storedUser);
                    if (userData.role === 'supplier') {
                        console.log('✅ SupplierDashboard: Valid supplier user found');
                        setSupplier(userData);
                        
                        // Only fetch data if we have a token
                        if (hasToken) {
                            const result = await fetchData();
                            if (result.error === 'no-token') {
                                console.log('❌ SupplierDashboard: No token found, clearing auth');
                                localStorage.removeItem('user');
                                localStorage.removeItem('supplier');
                                localStorage.removeItem('token');
                                localStorage.removeItem('supplierToken');
                                navigate('/login');
                                return;
                            } else if (result.error === 'forbidden') {
                                console.log('🚫 SupplierDashboard: 403 Forbidden - Session expired or invalid');
                                setError('Your session has expired. Please login again.');
                                localStorage.removeItem('user');
                                localStorage.removeItem('supplier');
                                localStorage.removeItem('token');
                                localStorage.removeItem('supplierToken');
                                // Don't navigate immediately to avoid loops, let user click login
                                setLoading(false);
                                return;
                            }
                        } else {
                            console.log('❌ SupplierDashboard: No auth token found');
                            setError('Authentication token not found. Please login again.');
                            setLoading(false);
                        }
                    } else {
                        console.log('❌ SupplierDashboard: User is not a supplier, redirecting');
                        navigate('/dashboard');
                        return;
                    }
                } catch (err) {
                    console.error('❌ SupplierDashboard: Error parsing user data:', err);
                    setError('Invalid session data. Please login again.');
                    setLoading(false);
                }
            } else if (storedSupplier) {
                // Handle supplier login data
                try {
                    const supplierData = JSON.parse(storedSupplier);
                    const supplierUser = {
                        ...supplierData,
                        role: 'supplier'
                    };
                    console.log('✅ SupplierDashboard: Valid supplier data found');
                    setSupplier(supplierUser);
                    
                    // Only fetch data if we have a token
                    if (hasToken) {
                        const result = await fetchData();
                        if (result.error === 'no-token') {
                            console.log('❌ SupplierDashboard: No token found, clearing auth');
                            localStorage.removeItem('user');
                            localStorage.removeItem('supplier');
                            localStorage.removeItem('token');
                            localStorage.removeItem('supplierToken');
                            navigate('/login');
                            return;
                        } else if (result.error === 'forbidden') {
                            console.log('🚫 SupplierDashboard: 403 Forbidden - Session expired or invalid');
                            setError('Your session has expired. Please login again.');
                            localStorage.removeItem('user');
                            localStorage.removeItem('supplier');
                            localStorage.removeItem('token');
                            localStorage.removeItem('supplierToken');
                            // Don't navigate immediately to avoid loops, let user click login
                            setLoading(false);
                            return;
                        }
                    } else {
                        console.log('❌ SupplierDashboard: No auth token found');
                        setError('Authentication token not found. Please login again.');
                        setLoading(false);
                    }
                } catch (err) {
                    console.error('❌ SupplierDashboard: Error parsing supplier data:', err);
                    setError('Invalid session data. Please login again.');
                    setLoading(false);
                }
            } else {
                console.log('❌ SupplierDashboard: No user data found, redirecting to login');
                navigate('/login');
                return;
            }
        };

        // Add a small delay to prevent rapid re-renders and navigation throttling
        const timeoutId = setTimeout(initializeComponent, 100);
        
        return () => clearTimeout(timeoutId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Empty dependency array intentionally - we only want this to run once on mount

    // Refresh function using the memoized fetchData
    const setup2FA = useCallback(async () => {
        try {
            const token = localStorage.getItem('token') || localStorage.getItem('supplierToken');
            const response = await fetch(`${apiUrl}/auth/2fa/setup`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to setup 2FA');
            }
            
            const data = await response.json();
            // Handle 2FA setup response (QR code, etc.)
            console.log('2FA setup data:', data);
            // You might want to open a modal or navigate to a 2FA setup page
        } catch (err) {
            setError(`Failed to setup 2FA: ${err.message}`);
        }
    }, []);

    // Tab navigation helper
    const tabs = [
        { id: 'overview', name: 'Overview', icon: '📊' },
        { id: 'tenders', name: 'Active Tenders', icon: '📋', count: activeTenders.length },
        { id: 'bids', name: 'My Bids', icon: '💼', count: myBids.length },
        { id: 'grievances', name: 'Grievances', icon: '⚖️' },
        { id: 'security', name: 'Security', icon: '🔒' }
    ];

    // Stats cards component
    const StatsCard = ({ title, value, subtitle, color, icon }) => (
        <div className={`bg-gradient-to-r ${color} rounded-xl p-6 text-white shadow-lg`}>
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold opacity-90">{title}</h3>
                    <p className="text-3xl font-bold mt-2">{value}</p>
                    {subtitle && <p className="text-sm opacity-80 mt-1">{subtitle}</p>}
                </div>
                <div className="text-4xl opacity-80">{icon}</div>
            </div>
        </div>
    );

    // Overview tab content
    const OverviewContent = () => (
        <div className="space-y-6">
            {/* Welcome Section */}
            <div className="bg-white rounded-xl shadow-sm p-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900">Welcome back, {supplier?.company_name || 'Supplier'}!</h2>
                        <p className="text-gray-600 mt-1">Here's your business overview</p>
                    </div>
                    <div className="text-right">
                        <p className="text-sm text-gray-500">Last updated</p>
                        <p className="text-sm font-medium text-gray-900">{new Date().toLocaleDateString()}</p>
                    </div>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatsCard 
                    title="Active Tenders" 
                    value={stats.totalTenders} 
                    subtitle="Available opportunities"
                    color="from-blue-500 to-blue-600"
                    icon="📋"
                />
                <StatsCard 
                    title="Active Bids" 
                    value={stats.activeBids} 
                    subtitle="Awaiting results"
                    color="from-yellow-500 to-yellow-600"
                    icon="⏳"
                />
                <StatsCard 
                    title="Won Bids" 
                    value={stats.wonBids} 
                    subtitle="Successful awards"
                    color="from-green-500 to-green-600"
                    icon="🏆"
                />
                <StatsCard 
                    title="Under Review" 
                    value={stats.pendingBids} 
                    subtitle="Pending evaluation"
                    color="from-purple-500 to-purple-600"
                    icon="🔍"
                />
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <button
                        onClick={() => setActiveTab('tenders')}
                        className="p-4 border-2 border-dashed border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors text-center"
                    >
                        <div className="text-2xl mb-2">📋</div>
                        <p className="font-medium text-gray-900">Browse Tenders</p>
                        <p className="text-sm text-gray-500">View available opportunities</p>
                    </button>
                    <button
                        onClick={() => setActiveTab('bids')}
                        className="p-4 border-2 border-dashed border-gray-200 rounded-lg hover:border-green-300 hover:bg-green-50 transition-colors text-center"
                    >
                        <div className="text-2xl mb-2">💼</div>
                        <p className="font-medium text-gray-900">My Bids</p>
                        <p className="text-sm text-gray-500">Track your submissions</p>
                    </button>
                    <button
                        onClick={() => setActiveTab('security')}
                        className="p-4 border-2 border-dashed border-gray-200 rounded-lg hover:border-purple-300 hover:bg-purple-50 transition-colors text-center"
                    >
                        <div className="text-2xl mb-2">🔒</div>
                        <p className="font-medium text-gray-900">Security</p>
                        <p className="text-sm text-gray-500">Manage account security</p>
                    </button>
                </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-white rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h3>
                <div className="space-y-4">
                    {myBids.slice(0, 3).map((bid) => (
                        <div key={bid.id} className="flex items-center space-x-4 p-3 bg-gray-50 rounded-lg">
                            <div className="flex-shrink-0">
                                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                                    <span className="text-blue-600 font-semibold">📝</span>
                                </div>
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-medium text-gray-900">
                                    Bid submitted for {bid.item_name}
                                </p>
                                <p className="text-sm text-gray-500">
                                    {new Date(bid.created_at).toLocaleDateString()}
                                </p>
                            </div>
                            <div className="flex-shrink-0">
                                {getBidStatus(bid)}
                            </div>
                        </div>
                    ))}
                    {myBids.length === 0 && (
                        <p className="text-gray-500 text-center py-4">No recent activity</p>
                    )}
                </div>
            </div>
        </div>
    );

    // Security tab content
    const SecurityContent = () => (
        <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Account Security</h3>
                
                {/* 2FA Setup */}
                <div className="border rounded-lg p-4 mb-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="font-medium text-gray-900">Two-Factor Authentication</h4>
                            <p className="text-sm text-gray-500">Add an extra layer of security to your account</p>
                        </div>
                        <button
                            onClick={setup2FA}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                        >
                            Setup 2FA
                        </button>
                    </div>
                </div>

                {/* Password Change */}
                <div className="border rounded-lg p-4 mb-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="font-medium text-gray-900">Password</h4>
                            <p className="text-sm text-gray-500">Change your account password</p>
                        </div>
                        <button className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                            Change Password
                        </button>
                    </div>
                </div>

                {/* Login History */}
                <div className="border rounded-lg p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h4 className="font-medium text-gray-900">Login History</h4>
                            <p className="text-sm text-gray-500">View your recent login activity</p>
                        </div>
                        <button className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                            View History
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

    const refreshData = useCallback(async () => {
        setLoading(true);
        const result = await fetchData();
        if (result.error === 'no-token') {
            navigate('/');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fetchData]);

    // Optimized handler functions
    const handleBidClick = useCallback((tender) => {
        const existingBid = myBids.find(bid => bid.tender_id === tender.id);
        if (existingBid) {
            setError('You have already submitted a bid for this tender. Bids cannot be modified once submitted.');
            return;
        }
        navigate(`/supplier/apply-bid/${tender.id}`);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [myBids]); // Remove navigate from dependencies to prevent infinite loop

    const clearError = useCallback(() => {
        setError('');
    }, []);

    // Optimized utility functions with memoization
    const getTimeRemaining = useCallback((endTime) => {
        if (!endTime) return 'Invalid date';
        
        const now = new Date();
        let endTimeString = endTime;
        if (endTime && !endTime.includes('Z') && endTime.split(':').length === 2) {
            endTimeString = endTime + ':00';
        }
        const end = new Date(endTimeString);
        
        if (isNaN(end.getTime())) return 'Invalid date';
        
        const diff = end - now;
        if (diff <= 0) return 'Expired';
        
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        
        if (days > 0) return `${days}d ${hours}h remaining`;
        if (hours > 0) return `${hours}h ${minutes}m remaining`;
        return `${minutes}m remaining`;
    }, []);

    const formatDateTime = useCallback((dateTime) => {
        if (!dateTime) return 'Not set';
        
        let dateTimeString = dateTime;
        if (dateTime && !dateTime.includes('Z') && dateTime.split(':').length === 2) {
            dateTimeString = dateTime + ':00';
        }
        
        const date = new Date(dateTimeString);
        return isNaN(date.getTime()) ? 'Invalid date' : date.toLocaleString();
    }, []);

    const isExpired = useCallback((endTime) => {
        if (!endTime) return true;
        
        const now = new Date();
        let endTimeString = endTime;
        if (endTime && !endTime.includes('Z') && endTime.split(':').length === 2) {
            endTimeString = endTime + ':00';
        }
        const end = new Date(endTimeString);
        
        return isNaN(end.getTime()) || end <= now;
    }, []);

    const getUrgencyBadge = useCallback((urgency) => {
        const colors = {
            'high': 'bg-red-100 text-red-800',
            'medium': 'bg-yellow-100 text-yellow-800',
            'normal': 'bg-blue-100 text-blue-800',
            'low': 'bg-green-100 text-green-800'
        };
        
        return (
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[urgency] || colors.normal}`}>
                {urgency?.toUpperCase() || 'NORMAL'}
            </span>
        );
    }, []);

    const getBidStatus = useCallback((bid) => {
        if (bid.tender_status === 'awarded') {
            if (bid.awarded_supplier_id === bid.supplier_id) {
                return <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">WON</span>;
            } else {
                return <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">LOST</span>;
            }
        } else if (bid.tender_status === 'active' && new Date(bid.bidding_end_time) > new Date()) {
            return <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">ACTIVE</span>;
        } else if (bid.tender_status === 'active' && new Date(bid.bidding_end_time) <= new Date()) {
            return <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">UNDER REVIEW</span>;
        }
        return <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">CLOSED</span>;
    }, []);

    const downloadTenderDocument = useCallback(async (tenderId) => {
        try {
            const token = localStorage.getItem('token') || localStorage.getItem('supplierToken');
            const response = await fetch(`${apiUrl}/demands/tenders/${tenderId}/tender-document`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Failed to download tender document');

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `tender-document-${tenderId}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err) {
            setError(`Failed to download tender document: ${err.message}`);
        }
    }, []);

    const downloadItemsList = useCallback(async (tenderId) => {
        try {
            const token = localStorage.getItem('token') || localStorage.getItem('supplierToken');
            const response = await fetch(`${apiUrl}/demands/tenders/${tenderId}/items-list`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Failed to download items list');

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            const contentDisposition = response.headers.get('content-disposition');
            const filename = contentDisposition 
                ? contentDisposition.split('filename=')[1]?.replace(/"/g, '') 
                : `items-list-${tenderId}.csv`;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err) {
            setError(`Failed to download items list: ${err.message}`);
        }
    }, []);

    // Early return for loading state
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading dashboard...</p>
                </div>
            </div>
        );
    }

    // Early return if no supplier data
    if (!supplier) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center">
                    <p className="text-gray-600">Redirecting...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
                <div className="px-4 py-6 sm:px-0">
                    <div className="mb-8 flex justify-between items-center">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900">Supplier Dashboard</h1>
                            <p className="mt-2 text-sm text-gray-600">
                                Welcome back! Here are your tender opportunities and bid submissions.
                            </p>
                        </div>
                        <button
                            onClick={refreshData}
                            disabled={loading}
                            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                        >
                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Refresh
                        </button>
                    </div>

                    {error && (
                        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative">
                            <span className="block sm:inline">{error}</span>
                            <button
                                onClick={clearError}
                                className="absolute top-0 bottom-0 right-0 px-4 py-3"
                                aria-label="Close error message"
                            >
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                            </button>
                        </div>
                    )}

                    {/* Tab Navigation */}
                    <div className="mb-6">
                        <nav className="flex space-x-8" aria-label="Tabs">
                            <button
                                onClick={() => setActiveTab('overview')}
                                className={`${
                                    activeTab === 'overview'
                                        ? 'border-indigo-500 text-indigo-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                } whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm`}
                            >
                                📊 Overview
                            </button>
                            <button
                                onClick={() => setActiveTab('tenders')}
                                className={`${
                                    activeTab === 'tenders'
                                        ? 'border-indigo-500 text-indigo-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                } whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm`}
                            >
                                Active Tenders ({activeTenders.length})
                            </button>
                            <button
                                onClick={() => setActiveTab('bids')}
                                className={`${
                                    activeTab === 'bids'
                                        ? 'border-indigo-500 text-indigo-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                } whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm`}
                            >
                                My Bids ({myBids.length})
                            </button>
                            <button
                                onClick={() => setActiveTab('grievances')}
                                className={`${
                                    activeTab === 'grievances'
                                        ? 'border-indigo-500 text-indigo-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                } whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm`}
                            >
                                <i className="fas fa-balance-scale mr-1"></i>
                                Grievances
                            </button>
                            <button
                                onClick={() => setActiveTab('security')}
                                className={`${
                                    activeTab === 'security'
                                        ? 'border-indigo-500 text-indigo-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                } whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm`}
                            >
                                🔒 Security
                            </button>
                        </nav>
                    </div>

                    {/* Overview Tab */}
                    {activeTab === 'overview' && <OverviewContent />}

                    {/* Active Tenders Tab */}
                    {activeTab === 'tenders' && (
                        <div className="bg-white shadow overflow-hidden sm:rounded-md">
                            <div className="px-4 py-5 sm:px-6">
                                <h3 className="text-lg leading-6 font-medium text-gray-900">
                                    Active Tenders
                                </h3>
                                <p className="mt-1 max-w-2xl text-sm text-gray-500">
                                    Current open tenders available for bidding
                                </p>
                            </div>
                            {activeTenders.length === 0 ? (
                                <div className="px-4 py-5 sm:p-6 text-center">
                                    <p className="text-gray-500">No active tenders available at the moment.</p>
                                </div>
                            ) : (
                                <ul className="divide-y divide-gray-200">
                                    {activeTenders.map((tender) => (
                                        <li key={tender.id} className="px-4 py-6 sm:px-6 hover:bg-gray-50">
                                            <div className="flex items-center justify-between">
                                                <div className="flex-1">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <h3 className="text-lg font-semibold text-gray-900">
                                                            {tender.item_name}
                                                        </h3>
                                                        {getUrgencyBadge(tender.urgency)}
                                                    </div>
                                                    
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                                        <div className="bg-blue-50 p-3 rounded-lg">
                                                            <p className="text-sm font-medium text-blue-800">Quantity Required</p>
                                                            <p className="text-xl font-bold text-blue-900">{tender.quantity}</p>
                                                        </div>
                                                        
                                                        <div className="bg-orange-50 p-3 rounded-lg">
                                                            <p className="text-sm font-medium text-orange-800">Time Remaining</p>
                                                            <p className="text-lg font-bold text-orange-900">
                                                                {getTimeRemaining(tender.bidding_end_time)}
                                                            </p>
                                                        </div>
                                                        
                                                        <div className="bg-green-50 p-3 rounded-lg">
                                                            <p className="text-sm font-medium text-green-800">Required By</p>
                                                            <p className="text-lg font-bold text-green-900">
                                                                {new Date(tender.required_by).toLocaleDateString()}
                                                            </p>
                                                        </div>
                                                    </div>
                                                      
                                                    <div className="text-sm text-gray-600 mb-3">
                                                        <p><span className="font-medium">Description:</span> {tender.description}</p>
                                                        <p className="mt-1">
                                                            <span className="font-medium">Bidding Expires:</span> {' '}
                                                            {formatDateTime(tender.bidding_end_time)}
                                                        </p>
                                                    </div>

                                                    {/* Download Buttons */}
                                                    <div className="flex flex-wrap gap-2 mb-4">
                                                        <button
                                                            onClick={() => downloadTenderDocument(tender.id)}
                                                            className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                                                        >
                                                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                            </svg>
                                                            Download Tender Document
                                                        </button>
                                                        <button
                                                            onClick={() => downloadItemsList(tender.id)}
                                                            className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                                                        >
                                                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                            </svg>
                                                            Download Items List
                                                        </button>
                                                    </div>
                                                </div>
                                                  
                                                <div className="ml-6 flex-shrink-0">
                                                    {!isExpired(tender.bidding_end_time) ? (
                                                        myBids.find(bid => bid.tender_id === tender.id) ? (
                                                            <span className="text-sm text-green-600 font-medium bg-green-50 px-3 py-2 rounded-lg border border-green-200">
                                                                Bid Submitted
                                                            </span>
                                                        ) : (
                                                            <button
                                                                onClick={() => handleBidClick(tender)}
                                                                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg text-sm font-medium shadow-md transition-colors"
                                                            >
                                                                Apply to Tender
                                                            </button>
                                                        )
                                                    ) : (
                                                        <span className="text-sm text-red-600 font-medium bg-red-50 px-3 py-2 rounded-lg border border-red-200">
                                                            Expired
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    {/* My Bids Tab */}
                    {activeTab === 'bids' && (
                        <div className="bg-white shadow overflow-hidden sm:rounded-md">
                            <div className="px-4 py-5 sm:px-6">
                                <h3 className="text-lg leading-6 font-medium text-gray-900">
                                    My Bids
                                </h3>
                                <p className="mt-1 max-w-2xl text-sm text-gray-500">
                                    Your submitted bids and their status
                                </p>
                            </div>
                            {myBids.length === 0 ? (
                                <div className="px-4 py-5 sm:p-6 text-center">
                                    <p className="text-gray-500">You haven't submitted any bids yet.</p>
                                </div>
                            ) : (
                                <ul className="divide-y divide-gray-200">
                                    {myBids.map((bid) => (
                                        <li key={bid.id} className="px-4 py-6 sm:px-6 hover:bg-gray-50">
                                            <div className="flex items-center justify-between">
                                                <div className="flex-1">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <h3 className="text-lg font-medium text-gray-900">
                                                            {bid.item_name}
                                                        </h3>
                                                        {getBidStatus(bid)}
                                                    </div>
                                                    
                                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
                                        <div className="bg-green-50 p-3 rounded-lg">
                                            <p className="text-sm font-medium text-green-800">Your Bid</p>
                                            <p className="text-xl font-bold text-green-900">Rs {bid.total_cost?.toLocaleString()}</p>
                                        </div>
                                        
                                        <div className="bg-blue-50 p-3 rounded-lg">
                                            <p className="text-sm font-medium text-blue-800">Quantity</p>
                                            <p className="text-lg font-bold text-blue-900">{bid.proposed_quantity}</p>
                                        </div>
                                        
                                        <div className="bg-orange-50 p-3 rounded-lg">
                                            <p className="text-sm font-medium text-orange-800">Delivery</p>
                                            <p className="text-lg font-bold text-orange-900">{bid.delivery_days} days</p>
                                        </div>
                                        
                                        <div className="bg-purple-50 p-3 rounded-lg">
                                            <p className="text-sm font-medium text-purple-800">Submitted</p>
                                            <p className="text-sm font-bold text-purple-900">
                                                {new Date(bid.created_at).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </div>
                                                    
                                                    <div className="text-sm text-gray-600 mb-3">
                                                        <p><span className="font-medium">Description:</span> {bid.description}</p>
                                                        {bid.bid_comments && (
                                                            <p className="mt-1">
                                                                <span className="font-medium">Your Comments:</span> {bid.bid_comments}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    {/* Grievances Tab */}
                    {activeTab === 'grievances' && (
                        <GrievanceManagement />
                    )}

                    {/* Security Tab */}
                    {activeTab === 'security' && <SecurityContent />}
                </div>
            </div>
        </div>
    );
};

export default SupplierDashboard;

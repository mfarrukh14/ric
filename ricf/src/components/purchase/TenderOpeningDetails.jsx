import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../../config/api';

const TenderOpeningDetails = () => {
    const { tenderId } = useParams();
    const navigate = useNavigate();
    const [tender, setTender] = useState(null);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState('');

    // Helper function to get tender display name
    const getTenderDisplayName = (tender) => {
        if (tender?.tender_number) {
            return `Tender ${tender.tender_number}`;
        }
        return `Tender #${tender?.id}`;
    };

    useEffect(() => {
        fetchTenderDetails();
    }, [tenderId]);

    const fetchTenderDetails = async () => {
        try {
            setLoading(true);
            const response = await api.get(`/demands/tenders/pending-opening/${tenderId}`);
            setTender(response.data);
        } catch (error) {
            console.error('Error fetching tender details:', error);
            setError('Failed to load tender details');
            toast.error('Failed to load tender details');
        } finally {
            setLoading(false);
        }
    };

    const handleDownloadReport = async () => {
        try {
            setProcessing(true);
            const response = await api.get(`/demands/tenders/${tenderId}/opening-report`, {
                responseType: 'blob'
            });
            
            // Create blob link to download
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            
            const tenderName = getTenderDisplayName(tender);
            link.setAttribute('download', `${tenderName}_Opening_Report.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            
            toast.success('Report downloaded successfully');
        } catch (error) {
            console.error('Error downloading report:', error);
            toast.error('Failed to download report');
        } finally {
            setProcessing(false);
        }
    };

    const handleForwardToTechnicalEvaluation = async () => {
        try {
            setProcessing(true);
            const response = await api.post(`/demands/tenders/${tenderId}/open`);
            
            toast.success('Tender forwarded to technical evaluation committee successfully');
            
            // Navigate back to purchase dashboard
            setTimeout(() => {
                navigate('/purchase-department');
            }, 2000);
        } catch (error) {
            console.error('Error forwarding tender:', error);
            toast.error('Failed to forward tender to technical evaluation');
        } finally {
            setProcessing(false);
        }
    };

    const getCompanyTypeDistribution = () => {
        if (!tender?.bids) return {};
        
        const distribution = {
            local: 0,
            international: 0,
            unknown: 0
        };
        
        tender.bids.forEach(bid => {
            // You can determine company type based on business profile data
            // For now, we'll use a simple heuristic
            if (bid.company_name && bid.company_name.includes('International')) {
                distribution.international++;
            } else if (bid.company_name) {
                distribution.local++;
            } else {
                distribution.unknown++;
            }
        });
        
        return distribution;
    };

    const getDeliveryTimeStats = () => {
        if (!tender?.bids || tender.bids.length === 0) return null;
        
        const deliveryTimes = tender.bids.map(bid => bid.delivery_days).filter(days => days != null);
        if (deliveryTimes.length === 0) return null;
        
        const min = Math.min(...deliveryTimes);
        const max = Math.max(...deliveryTimes);
        const avg = Math.round(deliveryTimes.reduce((sum, days) => sum + days, 0) / deliveryTimes.length);
        
        return { min, max, avg };
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading tender details...</p>
                </div>
            </div>
        );
    }

    if (error || !tender) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="text-red-500 text-6xl mb-4">
                        <i className="fas fa-exclamation-triangle"></i>
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Error Loading Tender</h2>
                    <p className="text-gray-600 mb-4">{error || 'Tender not found'}</p>
                    <button
                        onClick={() => navigate('/purchase-department')}
                        className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
                    >
                        Back to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    const companyTypeDistribution = getCompanyTypeDistribution();
    const deliveryStats = getDeliveryTimeStats();
    const totalBids = tender.bids?.length || 0;

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
                {/* Header */}
                <div className="bg-white shadow rounded-lg mb-6">
                    <div className="px-6 py-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900">
                                    {getTenderDisplayName(tender)} - Opening Details
                                </h1>
                                <p className="text-gray-600 mt-1">
                                    {tender.description || tender.item_name}
                                </p>
                            </div>
                            <button
                                onClick={() => navigate('/purchase-department')}
                                className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700"
                            >
                                <i className="fas fa-arrow-left mr-2"></i>
                                Back to Dashboard
                            </button>
                        </div>
                    </div>
                </div>

                {/* Tender Information */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                    <div className="bg-white shadow rounded-lg p-6">
                        <h3 className="text-lg font-medium text-gray-900 mb-4">Tender Information</h3>
                        <div className="space-y-3">
                            <div>
                                <span className="text-sm font-medium text-gray-500">Tender Number:</span>
                                <p className="text-sm text-gray-900">{tender.tender_number || `#${tender.id}`}</p>
                            </div>
                            <div>
                                <span className="text-sm font-medium text-gray-500">Item/Service:</span>
                                <p className="text-sm text-gray-900">{tender.item_name}</p>
                            </div>
                            <div>
                                <span className="text-sm font-medium text-gray-500">Urgency:</span>
                                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                    tender.urgency === 'urgent' ? 'bg-red-100 text-red-800' :
                                    tender.urgency === 'normal' ? 'bg-green-100 text-green-800' :
                                    'bg-yellow-100 text-yellow-800'
                                }`}>
                                    {tender.urgency}
                                </span>
                            </div>
                            <div>
                                <span className="text-sm font-medium text-gray-500">Bidding Ended:</span>
                                <p className="text-sm text-gray-900">
                                    {new Date(tender.bidding_end_time).toLocaleString('en-PK')}
                                </p>
                            </div>
                            <div>
                                <span className="text-sm font-medium text-gray-500">Required By:</span>
                                <p className="text-sm text-gray-900">
                                    {tender.required_by ? new Date(tender.required_by).toLocaleDateString('en-PK') : 'Not specified'}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white shadow rounded-lg p-6">
                        <h3 className="text-lg font-medium text-gray-900 mb-4">Participation Statistics</h3>
                        <div className="space-y-4">
                            <div className="text-center">
                                <div className="text-3xl font-bold text-blue-600">{totalBids}</div>
                                <div className="text-sm text-gray-500">Total Companies Participated</div>
                            </div>
                            
                            <div className="border-t pt-4">
                                <h4 className="text-sm font-medium text-gray-700 mb-2">Company Distribution</h4>
                                <div className="space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-600">Local Companies:</span>
                                        <span className="font-medium">{companyTypeDistribution.local}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-600">International:</span>
                                        <span className="font-medium">{companyTypeDistribution.international}</span>
                                    </div>
                                </div>
                            </div>

                            {deliveryStats && (
                                <div className="border-t pt-4">
                                    <h4 className="text-sm font-medium text-gray-700 mb-2">Delivery Time Range</h4>
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-600">Fastest:</span>
                                            <span className="font-medium">{deliveryStats.min} days</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-600">Slowest:</span>
                                            <span className="font-medium">{deliveryStats.max} days</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-600">Average:</span>
                                            <span className="font-medium">{deliveryStats.avg} days</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="bg-white shadow rounded-lg p-6">
                        <h3 className="text-lg font-medium text-gray-900 mb-4">Department Information</h3>
                        <div className="space-y-3">
                            <div>
                                <span className="text-sm font-medium text-gray-500">Requested By:</span>
                                <p className="text-sm text-gray-900">{tender.created_by_name || 'N/A'}</p>
                            </div>
                            <div>
                                <span className="text-sm font-medium text-gray-500">Department:</span>
                                <p className="text-sm text-gray-900">{tender.creator_department || 'N/A'}</p>
                            </div>
                            <div>
                                <span className="text-sm font-medium text-gray-500">Status:</span>
                                <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                                    Pending Opening
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Participating Companies (without costs) */}
                <div className="bg-white shadow rounded-lg mb-6">
                    <div className="px-6 py-4 border-b border-gray-200">
                        <h3 className="text-lg font-medium text-gray-900">Participating Companies</h3>
                        <p className="text-sm text-gray-500 mt-1">
                            Companies that submitted bids for this tender (cost details confidential)
                        </p>
                    </div>
                    <div className="px-6 py-4">
                        {totalBids === 0 ? (
                            <div className="text-center py-8">
                                <div className="text-gray-400 text-4xl mb-4">
                                    <i className="fas fa-inbox"></i>
                                </div>
                                <p className="text-gray-500">No companies participated in this tender</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Company Name
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Contact Email
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Contact Phone
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Proposed Delivery
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Submission Time
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {tender.bids.map((bid, index) => (
                                            <tr key={bid.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-sm font-medium text-gray-900">
                                                        {bid.company_name || 'N/A'}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-sm text-gray-900">
                                                        {bid.company_email || 'N/A'}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-sm text-gray-900">
                                                        {bid.contact_phone || 'N/A'}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-sm text-gray-900">
                                                        {bid.delivery_days ? `${bid.delivery_days} days` : 'N/A'}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-sm text-gray-900">
                                                        {new Date(bid.created_at).toLocaleString('en-PK')}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="bg-white shadow rounded-lg">
                    <div className="px-6 py-4">
                        <h3 className="text-lg font-medium text-gray-900 mb-4">Actions</h3>
                        <div className="flex flex-col sm:flex-row gap-4">
                            <button
                                onClick={handleDownloadReport}
                                disabled={processing}
                                className={`flex-1 inline-flex justify-center items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white ${
                                    processing 
                                        ? 'bg-gray-400 cursor-not-allowed' 
                                        : 'bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500'
                                }`}
                            >
                                <i className="fas fa-download mr-2"></i>
                                {processing ? 'Generating Report...' : 'Download Opening Report'}
                            </button>
                            
                            <button
                                onClick={handleForwardToTechnicalEvaluation}
                                disabled={processing || totalBids === 0}
                                className={`flex-1 inline-flex justify-center items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white ${
                                    processing || totalBids === 0
                                        ? 'bg-gray-400 cursor-not-allowed' 
                                        : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
                                }`}
                            >
                                <i className="fas fa-arrow-right mr-2"></i>
                                {processing ? 'Processing...' : 'Forward to Technical Evaluation'}
                            </button>
                        </div>
                        
                        {totalBids === 0 && (
                            <p className="text-sm text-gray-500 mt-2 text-center">
                                Cannot forward to technical evaluation - no bids received
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TenderOpeningDetails;

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiUrl } from '../../config/api';

import { formatDateTime } from '../../lib/time';
const TechnicalEvaluation = () => {
    const [expiredTenders, setExpiredTenders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const navigate = useNavigate();

    useEffect(() => {
        fetchExpiredTenders();
    }, []);

    const fetchExpiredTenders = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/technical-evaluation/expired-tenders`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to fetch expired tenders');
            }

            const data = await response.json();
            setExpiredTenders(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleEvaluateBids = (tenderId) => {
        navigate(`/committee/technical-evaluation/${tenderId}/evaluate`);
    };


    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="ui-spin"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="ui-panel">
                <div className="px-4 py-5 sm:p-6">
                    <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                        Technical evaluation - expired tenders
                    </h3>

                    {error && (
                        <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
                            {error}
                        </div>
                    )}

                    {expiredTenders.length === 0 ? (
                        <div className="text-center text-gray-500 py-8">
                            No expired tenders requiring evaluation
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {expiredTenders.map((tender) => (
                                <div key={tender.id} className="ui-card">
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1">
                                            <h4 className="text-lg font-medium text-gray-900">
                                                {tender.item_name}
                                            </h4>
                                            <p className="text-sm text-gray-600 mt-1">
                                                {tender.description}
                                            </p>
                                            <div className="mt-2 grid grid-cols-2 gap-4 text-sm">
                                                <div>
                                                    <span className="font-medium">Tender ID:</span> {tender.id}
                                                </div>
                                                <div>
                                                    <span className="font-medium">Urgency:</span> 
                                                    <span className={`ml-1 px-2 py-1 rounded-full text-xs ${
                                                        tender.urgency === 'urgent' ? 'bg-red-100 text-red-800' :
                                                        tender.urgency === 'normal' ? 'bg-blue-100 text-blue-800' :
                                                        'bg-green-100 text-green-800'
                                                    }`}>
                                                        {tender.urgency}
                                                    </span>
                                                </div>
                                                <div>
                                                    <span className="font-medium">Expired On:</span> {formatDateTime(tender.bidding_end_time)}
                                                </div>
                                                <div>
                                                    <span className="font-medium">Total Bids:</span> {tender.bids?.length || 0}
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleEvaluateBids(tender.id)}
                                            className="ui-btn ui-btn--primary ml-4"
                                        >
                                            Evaluate bids
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TechnicalEvaluation;
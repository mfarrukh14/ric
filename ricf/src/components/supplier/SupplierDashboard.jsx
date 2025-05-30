import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const SupplierDashboard = () => {
    const [supplier, setSupplier] = useState(null);
    const navigate = useNavigate();    useEffect(() => {
        const stored = localStorage.getItem('user');
        if (stored) {
            const userData = JSON.parse(stored);
            if (userData.role === 'supplier') {
                setSupplier(userData);
            } else {
                navigate('/');
            }
        } else {
            navigate('/');
        }
    }, [navigate]);

    if (!supplier) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
            </div>
        );
    }    return (
        <div className="min-h-screen bg-gray-50">
            {/* Main Content */}
            <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
                <div className="px-4 py-6 sm:px-0">
                    <div className="mb-6">
                        <h1 className="text-3xl font-bold text-gray-900">Supplier Dashboard</h1>
                        <p className="text-gray-600">{supplier.companyName}</p>
                    </div>
                    
                    <div className="bg-white overflow-hidden shadow rounded-lg">
                        <div className="px-4 py-5 sm:p-6">
                            <h2 className="text-lg font-medium text-gray-900 mb-4">Welcome to your Supplier Portal</h2>
                            
                            <div className="bg-green-50 border border-green-200 rounded-md p-4">
                                <div className="flex">
                                    <div className="flex-shrink-0">
                                        <svg className="h-5 w-5 text-green-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                    <div className="ml-3">
                                        <h3 className="text-sm font-medium text-green-800">
                                            Registration Approved
                                        </h3>
                                        <div className="mt-2 text-sm text-green-700">
                                            <p>
                                                Your supplier registration has been approved by the evaluation committee. 
                                                You can now participate in tenders and submit proposals.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {/* Company Information */}
                                <div className="bg-gray-50 rounded-lg p-6">
                                    <h3 className="text-lg font-medium text-gray-900 mb-4">Company Information</h3>
                                    <div className="space-y-2 text-sm">
                                        <p><span className="font-medium">Company:</span> {supplier.companyName}</p>
                                        <p><span className="font-medium">Email:</span> {supplier.companyEmail}</p>
                                        <p><span className="font-medium">Status:</span> 
                                            <span className="ml-2 px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
                                                {supplier.status.charAt(0).toUpperCase() + supplier.status.slice(1)}
                                            </span>
                                        </p>
                                    </div>
                                </div>

                                {/* Quick Actions */}
                                <div className="bg-gray-50 rounded-lg p-6">
                                    <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
                                    <div className="space-y-3">
                                        <button className="w-full text-left px-4 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50">
                                            View Available Tenders
                                        </button>
                                        <button className="w-full text-left px-4 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50">
                                            Submit Proposal
                                        </button>
                                        <button className="w-full text-left px-4 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50">
                                            View Proposals
                                        </button>
                                    </div>
                                </div>

                                {/* Recent Activity */}
                                <div className="bg-gray-50 rounded-lg p-6">
                                    <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Activity</h3>
                                    <div className="text-sm text-gray-600">
                                        <p>No recent activity</p>
                                    </div>
                                </div>
                            </div>

                            {/* Coming Soon Features */}
                            <div className="mt-8">
                                <h3 className="text-lg font-medium text-gray-900 mb-4">Coming Soon</h3>
                                <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                                    <div className="text-sm text-blue-700">
                                        <ul className="list-disc list-inside space-y-1">
                                            <li>Tender management system</li>
                                            <li>Proposal submission portal</li>
                                            <li>Document management</li>
                                            <li>Communication center</li>
                                            <li>Performance analytics</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SupplierDashboard;

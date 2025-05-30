import React, { useState, useEffect } from 'react';
import { apiUrl } from '../../config/api';

const SupplierEvaluation = () => {
    const [suppliers, setSuppliers] = useState([]);
    const [selectedSupplier, setSelectedSupplier] = useState(null);
    const [supplierDetails, setSupplierDetails] = useState(null);
    const [loading, setLoading] = useState(false);
    const [evaluating, setEvaluating] = useState(false);
    const [evaluation, setEvaluation] = useState({ status: '', comments: '' });
    const [error, setError] = useState('');

    useEffect(() => {
        fetchPendingSuppliers();
    }, []);

    const fetchPendingSuppliers = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/suppliers/pending`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                setSuppliers(data);
            } else {
                const errorData = await response.json();
                setError(errorData.error || 'Failed to fetch suppliers');
            }
        } catch (error) {
            console.error('Error fetching suppliers:', error);
            setError('Failed to fetch suppliers');
        } finally {
            setLoading(false);
        }
    };

    const fetchSupplierDetails = async (supplierId) => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/suppliers/${supplierId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                setSupplierDetails(data);
                setSelectedSupplier(supplierId);
            } else {
                const errorData = await response.json();
                setError(errorData.error || 'Failed to fetch supplier details');
            }
        } catch (error) {
            console.error('Error fetching supplier details:', error);
            setError('Failed to fetch supplier details');
        } finally {
            setLoading(false);
        }
    };

    const submitEvaluation = async () => {
        try {
            setEvaluating(true);
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/suppliers/${selectedSupplier}/evaluate`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(evaluation)
            });

            if (response.ok) {
                const data = await response.json();
                alert(data.message);
                setEvaluation({ status: '', comments: '' });
                fetchPendingSuppliers();
                fetchSupplierDetails(selectedSupplier);
            } else {
                const errorData = await response.json();
                setError(errorData.error || 'Failed to submit evaluation');
            }
        } catch (error) {
            console.error('Error submitting evaluation:', error);
            setError('Failed to submit evaluation');
        } finally {
            setEvaluating(false);
        }
    };

    const downloadDocument = async (documentType) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/suppliers/${selectedSupplier}/document/${documentType}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${documentType}.pdf`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            } else {
                const errorData = await response.json();
                setError(errorData.error || 'Failed to download document');
            }
        } catch (error) {
            console.error('Error downloading document:', error);
            setError('Failed to download document');
        }
    };

    return (
        <div className="container mx-auto p-8">
            <h1 className="text-2xl font-bold mb-6">Supplier Evaluation</h1>

            {error && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Suppliers List */}
                <div className="lg:col-span-1">
                    <div className="bg-white rounded-lg shadow">
                        <div className="px-6 py-4 border-b border-gray-200">
                            <h2 className="text-lg font-semibold text-gray-900">Pending Suppliers</h2>
                        </div>
                        <div className="p-6">
                            {loading ? (
                                <div className="text-center py-8">
                                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                                </div>
                            ) : suppliers.length > 0 ? (
                                <div className="space-y-3">
                                    {suppliers.map((supplier) => (
                                        <div
                                            key={supplier.id}
                                            onClick={() => fetchSupplierDetails(supplier.id)}
                                            className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                                                selectedSupplier === supplier.id
                                                    ? 'border-blue-500 bg-blue-50'
                                                    : 'border-gray-200 hover:border-gray-300'
                                            }`}
                                        >
                                            <h3 className="font-medium text-gray-900">{supplier.company_name}</h3>
                                            <p className="text-sm text-gray-600">{supplier.company_email}</p>
                                            <p className="text-xs text-gray-500">
                                                Submitted: {new Date(supplier.created_at).toLocaleDateString()}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-8">
                                    <p className="text-gray-500">No pending suppliers</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Supplier Details */}
                <div className="lg:col-span-2">
                    {supplierDetails ? (
                        <div className="bg-white rounded-lg shadow">
                            <div className="px-6 py-4 border-b border-gray-200">
                                <h2 className="text-lg font-semibold text-gray-900">
                                    {supplierDetails.supplier.company_name}
                                </h2>
                            </div>
                            <div className="p-6 space-y-6">
                                {/* Company Information */}
                                <div>
                                    <h3 className="text-md font-medium text-gray-900 mb-3">Company Information</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                        <div>
                                            <span className="font-medium">Email:</span> {supplierDetails.supplier.company_email}
                                        </div>
                                        <div>
                                            <span className="font-medium">Status:</span> 
                                            <span className="ml-2 px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs">
                                                {supplierDetails.supplier.status}
                                            </span>
                                        </div>
                                        <div className="md:col-span-2">
                                            <span className="font-medium">Statement:</span>
                                            <p className="mt-1 text-gray-700">{supplierDetails.supplier.company_statement}</p>
                                        </div>
                                        <div className="md:col-span-2">
                                            <span className="font-medium">Mission:</span>
                                            <p className="mt-1 text-gray-700">{supplierDetails.supplier.company_mission}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Documents */}
                                <div>
                                    <h3 className="text-md font-medium text-gray-900 mb-3">Documents</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {[
                                            { key: 'professional_tax_cert', label: 'Professional Tax Certificate' },
                                            { key: 'ntn_document', label: 'NTN Document' },
                                            { key: 'drug_sale_license', label: 'Drug Sale License' },
                                            { key: 'pec_document', label: 'PEC Document' },
                                            { key: 'gst_document', label: 'GST Document' }
                                        ].map((doc) => (
                                            <button
                                                key={doc.key}
                                                onClick={() => downloadDocument(doc.key)}
                                                className="text-left p-3 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors"
                                            >
                                                <span className="text-sm font-medium text-blue-600">📄 {doc.label}</span>
                                                <br />
                                                <span className="text-xs text-gray-500">Click to download</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Existing Evaluations */}
                                {supplierDetails.evaluations.length > 0 && (
                                    <div>
                                        <h3 className="text-md font-medium text-gray-900 mb-3">
                                            Evaluations ({supplierDetails.evaluations.length}/{supplierDetails.committeeCount})
                                        </h3>                                        <div className="space-y-3">
                                            {supplierDetails.evaluations.map((evaluation) => (
                                                <div key={evaluation.id} className="border border-gray-200 rounded-lg p-3">
                                                    <div className="flex justify-between items-start">
                                                        <span className="font-medium">{evaluation.evaluator_name}</span>
                                                        <span className={`px-2 py-1 rounded-full text-xs ${
                                                            evaluation.status === 'approved' 
                                                                ? 'bg-green-100 text-green-800' 
                                                                : 'bg-red-100 text-red-800'
                                                        }`}>
                                                            {evaluation.status}
                                                        </span>
                                                    </div>
                                                    {evaluation.comments && (
                                                        <p className="mt-2 text-sm text-gray-600">{evaluation.comments}</p>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Evaluation Form */}
                                <div>
                                    <h3 className="text-md font-medium text-gray-900 mb-3">Submit Your Evaluation</h3>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Decision</label>
                                            <div className="flex space-x-4">
                                                <label className="flex items-center">
                                                    <input
                                                        type="radio"
                                                        name="status"
                                                        value="approved"
                                                        checked={evaluation.status === 'approved'}
                                                        onChange={(e) => setEvaluation({...evaluation, status: e.target.value})}
                                                        className="mr-2"
                                                    />
                                                    Approve
                                                </label>
                                                <label className="flex items-center">
                                                    <input
                                                        type="radio"
                                                        name="status"
                                                        value="rejected"
                                                        checked={evaluation.status === 'rejected'}
                                                        onChange={(e) => setEvaluation({...evaluation, status: e.target.value})}
                                                        className="mr-2"
                                                    />
                                                    Reject
                                                </label>
                                            </div>
                                        </div>
                                        
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Comments</label>
                                            <textarea
                                                rows={3}
                                                value={evaluation.comments}
                                                onChange={(e) => setEvaluation({...evaluation, comments: e.target.value})}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                placeholder="Optional comments..."
                                            />
                                        </div>
                                        
                                        <button
                                            onClick={submitEvaluation}
                                            disabled={!evaluation.status || evaluating}
                                            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
                                        >
                                            {evaluating ? 'Submitting...' : 'Submit Evaluation'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-white rounded-lg shadow">
                            <div className="p-8 text-center">
                                <p className="text-gray-500">Select a supplier to view details and submit evaluation</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SupplierEvaluation;

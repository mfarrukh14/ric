import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const LetterManagement = () => {
    const [activeLetterTab, setActiveLetterTab] = useState('send-intent');
    const [loading, setLoading] = useState(false);
    
    // Data states
    const [tendersForIntent, setTendersForIntent] = useState([]);
    const [tendersForAward, setTendersForAward] = useState([]);
    const [allLetters, setAllLetters] = useState([]);
    
    // Modal states
    const [showIntentModal, setShowIntentModal] = useState(false);
    const [showAwardModal, setShowAwardModal] = useState(false);
    const [selectedTender, setSelectedTender] = useState(null);
    const [selectedSuppliersForIntent, setSelectedSuppliersForIntent] = useState([]);
    const [selectedSuppliersForAward, setSelectedSuppliersForAward] = useState([]);
    const [selectedAwardSupplierIds, setSelectedAwardSupplierIds] = useState([]);
    
    // Form states
    const [intentForm, setIntentForm] = useState({
        letterTitle: '',
        letterContent: '',
        sendTo: 'all',
        letterFile: null
    });
    const [selectedSupplierIds, setSelectedSupplierIds] = useState([]);
    
    const [awardForm, setAwardForm] = useState({
        letterTitle: '',
        letterContent: '',
        letterFile: null,
        awardDetails: {}
    });

    useEffect(() => {
        fetchTendersForIntent();
        fetchAllLetters();
    }, []);

    const fetchTendersForIntent = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/api/letters/intent/ready-tenders`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Failed to fetch tenders');
            
            const data = await response.json();
            setTendersForIntent(data);
            
            // Also get tenders for award (those with intent letters sent)
            const tendersWithIntent = data.filter(tender => tender.intent_letter_sent);
            setTendersForAward(tendersWithIntent);
        } catch (error) {
            console.error('Error fetching tenders for intent:', error);
            toast.error('Failed to fetch tenders');
        }
    };

    const fetchAllLetters = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/api/letters`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Failed to fetch letters');
            
            const data = await response.json();
            setAllLetters(data);
        } catch (error) {
            console.error('Error fetching letters:', error);
            toast.error('Failed to fetch letters');
        }
    };

    const fetchSuppliersForIntent = async (tenderId) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/api/letters/intent/recipients/${tenderId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Failed to fetch suppliers');
            
            const data = await response.json();
            setSelectedSuppliersForAward(data);
        } catch (error) {
            console.error('Error fetching suppliers for intent:', error);
            toast.error('Failed to fetch suppliers');
        }
    };

    const handleSendIntent = async (e) => {
        e.preventDefault();
        
        if (!intentForm.letterFile) {
            toast.error('Please select a letter file');
            return;
        }

        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            const formData = new FormData();
            
            formData.append('letterTitle', intentForm.letterTitle);
            formData.append('letterContent', intentForm.letterContent);
            formData.append('sendTo', intentForm.sendTo);
            formData.append('letterFile', intentForm.letterFile);
            
            if (intentForm.sendTo === 'selected') {
                formData.append('selectedSuppliers', JSON.stringify(selectedSupplierIds));
            }

            const response = await fetch(`${apiUrl}/api/letters/intent/send/${selectedTender.id}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            if (!response.ok) throw new Error('Failed to send letter of intent');
            
            const data = await response.json();
            toast.success(
                `Letter of Intent sent successfully! 
                Sent to ${data.totalRecipients} suppliers. 
                ${data.successfulSends} successful, ${data.failedSends} failed.`
            );

            setShowIntentModal(false);
            setIntentForm({ letterTitle: '', letterContent: '', sendTo: 'all', letterFile: null });
            setSelectedSupplierIds([]);
            setSelectedTender(null);
            
            fetchTendersForIntent();
            fetchAllLetters();
        } catch (error) {
            console.error('Error sending letter of intent:', error);
            toast.error('Failed to send letter of intent');
        } finally {
            setLoading(false);
        }
    };

    const handleIntentFormChange = (e) => {
        const { name, value, type, files } = e.target;
        if (type === 'file') {
            setIntentForm(prev => ({ ...prev, [name]: files[0] }));
        } else {
            setIntentForm(prev => ({ ...prev, [name]: value }));
            
            // Reset selected suppliers when sendTo changes
            if (name === 'sendTo') {
                setSelectedSupplierIds([]);
            }
        }
    };

    const handleSupplierSelectionChange = (supplierId, isChecked) => {
        setSelectedSupplierIds(prev => {
            if (isChecked) {
                return [...prev, supplierId];
            } else {
                return prev.filter(id => id !== supplierId);
            }
        });
    };

    const handleSendAward = async (e) => {
        e.preventDefault();
        
        if (!awardForm.letterFile) {
            toast.error('Please select a letter file');
            return;
        }

        if (selectedAwardSupplierIds.length === 0) {
            toast.error('Please select at least one supplier for the award');
            return;
        }

        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            const formData = new FormData();
            
            formData.append('letterTitle', awardForm.letterTitle);
            formData.append('letterContent', awardForm.letterContent);
            formData.append('letterFile', awardForm.letterFile);
            formData.append('selectedSuppliers', JSON.stringify(selectedAwardSupplierIds));
            formData.append('awardDetails', JSON.stringify(awardForm.awardDetails));

            const response = await fetch(`${apiUrl}/api/letters/award/send/${selectedTender.id}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            if (!response.ok) throw new Error('Failed to send letter of award');
            
            const data = await response.json();
            toast.success(
                `Letter of Award sent successfully! 
                Sent to ${data.totalRecipients} suppliers. 
                ${data.successfulSends} successful, ${data.failedSends} failed.`
            );

            setShowAwardModal(false);
            setAwardForm({ letterTitle: '', letterContent: '', letterFile: null, awardDetails: {} });
            setSelectedTender(null);
            setSelectedSuppliersForAward([]);
            setSelectedAwardSupplierIds([]);
            
            fetchTendersForIntent();
            fetchAllLetters();
        } catch (error) {
            console.error('Error sending letter of award:', error);
            toast.error('Failed to send letter of award');
        } finally {
            setLoading(false);
        }
    };

    const openIntentModal = async (tender) => {
        setSelectedTender(tender);
        setIntentForm({
            letterTitle: `Letter of Intent - ${tender.item_name}`,
            letterContent: `We are pleased to inform you that your company has been shortlisted for the tender: ${tender.item_name}. This letter indicates our intention to potentially award you the contract.`,
            sendTo: 'all',
            letterFile: null
        });
        
        // Fetch approved suppliers for this tender for selection
        await fetchApprovedSuppliersForTender(tender.id);
        setShowIntentModal(true);
    };

    const fetchApprovedSuppliersForTender = async (tenderId) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/api/letters/intent/suppliers/${tenderId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Failed to fetch suppliers');
            
            const data = await response.json();
            setSelectedSuppliersForIntent(data);
        } catch (error) {
            console.error('Error fetching approved suppliers:', error);
            toast.error('Failed to fetch suppliers for selection');
        }
    };

    const openAwardModal = async (tender) => {
        setSelectedTender(tender);
        setAwardForm({
            letterTitle: `Letter of Award - ${tender.item_name}`,
            letterContent: `Congratulations! Your company has been selected and awarded the contract for: ${tender.item_name}. Please review the attached letter for further details.`,
            letterFile: null,
            awardDetails: {}
        });
        setSelectedAwardSupplierIds([]); // Reset selected suppliers
        
        // Fetch suppliers who received intent letter
        await fetchSuppliersForIntent(tender.id);
        setShowAwardModal(true);
    };

    const downloadLetter = async (letterId, fileName) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiUrl}/api/letters/${letterId}/download`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Failed to download letter');

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error downloading letter:', error);
            toast.error('Failed to download letter');
        }
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleString();
    };

    return (
        <div className="space-y-6">
            {/* Tab Navigation */}
            <div className="border-b border-gray-200">
                <nav className="-mb-px flex space-x-8">
                    <button
                        onClick={() => setActiveLetterTab('send-intent')}
                        className={`py-2 px-1 border-b-2 font-medium text-sm ${
                            activeLetterTab === 'send-intent'
                                ? 'border-indigo-500 text-indigo-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                    >
                        <i className="fas fa-paper-plane mr-2"></i>
                        Send Letter of Intent
                    </button>
                    <button
                        onClick={() => setActiveLetterTab('send-award')}
                        className={`py-2 px-1 border-b-2 font-medium text-sm ${
                            activeLetterTab === 'send-award'
                                ? 'border-indigo-500 text-indigo-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                    >
                        <i className="fas fa-trophy mr-2"></i>
                        Send Letter of Award
                    </button>
                    <button
                        onClick={() => setActiveLetterTab('all-letters')}
                        className={`py-2 px-1 border-b-2 font-medium text-sm ${
                            activeLetterTab === 'all-letters'
                                ? 'border-indigo-500 text-indigo-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                    >
                        <i className="fas fa-envelope mr-2"></i>
                        All Letters ({allLetters.length})
                    </button>
                </nav>
            </div>

            {/* Send Letter of Intent Tab */}
            {activeLetterTab === 'send-intent' && (
                <div className="bg-white shadow overflow-hidden sm:rounded-md">
                    <div className="px-4 py-5 sm:p-6">
                        <h3 className="text-lg font-medium text-gray-900 mb-4">
                            <i className="fas fa-paper-plane mr-2 text-blue-600"></i>
                            Send Letter of Intent
                        </h3>
                        <p className="text-sm text-gray-600 mb-6">
                            Send Letter of Intent to suppliers after financial opening is completed.
                        </p>

                        {tendersForIntent.length === 0 ? (
                            <div className="text-center py-8">
                                <i className="fas fa-inbox text-gray-400 text-4xl mb-4"></i>
                                <p className="text-gray-500">No tenders available for Letter of Intent.</p>
                                <p className="text-sm text-gray-400">Complete financial opening first.</p>
                            </div>
                        ) : (
                            <div className="grid gap-4">
                                {tendersForIntent.map((tender) => (
                                    <div key={tender.id} className="border border-gray-200 rounded-lg p-4">
                                        <div className="flex justify-between items-start">
                                            <div className="flex-1">
                                                <h4 className="font-medium text-gray-900">
                                                    {tender.tender_number} - {tender.item_name}
                                                </h4>
                                                <p className="text-sm text-gray-600 mt-1">{tender.description}</p>
                                                <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-500">
                                                    <span>
                                                        <i className="fas fa-building mr-1"></i>
                                                        {tender.total_bidders} bidders
                                                    </span>
                                                    <span>
                                                        <i className="fas fa-check-circle mr-1"></i>
                                                        {tender.approved_bidders} approved
                                                    </span>
                                                    <span>
                                                        <i className="fas fa-calendar mr-1"></i>
                                                        Financial opened: {formatDate(tender.financial_opened_at)}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="ml-4">
                                                {tender.intent_letter_sent ? (
                                                    <div className="text-center">
                                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                            <i className="fas fa-check mr-1"></i>
                                                            Intent Sent
                                                        </span>
                                                        <p className="text-xs text-gray-500 mt-1">
                                                            {formatDate(tender.intent_sent_at)}
                                                        </p>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => openIntentModal(tender)}
                                                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                                                    >
                                                        <i className="fas fa-paper-plane mr-2"></i>
                                                        Send Intent
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Send Letter of Award Tab */}
            {activeLetterTab === 'send-award' && (
                <div className="bg-white shadow overflow-hidden sm:rounded-md">
                    <div className="px-4 py-5 sm:p-6">
                        <h3 className="text-lg font-medium text-gray-900 mb-4">
                            <i className="fas fa-trophy mr-2 text-green-600"></i>
                            Send Letter of Award
                        </h3>
                        <p className="text-sm text-gray-600 mb-6">
                            Send Letter of Award to selected suppliers (only those who received Letter of Intent).
                        </p>

                        {tendersForAward.length === 0 ? (
                            <div className="text-center py-8">
                                <i className="fas fa-trophy text-gray-400 text-4xl mb-4"></i>
                                <p className="text-gray-500">No tenders available for Letter of Award.</p>
                                <p className="text-sm text-gray-400">Send Letter of Intent first.</p>
                            </div>
                        ) : (
                            <div className="grid gap-4">
                                {tendersForAward.map((tender) => (
                                    <div key={tender.id} className="border border-gray-200 rounded-lg p-4">
                                        <div className="flex justify-between items-start">
                                            <div className="flex-1">
                                                <h4 className="font-medium text-gray-900">
                                                    {tender.tender_number} - {tender.item_name}
                                                </h4>
                                                <p className="text-sm text-gray-600 mt-1">{tender.description}</p>
                                                <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-500">
                                                    <span>
                                                        <i className="fas fa-check-circle mr-1 text-green-500"></i>
                                                        Intent sent: {formatDate(tender.intent_sent_at)}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="ml-4">
                                                <button
                                                    onClick={() => openAwardModal(tender)}
                                                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                                                >
                                                    <i className="fas fa-trophy mr-2"></i>
                                                    Send Award
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* All Letters Tab */}
            {activeLetterTab === 'all-letters' && (
                <div className="bg-white shadow overflow-hidden sm:rounded-md">
                    <div className="px-4 py-5 sm:p-6">
                        <h3 className="text-lg font-medium text-gray-900 mb-4">
                            <i className="fas fa-envelope mr-2 text-gray-600"></i>
                            All Letters History
                        </h3>

                        {allLetters.length === 0 ? (
                            <div className="text-center py-8">
                                <i className="fas fa-envelope-open text-gray-400 text-4xl mb-4"></i>
                                <p className="text-gray-500">No letters sent yet.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Letter Details
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Type
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Recipients
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Status
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Sent Date
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                Actions
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {allLetters.map((letter) => (
                                            <tr key={letter.id}>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div>
                                                        <div className="text-sm font-medium text-gray-900">
                                                            {letter.letter_title}
                                                        </div>
                                                        <div className="text-sm text-gray-500">
                                                            {letter.tender_number} - {letter.tender_title}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                                        letter.letter_type === 'intent' 
                                                            ? 'bg-blue-100 text-blue-800' 
                                                            : 'bg-green-100 text-green-800'
                                                    }`}>
                                                        <i className={`fas ${letter.letter_type === 'intent' ? 'fa-paper-plane' : 'fa-trophy'} mr-1`}></i>
                                                        {letter.letter_type === 'intent' ? 'Intent' : 'Award'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                    {letter.total_recipients} recipients
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-xs">
                                                        <div className="text-green-600">
                                                            <i className="fas fa-check-circle mr-1"></i>
                                                            {letter.successful_sends} sent
                                                        </div>
                                                        {letter.failed_sends > 0 && (
                                                            <div className="text-red-600">
                                                                <i className="fas fa-times-circle mr-1"></i>
                                                                {letter.failed_sends} failed
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                    {formatDate(letter.sent_at)}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                                    <button
                                                        onClick={() => downloadLetter(letter.id, letter.letter_original_name)}
                                                        className="text-indigo-600 hover:text-indigo-900 mr-3"
                                                    >
                                                        <i className="fas fa-download mr-1"></i>
                                                        Download
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Letter of Intent Modal */}
            {showIntentModal && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                    <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-gray-900">
                                <i className="fas fa-paper-plane mr-2 text-blue-600"></i>
                                Send Letter of Intent
                            </h3>
                            <button
                                onClick={() => setShowIntentModal(false)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        <form onSubmit={handleSendIntent}>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Letter Title</label>
                                    <input
                                        type="text"
                                        value={intentForm.letterTitle}
                                        onChange={(e) => setIntentForm({...intentForm, letterTitle: e.target.value})}
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Letter Content</label>
                                    <textarea
                                        value={intentForm.letterContent}
                                        onChange={(e) => setIntentForm({...intentForm, letterContent: e.target.value})}
                                        rows={4}
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                        placeholder="Additional content for the email body..."
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Send To</label>
                                    <select
                                        value={intentForm.sendTo}
                                        onChange={handleIntentFormChange}
                                        name="sendTo"
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                    >
                                        <option value="all">All Approved Suppliers</option>
                                        <option value="selected">Selected Suppliers</option>
                                    </select>
                                </div>

                                {/* Supplier Selection Section */}
                                {intentForm.sendTo === 'selected' && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Select Suppliers ({selectedSupplierIds.length} selected)
                                        </label>
                                        <div className="max-h-40 overflow-y-auto border border-gray-300 rounded-md p-3 bg-gray-50">
                                            {selectedSuppliersForIntent.length > 0 ? (
                                                selectedSuppliersForIntent.map((supplier) => (
                                                    <label key={supplier.id} className="flex items-center space-x-3 py-2">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedSupplierIds.includes(supplier.id)}
                                                            onChange={(e) => handleSupplierSelectionChange(supplier.id, e.target.checked)}
                                                            className="rounded border-gray-300 text-indigo-600 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                                                        />
                                                        <div className="flex-1">
                                                            <div className="text-sm font-medium text-gray-900">{supplier.company_name}</div>
                                                            <div className="text-xs text-gray-500">{supplier.email}</div>
                                                        </div>
                                                    </label>
                                                ))
                                            ) : (
                                                <p className="text-sm text-gray-500 text-center py-4">
                                                    No suppliers found for this tender
                                                </p>
                                            )}
                                        </div>
                                        {selectedSupplierIds.length === 0 && (
                                            <p className="text-xs text-red-500 mt-1">Please select at least one supplier</p>
                                        )}
                                    </div>
                                )}

                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Letter File (PDF/DOC/DOCX)</label>
                                    <input
                                        type="file"
                                        name="letterFile"
                                        accept=".pdf,.doc,.docx"
                                        onChange={handleIntentFormChange}
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end space-x-3 mt-6">
                                <button
                                    type="button"
                                    onClick={() => setShowIntentModal(false)}
                                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading || (intentForm.sendTo === 'selected' && selectedSupplierIds.length === 0)}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading ? (
                                        <>
                                            <i className="fas fa-spinner fa-spin mr-2"></i>
                                            Sending...
                                        </>
                                    ) : (
                                        <>
                                            <i className="fas fa-paper-plane mr-2"></i>
                                            Send Letter of Intent
                                        </>
                                    )}
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="px-4 py-2 bg-blue-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {loading ? (
                                        <>
                                            <i className="fas fa-spinner fa-spin mr-2"></i>
                                            Sending...
                                        </>
                                    ) : (
                                        <>
                                            <i className="fas fa-paper-plane mr-2"></i>
                                            Send Letter of Intent
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Letter of Award Modal */}
            {showAwardModal && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                    <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-2/3 shadow-lg rounded-md bg-white">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-gray-900">
                                <i className="fas fa-trophy mr-2 text-green-600"></i>
                                Send Letter of Award
                            </h3>
                            <button
                                onClick={() => setShowAwardModal(false)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        <form onSubmit={handleSendAward}>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Letter Title</label>
                                    <input
                                        type="text"
                                        value={awardForm.letterTitle}
                                        onChange={(e) => setAwardForm({...awardForm, letterTitle: e.target.value})}
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Letter Content</label>
                                    <textarea
                                        value={awardForm.letterContent}
                                        onChange={(e) => setAwardForm({...awardForm, letterContent: e.target.value})}
                                        rows={4}
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                        placeholder="Additional content for the email body..."
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700">
                                        Select Suppliers for Award ({selectedAwardSupplierIds.length} selected)
                                    </label>
                                    <div className="mt-2 max-h-48 overflow-y-auto border border-gray-300 rounded-md p-3 bg-gray-50">
                                        {selectedSuppliersForAward.length === 0 ? (
                                            <p className="text-gray-500 text-sm text-center py-4">Loading suppliers...</p>
                                        ) : (
                                            selectedSuppliersForAward.map((supplier) => (
                                                <label key={supplier.supplier_id} className="flex items-center space-x-3 py-2 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedAwardSupplierIds.includes(supplier.supplier_id)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setSelectedAwardSupplierIds([...selectedAwardSupplierIds, supplier.supplier_id]);
                                                            } else {
                                                                setSelectedAwardSupplierIds(selectedAwardSupplierIds.filter(id => id !== supplier.supplier_id));
                                                            }
                                                        }}
                                                        className="rounded border-gray-300 text-indigo-600 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                                                    />
                                                    <div className="flex-1">
                                                        <div className="text-sm font-medium text-gray-900">
                                                            {supplier.business_name || supplier.supplier_name}
                                                        </div>
                                                        <div className="text-xs text-gray-500">
                                                            {supplier.supplier_email}
                                                        </div>
                                                        <div className="text-xs text-gray-400">
                                                            Intent sent: {new Date(supplier.sent_at).toLocaleDateString()}
                                                        </div>
                                                    </div>
                                                </label>
                                            ))
                                        )}
                                        {selectedSuppliersForAward.length > 0 && selectedAwardSupplierIds.length === 0 && (
                                            <p className="text-xs text-red-500 mt-2 text-center">Please select at least one supplier</p>
                                        )}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Letter File (PDF/DOC/DOCX)</label>
                                    <input
                                        type="file"
                                        accept=".pdf,.doc,.docx"
                                        onChange={(e) => setAwardForm({...awardForm, letterFile: e.target.files[0]})}
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end space-x-3 mt-6">
                                <button
                                    type="button"
                                    onClick={() => setShowAwardModal(false)}
                                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading || selectedAwardSupplierIds.length === 0}
                                    className="px-4 py-2 bg-green-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading ? (
                                        <>
                                            <i className="fas fa-spinner fa-spin mr-2"></i>
                                            Sending...
                                        </>
                                    ) : (
                                        <>
                                            <i className="fas fa-trophy mr-2"></i>
                                            Send Letter of Award
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LetterManagement;

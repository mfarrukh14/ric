import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { apiUrl } from '../../config/api';

import { formatDate, formatDateTime } from '../../lib/time';
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
    
    // Purchase Order modal states
    const [showPOModal, setShowPOModal] = useState(false);
    const [selectedLetterForPO, setSelectedLetterForPO] = useState(null);
    const [awardedSuppliersForPO, setAwardedSuppliersForPO] = useState([]);
    const [selectedSupplierForPO, setSelectedSupplierForPO] = useState(null);
    const [existingPOs, setExistingPOs] = useState([]);
    const [poItems, setPOItems] = useState([]);
    const [poRemarks, setPORemarks] = useState('');
    const [poDeliveryDate, setPODeliveryDate] = useState('');
    const [poPaymentTerms, setPOPaymentTerms] = useState('');
    const [poBillingAddress, setPOBillingAddress] = useState('');
    const [poShippingAddress, setPOShippingAddress] = useState('');
    const [poContactName, setPOContactName] = useState('');
    const [poContactPhone, setPOContactPhone] = useState('');
    const [poContactEmail, setPOContactEmail] = useState('');
    const [poReferenceNo, setPOReferenceNo] = useState('');
    const [loadingPO, setLoadingPO] = useState(false);
    
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
            const response = await fetch(`${apiUrl}/letters/intent/ready-tenders`, {
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
            const response = await fetch(`${apiUrl}/letters`, {
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
            const response = await fetch(`${apiUrl}/letters/intent/recipients/${tenderId}`, {
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

            const response = await fetch(`${apiUrl}/letters/intent/send/${selectedTender.id}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            if (!response.ok) throw new Error('Failed to send letter of intent');
            
            const data = await response.json();
            toast.success(
                `Letter of intent sent. 
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

            const response = await fetch(`${apiUrl}/letters/award/send/${selectedTender.id}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            if (!response.ok) throw new Error('Failed to send letter of award');
            
            const data = await response.json();
            toast.success(data?.message || 'Letter of Award sent');

            setShowAwardModal(false);
            setAwardForm({ letterTitle: '', letterContent: '', letterFile: null, awardDetails: {} });
            setSelectedTender(null);
            setSelectedSuppliersForAward([]);
            setSelectedAwardSupplierIds([]);
            
            fetchTendersForIntent();
            fetchAllLetters();
        } catch (error) {
            console.error('Error sending letter of award:', error);
            toast.error(error?.message || 'Failed to queue letter of award');
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
            const response = await fetch(`${apiUrl}/letters/intent/suppliers/${tenderId}`, {
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
            const response = await fetch(`${apiUrl}/letters/${letterId}/download`, {
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

    // Purchase Order functions
    const openPOModal = async (letter) => {
        setSelectedLetterForPO(letter);
        setLoadingPO(true);
        setShowPOModal(true);
        setPODeliveryDate('');
        setPOPaymentTerms('');
        setPOBillingAddress('');
        setPOShippingAddress('');
        setPOContactName('');
        setPOContactPhone('');
        setPOContactEmail('');
        setPOReferenceNo('');
        
        try {
            const token = localStorage.getItem('token');
            
            // Fetch awarded suppliers for this tender
            const suppliersResponse = await fetch(
                `${apiUrl}/purchase-orders/tender/${letter.tender_id}/awarded-suppliers`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );
            
            if (!suppliersResponse.ok) throw new Error('Failed to fetch awarded suppliers');
            const suppliers = await suppliersResponse.json();
            setAwardedSuppliersForPO(suppliers);
            
            // Fetch existing POs for this award letter
            const posResponse = await fetch(
                `${apiUrl}/purchase-orders/award-letter/${letter.id}`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );
            
            if (!posResponse.ok) throw new Error('Failed to fetch existing POs');
            const pos = await posResponse.json();
            setExistingPOs(pos);
            
        } catch (error) {
            console.error('Error loading PO data:', error);
            toast.error('Failed to load data for Purchase Order');
        } finally {
            setLoadingPO(false);
        }
    };

    const handleSupplierSelectForPO = (supplier) => {
        setSelectedSupplierForPO(supplier);
        // Initialize PO items from awarded items
        const awardedItems = supplier.awarded_items || [];
        const initialItems = awardedItems.map(item => ({
            itemId: item.itemId || item.id,
            itemName: item.itemName || item.name || item.item_name,
            unitPrice: Number(item.unitPrice || item.unit_price || 0),
            awardedQuantity: Number(item.quantity || item.awarded_quantity || 0),
            quantity: Number(item.quantity || item.awarded_quantity || 0)
        }));
        if (initialItems.length === 0) {
            initialItems.push({
                itemId: null,
                itemName: '',
                unitPrice: 0,
                awardedQuantity: 0,
                quantity: 0
            });
        }
        setPOItems(initialItems);
        setPORemarks('');
    };

    const handlePOItemQuantityChange = (index, quantity) => {
        const updatedItems = [...poItems];
        updatedItems[index].quantity = parseInt(quantity) || 0;
        setPOItems(updatedItems);
    };

    const handlePOItemUnitPriceChange = (index, unitPrice) => {
        const updatedItems = [...poItems];
        updatedItems[index].unitPrice = parseFloat(unitPrice) || 0;
        setPOItems(updatedItems);
    };

    const handlePOItemNameChange = (index, name) => {
        const updatedItems = [...poItems];
        updatedItems[index].itemName = name;
        setPOItems(updatedItems);
    };

    const addPOItem = () => {
        setPOItems((prev) => ([
            ...prev,
            { itemId: null, itemName: '', unitPrice: 0, awardedQuantity: 0, quantity: 0 }
        ]));
    };

    const removePOItem = (index) => {
        setPOItems((prev) => prev.filter((_, i) => i !== index));
    };

    const handleCreatePO = async () => {
        if (!selectedSupplierForPO) {
            toast.error('Please select a supplier');
            return;
        }

        const itemsWithQuantity = poItems.filter(item => item.quantity > 0);
        if (itemsWithQuantity.length === 0) {
            toast.error('Please enter quantity for at least one item');
            return;
        }

        try {
            setLoadingPO(true);
            const token = localStorage.getItem('token');
            
            const response = await fetch(`${apiUrl}/purchase-orders`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    tenderId: selectedLetterForPO.tender_id,
                    awardLetterId: selectedLetterForPO.id,
                    supplierId: selectedSupplierForPO.supplier_id,
                    items: itemsWithQuantity,
                    remarks: poRemarks,
                    deliveryDate: poDeliveryDate || null,
                    paymentTerms: poPaymentTerms || null,
                    billingAddress: poBillingAddress || null,
                    shippingAddress: poShippingAddress || null,
                    contactName: poContactName || null,
                    contactPhone: poContactPhone || null,
                    contactEmail: poContactEmail || null,
                    referenceNo: poReferenceNo || null
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to create Purchase Order');
            }

            const data = await response.json();
            toast.success(`Purchase Order ${data.purchaseOrder.poNumber} created.`);
            
            // Refresh existing POs list
            const posResponse = await fetch(
                `${apiUrl}/purchase-orders/award-letter/${selectedLetterForPO.id}`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );
            if (posResponse.ok) {
                const pos = await posResponse.json();
                setExistingPOs(pos);
            }
            
            // Reset form
            setSelectedSupplierForPO(null);
            setPOItems([]);
            setPORemarks('');
            setPODeliveryDate('');
            setPOPaymentTerms('');
            setPOBillingAddress('');
            setPOShippingAddress('');
            setPOContactName('');
            setPOContactPhone('');
            setPOContactEmail('');
            setPOReferenceNo('');
            
        } catch (error) {
            console.error('Error creating PO:', error);
            toast.error(error.message || 'Failed to create Purchase Order');
        } finally {
            setLoadingPO(false);
        }
    };

    const closePOModal = () => {
        setShowPOModal(false);
        setSelectedLetterForPO(null);
        setAwardedSuppliersForPO([]);
        setSelectedSupplierForPO(null);
        setExistingPOs([]);
        setPOItems([]);
        setPORemarks('');
        setPODeliveryDate('');
        setPOPaymentTerms('');
        setPOBillingAddress('');
        setPOShippingAddress('');
        setPOContactName('');
        setPOContactPhone('');
        setPOContactEmail('');
        setPOReferenceNo('');
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
                        Send letter of intent
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
                        Send letter of award
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
                        All letters ({allLetters.length})
                    </button>
                </nav>
            </div>

            {/* Send Letter of Intent Tab */}
            {activeLetterTab === 'send-intent' && (
                <div className="ui-panel">
                    <div className="px-4 py-5 sm:p-6">
                        <h3 className="text-lg font-medium text-gray-900 mb-4">
                            <i className="fas fa-paper-plane mr-2 text-blue-600"></i>
                            Send letter of intent
                        </h3>

                        {tendersForIntent.length === 0 ? (
                            <div className="text-center py-8">
                                <i className="fas fa-inbox text-gray-400 text-4xl mb-4"></i>
                                <p className="text-gray-500">No tenders available for Letter of Intent.</p>
                                <p className="text-sm text-gray-400">Complete financial opening first.</p>
                            </div>
                        ) : (
                            <div className="grid gap-4">
                                {tendersForIntent.map((tender) => (
                                    <div key={tender.id} className="ui-card">
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
                                                        Financial opened: {formatDateTime(tender.financial_opened_at)}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="ml-4">
                                                {tender.intent_letter_sent ? (
                                                    <div className="text-center">
                                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100">
                                                            <i className="fas fa-check mr-1"></i>
                                                            Intent Sent
                                                        </span>
                                                        <p className="text-xs text-gray-500 mt-1">
                                                            {formatDateTime(tender.intent_sent_at)}
                                                        </p>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => openIntentModal(tender)}
                                                        className="ui-btn ui-btn--primary"
                                                    >
                                                        <i className="fas fa-paper-plane mr-2"></i>
                                                        Send intent
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
                <div className="ui-panel">
                    <div className="px-4 py-5 sm:p-6">
                        <h3 className="text-lg font-medium text-gray-900 mb-4">
                            <i className="fas fa-trophy mr-2 text-green-600"></i>
                            Send letter of award
                        </h3>

                        {tendersForAward.length === 0 ? (
                            <div className="text-center py-8">
                                <i className="fas fa-trophy text-gray-400 text-4xl mb-4"></i>
                                <p className="text-gray-500">No tenders available for Letter of Award.</p>
                                <p className="text-sm text-gray-400">Send Letter of Intent first.</p>
                            </div>
                        ) : (
                            <div className="grid gap-4">
                                {tendersForAward.map((tender) => (
                                    <div key={tender.id} className="ui-card">
                                        <div className="flex justify-between items-start">
                                            <div className="flex-1">
                                                <h4 className="font-medium text-gray-900">
                                                    {tender.tender_number} - {tender.item_name}
                                                </h4>
                                                <p className="text-sm text-gray-600 mt-1">{tender.description}</p>
                                                <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-500">
                                                    <span>
                                                        <i className="fas fa-check-circle mr-1 text-green-500"></i>
                                                        Intent sent: {formatDateTime(tender.intent_sent_at)}
                                                    </span>
                                                    {tender.tender_status === 'award_pending' && (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800">
                                                            <i className="fas fa-clock mr-1"></i>
                                                            Pending Send
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="ml-4">
                                                <button
                                                    onClick={() => openAwardModal(tender)}
                                                    className="ui-btn ui-btn--primary"
                                                >
                                                    <i className="fas fa-trophy mr-2"></i>
                                                    Send award
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
                <div className="ui-panel">
                    <div className="px-4 py-5 sm:p-6">
                        <h3 className="text-lg font-medium text-gray-900 mb-4">
                            <i className="fas fa-envelope mr-2 text-gray-600"></i>
                            All letters history
                        </h3>

                        {allLetters.length === 0 ? (
                            <div className="text-center py-8">
                                <i className="fas fa-envelope-open text-gray-400 text-4xl mb-4"></i>
                                <p className="text-gray-500">No letters sent yet.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="ui-table">
                                    <thead>
                                        <tr>
                                            <th className="text-left">
                                                Letter details
                                            </th>
                                            <th className="text-left">
                                                Type
                                            </th>
                                            <th className="text-left">
                                                Recipients
                                            </th>
                                            <th className="text-left">
                                                Status
                                            </th>
                                            <th className="text-left">
                                                Sent date
                                            </th>
                                            <th className="text-left">
                                                Actions
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {allLetters.map((letter) => (
                                            <tr key={letter.id}>
                                                <td className="whitespace-nowrap">
                                                    <div>
                                                        <div className="text-sm font-medium text-gray-900">
                                                            {letter.letter_title}
                                                        </div>
                                                        <div className="text-sm text-gray-500">
                                                            {letter.tender_number} - {letter.tender_title}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="whitespace-nowrap">
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                                        letter.letter_type === 'intent' 
                                                            ? 'bg-blue-100 text-blue-800' 
                                                            : 'bg-green-100 text-green-800'
                                                    }`}>
                                                        <i className={`fas ${letter.letter_type === 'intent' ? 'fa-paper-plane' : 'fa-trophy'} mr-1`}></i>
                                                        {letter.letter_type === 'intent' ? 'Intent' : 'Award'}
                                                    </span>
                                                </td>
                                                <td className="whitespace-nowrap">
                                                    {letter.total_recipients} recipients
                                                </td>
                                                <td className="whitespace-nowrap">
                                                    <div className="text-xs">
                                                        {letter.letter_type === 'award' && !letter.sent_at ? (
                                                            <div className="text-yellow-700">
                                                                <i className="fas fa-clock mr-1"></i>
                                                                Pending Send
                                                            </div>
                                                        ) : (
                                                            <>
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
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="whitespace-nowrap">
                                                    {formatDateTime(letter.sent_at)}
                                                </td>
                                                <td className="whitespace-nowrap">
                                                    <button
                                                        onClick={() => downloadLetter(letter.id, letter.letter_original_name)}
                                                        className="ui-btn ui-btn--ghost ui-btn--sm mr-3"
                                                    >
                                                        <i className="fas fa-download mr-1"></i>
                                                        Download
                                                    </button>
                                                    {letter.letter_type === 'award' && (
                                                        <button
                                                            onClick={() => openPOModal(letter)}
                                                            className="ui-btn ui-btn--ghost ui-btn--sm ml-2"
                                                        >
                                                            <i className="fas fa-file-invoice mr-1"></i>
                                                            Create PO
                                                        </button>
                                                    )}
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
                <div className="ui-scrim">
                    <div className="ui-dialog ui-dialog--legacy ui-dialog--lg">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-gray-900">
                                <i className="fas fa-paper-plane mr-2 text-blue-600"></i>
                                Send letter of intent
                            </h3>
                            <button
                                onClick={() => setShowIntentModal(false)}
                                className="ui-btn ui-btn--ghost ui-btn--sm"
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        <form onSubmit={handleSendIntent}>
                            <div className="space-y-4">
                                <div>
                                    <label className="ui-label block">Letter title</label>
                                    <input
                                        type="text"
                                        value={intentForm.letterTitle}
                                        onChange={(e) => setIntentForm({...intentForm, letterTitle: e.target.value})}
                                        className="ui-input mt-1"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="ui-label block">Letter content</label>
                                    <textarea
                                        value={intentForm.letterContent}
                                        onChange={(e) => setIntentForm({...intentForm, letterContent: e.target.value})}
                                        rows={4}
                                        className="ui-input ui-textarea mt-1"
                                        placeholder="Additional content for the email body..."
                                    />
                                </div>

                                <div>
                                    <label className="ui-label block">Send to</label>
                                    <select
                                        value={intentForm.sendTo}
                                        onChange={handleIntentFormChange}
                                        name="sendTo"
                                        className="ui-input mt-1"
                                    >
                                        <option value="all">All Approved Suppliers</option>
                                        <option value="selected">Selected Suppliers</option>
                                    </select>
                                </div>

                                {/* Supplier Selection Section */}
                                {intentForm.sendTo === 'selected' && (
                                    <div>
                                        <label className="ui-label block mb-2">
                                            Select suppliers ({selectedSupplierIds.length} selected)
                                        </label>
                                        <div className="ui-callout max-h-40 overflow-y-auto">
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
                                    <label className="ui-label block">Letter file (PDF/DOC/DOCX)</label>
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
                                    className="ui-btn ui-btn--secondary"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading || (intentForm.sendTo === 'selected' && selectedSupplierIds.length === 0)}
                                    className="ui-btn ui-btn--primary"
                                >
                                    {loading ? (
                                        <>
                                            <i className="fas fa-spinner fa-spin mr-2"></i>
                                            Sending...
                                        </>
                                    ) : (
                                        <>
                                            <i className="fas fa-paper-plane mr-2"></i>
                                            Send letter of intent
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
                <div className="ui-scrim">
                    <div className="ui-dialog ui-dialog--legacy ui-dialog--lg">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-gray-900">
                                <i className="fas fa-trophy mr-2 text-green-600"></i>
                                Send letter of award
                            </h3>
                            <button
                                onClick={() => setShowAwardModal(false)}
                                className="ui-btn ui-btn--ghost ui-btn--sm"
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        <form onSubmit={handleSendAward}>
                            <div className="space-y-4">
                                <div>
                                    <label className="ui-label block">Letter title</label>
                                    <input
                                        type="text"
                                        value={awardForm.letterTitle}
                                        onChange={(e) => setAwardForm({...awardForm, letterTitle: e.target.value})}
                                        className="ui-input mt-1"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="ui-label block">Letter content</label>
                                    <textarea
                                        value={awardForm.letterContent}
                                        onChange={(e) => setAwardForm({...awardForm, letterContent: e.target.value})}
                                        rows={4}
                                        className="ui-input ui-textarea mt-1"
                                        placeholder="Additional content for the email body..."
                                    />
                                </div>

                                <div>
                                    <label className="ui-label block">
                                        Select suppliers for award ({selectedAwardSupplierIds.length} selected)
                                    </label>
                                    <div className="ui-callout mt-2 max-h-48 overflow-y-auto">
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
                                                            Intent sent: {formatDate(supplier.sent_at)}
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
                                    <label className="ui-label block">Letter file (PDF/DOC/DOCX)</label>
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
                                    className="ui-btn ui-btn--secondary"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading || selectedAwardSupplierIds.length === 0}
                                    className="ui-btn ui-btn--primary"
                                >
                                    {loading ? (
                                        <>
                                            <i className="fas fa-spinner fa-spin mr-2"></i>
                                            Sending...
                                        </>
                                    ) : (
                                        <>
                                            <i className="fas fa-trophy mr-2"></i>
                                            Send letter of award
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Purchase Order Modal */}
            {showPOModal && (
                <div className="ui-scrim">
                    <div className="ui-dialog ui-dialog--legacy ui-dialog--lg overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-gray-900">
                                <i className="fas fa-file-invoice mr-2 text-green-600"></i>
                                Create purchase order
                            </h3>
                            <button
                                onClick={closePOModal}
                                className="ui-btn ui-btn--ghost ui-btn--sm"
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        {loadingPO ? (
                            <div className="text-center py-8">
                                <i className="fas fa-spinner fa-spin text-3xl text-gray-400 mb-4"></i>
                                <p className="text-gray-500">Loading...</p>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {/* Letter Info */}
                                {selectedLetterForPO && (
                                    <div className="ui-callout">
                                        <h4 className="font-medium text-gray-900">{selectedLetterForPO.letter_title}</h4>
                                        <p className="text-sm text-gray-600 mt-1">
                                            Tender: {selectedLetterForPO.tender_number} - {selectedLetterForPO.tender_title}
                                        </p>
                                    </div>
                                )}

                                {/* PO Details */}
                                <div className="ui-card">
                                    <h4 className="font-medium text-gray-900 mb-3">
                                        <i className="fas fa-clipboard-list mr-2 text-indigo-600"></i>
                                        Purchase order details
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="ui-label block">PO date</label>
                                            <input
                                                type="text"
                                                value={formatDate(new Date())}
                                                readOnly
                                                className="ui-input mt-1"
                                            />
                                        </div>
                                        <div>
                                            <label className="ui-label block">Delivery date</label>
                                            <input
                                                type="date"
                                                value={poDeliveryDate}
                                                onChange={(e) => setPODeliveryDate(e.target.value)}
                                                className="ui-input mt-1"
                                            />
                                        </div>
                                        <div>
                                            <label className="ui-label block">Payment terms</label>
                                            <input
                                                type="text"
                                                value={poPaymentTerms}
                                                onChange={(e) => setPOPaymentTerms(e.target.value)}
                                                placeholder="e.g., Net 30 days"
                                                className="ui-input mt-1"
                                            />
                                        </div>
                                        <div>
                                            <label className="ui-label block">Reference no</label>
                                            <input
                                                type="text"
                                                value={poReferenceNo}
                                                onChange={(e) => setPOReferenceNo(e.target.value)}
                                                placeholder="Internal reference or file number"
                                                className="ui-input mt-1"
                                            />
                                        </div>
                                        <div>
                                            <label className="ui-label block">Billing address</label>
                                            <textarea
                                                value={poBillingAddress}
                                                onChange={(e) => setPOBillingAddress(e.target.value)}
                                                rows={2}
                                                className="ui-input ui-textarea mt-1"
                                                placeholder="Billing address"
                                            />
                                        </div>
                                        <div>
                                            <label className="ui-label block">Delivery address</label>
                                            <textarea
                                                value={poShippingAddress}
                                                onChange={(e) => setPOShippingAddress(e.target.value)}
                                                rows={2}
                                                className="ui-input ui-textarea mt-1"
                                                placeholder="Delivery address"
                                            />
                                        </div>
                                        <div>
                                            <label className="ui-label block">Contact name</label>
                                            <input
                                                type="text"
                                                value={poContactName}
                                                onChange={(e) => setPOContactName(e.target.value)}
                                                placeholder="Contact person"
                                                className="ui-input mt-1"
                                            />
                                        </div>
                                        <div>
                                            <label className="ui-label block">Contact phone</label>
                                            <input
                                                type="text"
                                                value={poContactPhone}
                                                onChange={(e) => setPOContactPhone(e.target.value)}
                                                placeholder="Contact phone"
                                                className="ui-input mt-1"
                                            />
                                        </div>
                                        <div>
                                            <label className="ui-label block">Contact email</label>
                                            <input
                                                type="email"
                                                value={poContactEmail}
                                                onChange={(e) => setPOContactEmail(e.target.value)}
                                                placeholder="Contact email"
                                                className="ui-input mt-1"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Existing POs */}
                                {existingPOs.length > 0 && (
                                    <div className="ui-card">
                                        <h4 className="font-medium text-gray-900 mb-3">
                                            <i className="fas fa-history mr-2 text-blue-600"></i>
                                            Existing purchase orders ({existingPOs.length})
                                        </h4>
                                        <div className="space-y-2">
                                            {existingPOs.map((po) => (
                                                <div key={po.id} className="ui-callout flex justify-between items-center">
                                                    <div>
                                                        <span className="font-medium">{po.po_number}</span>
                                                        <span className="text-sm text-gray-600 ml-3">{po.supplier_name}</span>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="text-sm font-medium">Rs {Number(po.total_amount).toLocaleString()}</span>
                                                        <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                                                            po.status === 'created' ? 'bg-yellow-100 text-yellow-800' :
                                                            po.status === 'sent' ? 'bg-blue-100 text-blue-800' :
                                                            po.status === 'fulfilled' ? 'bg-green-100 text-green-800' :
                                                            'bg-gray-100 text-gray-800'
                                                        }`}>
                                                            {po.status}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Select Supplier */}
                                <div>
                                    <label className="ui-label block mb-2">
                                        Select supplier for new PO
                                    </label>
                                    <div className="grid gap-2">
                                        {awardedSuppliersForPO.map((supplier) => (
                                            <div
                                                key={supplier.supplier_id}
                                                onClick={() => handleSupplierSelectForPO(supplier)}
                                                className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                                                    selectedSupplierForPO?.supplier_id === supplier.supplier_id
                                                        ? 'border-green-500 bg-green-50'
                                                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                                }`}
                                            >
                                                <div className="flex justify-between items-center">
                                                    <div>
                                                        <div className="font-medium text-gray-900">{supplier.supplier_name}</div>
                                                        <div className="text-sm text-gray-500">{supplier.supplier_email}</div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-sm font-medium">
                                                            Award: Rs {Number(supplier.award_amount).toLocaleString()}
                                                        </div>
                                                        <div className="text-xs text-gray-500">
                                                            {(supplier.awarded_items || []).length} items
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* PO Items - show when supplier is selected */}
                                {selectedSupplierForPO && (
                                    <div>
                                        <label className="ui-label block mb-2">
                                            Enter quantities for items
                                        </label>
                                        <div className="border border-gray-200 rounded-lg overflow-hidden">
                                            <table className="ui-table">
                                                <thead>
                                                    <tr>
                                                        <th className="text-left">Item</th>
                                                        <th className="text-left">Unit price</th>
                                                        <th className="text-left">Awarded qty</th>
                                                        <th className="text-left">PO quantity</th>
                                                        <th className="text-left">Total</th>
                                                        <th className="text-left">Action</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {poItems.map((item, index) => (
                                                        <tr key={index}>
                                                            <td>
                                                                <input
                                                                    type="text"
                                                                    value={item.itemName}
                                                                    onChange={(e) => handlePOItemNameChange(index, e.target.value)}
                                                                    className="ui-input"
                                                                    placeholder="Item name"
                                                                />
                                                            </td>
                                                            <td>
                                                                <div className="flex items-center space-x-2">
                                                                    <span className="text-xs text-gray-500">Rs</span>
                                                                    <input
                                                                        type="number"
                                                                        min="0"
                                                                        step="0.01"
                                                                        value={item.unitPrice}
                                                                        onChange={(e) => handlePOItemUnitPriceChange(index, e.target.value)}
                                                                        className="ui-input w-28"
                                                                    />
                                                                </div>
                                                            </td>
                                                            <td>{item.awardedQuantity}</td>
                                                            <td>
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    max={item.awardedQuantity > 0 ? item.awardedQuantity : undefined}
                                                                    value={item.quantity}
                                                                    onChange={(e) => handlePOItemQuantityChange(index, e.target.value)}
                                                                    className="ui-input w-24"
                                                                />
                                                            </td>
                                                            <td>
                                                                Rs {(item.quantity * item.unitPrice).toLocaleString()}
                                                            </td>
                                                            <td>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => removePOItem(index)}
                                                                    className="ui-btn ui-btn--ghost ui-btn--danger ui-btn--sm"
                                                                >
                                                                    Remove
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                                <tfoot className="bg-gray-50">
                                                    <tr>
                                                        <td colSpan="4" className="text-right">Total Amount:</td>
                                                        <td>
                                                            Rs {poItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0).toLocaleString()}
                                                        </td>
                                                        <td></td>
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                        <div className="mt-3">
                                            <button
                                                type="button"
                                                onClick={addPOItem}
                                                className="ui-btn ui-btn--ghost ui-btn--sm"
                                            >
                                                <i className="fas fa-plus mr-1"></i>
                                                Add item
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Remarks */}
                                {selectedSupplierForPO && (
                                    <div>
                                        <label className="ui-label block mb-2">
                                            Remarks (optional)
                                        </label>
                                        <textarea
                                            value={poRemarks}
                                            onChange={(e) => setPORemarks(e.target.value)}
                                            rows={3}
                                            className="ui-input ui-textarea"
                                            placeholder="Add any additional notes or remarks..."
                                        />
                                    </div>
                                )}

                                {/* Action Buttons */}
                                <div className="flex justify-end space-x-3 pt-4 border-t">
                                    <button
                                        type="button"
                                        onClick={closePOModal}
                                        className="ui-btn ui-btn--secondary"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleCreatePO}
                                        disabled={
                                            loadingPO ||
                                            !selectedSupplierForPO ||
                                            poItems.filter(i => i.quantity > 0 && i.unitPrice > 0 && i.itemName.trim()).length === 0
                                        }
                                        className="ui-btn ui-btn--primary"
                                    >
                                        {loadingPO ? (
                                            <>
                                                <i className="fas fa-spinner fa-spin mr-2"></i>
                                                Creating...
                                            </>
                                        ) : (
                                            <>
                                                <i className="fas fa-file-invoice mr-2"></i>
                                                Create purchase order
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default LetterManagement;
